import { Router } from 'express'
import { v4 as uuidv4 } from 'uuid'
import { db } from '../db.js'
import { authMiddleware } from '../middleware/auth.js'
import { verifyClassOwnership } from '../middleware/ownership.js'

const router = Router()

// 获取班级列表
router.get('/', authMiddleware, (req, res) => {
  const classes = db.prepare('SELECT * FROM classes WHERE user_id = ? ORDER BY created_at DESC').all(req.userId)
  res.json({ classes })
})

// 获取班级学生列表（包含标签）
router.get('/:classId/students', authMiddleware, (req, res) => {
  const cls = verifyClassOwnership(req.params.classId, req.userId)
  if (!cls) {
    return res.status(403).json({ error: '班级不存在或无权访问' })
  }
  
  const students = db.prepare('SELECT * FROM students WHERE class_id = ? ORDER BY name').all(req.params.classId)
  
  // 批量获取所有学生的标签
  const studentsWithTags = students.map(student => {
    const tags = db.prepare(`
      SELECT st.id, st.name, st.color, st.user_id, st.created_at
      FROM student_tags st
      JOIN student_tag_relations str ON st.id = str.tag_id
      WHERE str.student_id = ? AND st.user_id = ?
      ORDER BY str.created_at DESC
    `).all(student.id, req.userId)
    
    return { ...student, tags }
  })
  
  res.json({ students: studentsWithTags })
})

// 获取班级学生排行榜（支持时间段筛选）
router.get('/:classId/ranking', authMiddleware, (req, res) => {
  const cls = verifyClassOwnership(req.params.classId, req.userId)
  if (!cls) {
    return res.status(403).json({ error: '班级不存在或无权访问' })
  }

  const { startDate, endDate } = req.query

  // 处理排名逻辑的辅助函数
  function processRanking(students, pointsField = 'total_points') {
    const result = []
    
    // 分离有分数和零分的学生
    const scoredStudents = []
    const zeroScoreStudents = []
    
    for (const student of students) {
      const points = student[pointsField] || 0
      if (points > 0) {
        scoredStudents.push({ ...student, calculatedPoints: points })
      } else {
        zeroScoreStudents.push({ ...student, calculatedPoints: 0 })
      }
    }

    // 为有分数的学生分配排名
    let rank = 1
    let prevPoints = null
    
    for (let i = 0; i < scoredStudents.length; i++) {
      const student = scoredStudents[i]
      const currentPoints = student.calculatedPoints
      
      if (i === 0 || currentPoints < prevPoints) {
        rank = i + 1
      }
      
      result.push({
        ...student,
        total_points: currentPoints,
        rank: rank,
        isTop3: rank <= 3
      })
      
      prevPoints = currentPoints
    }

    // 为零分学生分配排名（在所有有分数学生之后）
    const zeroScoreRank = scoredStudents.length + 1
    for (const student of zeroScoreStudents) {
      result.push({
        ...student,
        total_points: 0,
        rank: zeroScoreRank,
        isTop3: false // 零分学生不能进入前3
      })
    }

    return result
  }

  // 如果提供了时间段，计算该时间段内的积分
  if (startDate && endDate) {
    const startMs = Number(startDate)
    const endMs = Number(endDate) + 24 * 60 * 60 * 1000 - 1 // 包含结束日期的最后一刻

    const studentIdWithPoints = db.prepare(`
      SELECT 
        s.id,
        s.name,
        s.student_no,
        s.pet_type,
        s.pet_level,
        s.pet_exp,
        s.pet_status,
        s.total_points,
        s.usable_points,
        s.created_at,
        COALESCE(SUM(er.points), 0) as period_points
      FROM students s
      LEFT JOIN evaluation_records er 
        ON s.id = er.student_id 
        AND er.timestamp BETWEEN ? AND ?
      WHERE s.class_id = ?
      GROUP BY s.id
      ORDER BY period_points DESC, name ASC
    `).all(startMs, endMs, req.params.classId)

    const result = processRanking(studentIdWithPoints, 'period_points')
    res.json({ ranking: result })
  } else {
    // 默认：使用全部时间的累计积分
    const students = db.prepare('SELECT * FROM students WHERE class_id = ? ORDER BY total_points DESC, name ASC').all(req.params.classId)
    const result = processRanking(students)
    res.json({ ranking: result })
  }
})

// 创建班级
router.post('/', authMiddleware, (req, res) => {
  const { name } = req.body
  const id = uuidv4()
  const now = Date.now()

  db.prepare('INSERT INTO classes (id, user_id, name, created_at, updated_at) VALUES (?, ?, ?, ?, ?)')
    .run(id, req.userId, name, now, now)

  res.json({ id, user_id: req.userId, name, created_at: now, updated_at: now })
})

// 更新班级
router.put('/:id', authMiddleware, (req, res) => {
  const { name } = req.body
  const cls = verifyClassOwnership(req.params.id, req.userId)

  if (!cls) {
    return res.status(404).json({ error: '班级不存在或无权修改' })
  }

  const now = Date.now()
  db.prepare('UPDATE classes SET name = ?, updated_at = ? WHERE id = ?').run(name, now, req.params.id)
  res.json({ success: true })
})

// 删除班级
router.delete('/:id', authMiddleware, (req, res) => {
  const cls = verifyClassOwnership(req.params.id, req.userId)
  if (!cls) {
    return res.status(404).json({ error: '班级不存在或无权删除' })
  }

  // 按外键依赖顺序删除：evaluation_records -> badges -> student_tag_relations -> students -> classes
  db.prepare('DELETE FROM evaluation_records WHERE class_id = ?').run(req.params.id)
  db.prepare('DELETE FROM badges WHERE student_id IN (SELECT id FROM students WHERE class_id = ?)').run(req.params.id)
  db.prepare('DELETE FROM student_tag_relations WHERE student_id IN (SELECT id FROM students WHERE class_id = ?)').run(req.params.id)
  db.prepare('DELETE FROM redemption_records WHERE student_id IN (SELECT id FROM students WHERE class_id = ?)').run(req.params.id)
  db.prepare('DELETE FROM students WHERE class_id = ?').run(req.params.id)
  db.prepare('DELETE FROM classes WHERE id = ?').run(req.params.id)
  res.json({ success: true })
})

export default router
