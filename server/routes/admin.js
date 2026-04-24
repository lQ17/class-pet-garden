import { Router } from 'express'
import { db } from '../db.js'
import { authMiddleware } from '../middleware/auth.js'

const router = Router()

function adminMiddleware(req, res, next) {
  const user = db.prepare('SELECT is_admin FROM users WHERE id = ?').get(req.userId)
  if (!user || !user.is_admin) {
    return res.status(403).json({ error: '需要管理员权限' })
  }
  next()
}

router.get('/teachers', authMiddleware, adminMiddleware, (req, res) => {
  const teachers = db.prepare(`
    SELECT id, username, created_at, is_admin
    FROM users
    WHERE is_admin = 0 AND COALESCE(user_type, 'teacher') = 'teacher'
    ORDER BY created_at DESC
  `).all()

  const result = teachers.map(teacher => {
    const classes = db.prepare(`
      SELECT c.id, c.name,
             (SELECT count(*) FROM students s WHERE s.class_id = c.id) as student_count,
             (SELECT count(*) FROM evaluation_records e WHERE e.class_id = c.id) as eval_count
      FROM classes c
      WHERE c.user_id = ?
      ORDER BY student_count DESC
    `).all(teacher.id)

    const totalStudents = classes.reduce((sum, c) => sum + c.student_count, 0)
    const totalEvals = classes.reduce((sum, c) => sum + c.eval_count, 0)

    const lastEval = db.prepare(`
      SELECT MAX(timestamp) as last_time
      FROM evaluation_records
      WHERE user_id = ?
    `).get(teacher.id)

    const todayEvals = db.prepare(`
      SELECT count(*) as count
      FROM evaluation_records
      WHERE user_id = ?
        AND date(timestamp/1000, 'unixepoch', 'localtime') = date('now', 'localtime')
    `).get(teacher.id)

    return {
      id: teacher.id,
      username: teacher.username,
      isAdmin: !!teacher.is_admin,
      createdAt: teacher.created_at,
      classCount: classes.length,
      totalStudents,
      totalEvals,
      lastEvalTime: lastEval?.last_time || null,
      todayEvals: todayEvals.count,
      classes
    }
  })

  result.sort((a, b) => {
    if (a.lastEvalTime === null && b.lastEvalTime === null) return 0
    if (a.lastEvalTime === null) return 1
    if (b.lastEvalTime === null) return -1
    return b.lastEvalTime - a.lastEvalTime
  })

  res.json({ teachers: result })
})

router.get('/stats', authMiddleware, adminMiddleware, (req, res) => {
  const stats = {
    teachers: db.prepare("SELECT count(*) as count FROM users WHERE COALESCE(user_type, 'teacher') = 'teacher' AND is_admin = 0").get().count,
    classes: db.prepare('SELECT count(*) as count FROM classes').get().count,
    students: db.prepare('SELECT count(*) as count FROM students').get().count,
    evaluations: db.prepare('SELECT count(*) as count FROM evaluation_records').get().count,
    todayEvaluations: db.prepare(`
      SELECT count(*) as count FROM evaluation_records 
      WHERE date(timestamp/1000, 'unixepoch', 'localtime') = date('now', 'localtime')
    `).get().count
  }

  const dailyStats = db.prepare(`
    SELECT date(timestamp/1000, 'unixepoch', 'localtime') as date, 
           count(*) as count 
    FROM evaluation_records 
    WHERE timestamp >= (strftime('%s', 'now') - 7*24*60*60) * 1000
    GROUP BY date
    ORDER BY date DESC
  `).all()

  res.json({ stats, dailyStats })
})

router.delete('/users/:id', authMiddleware, adminMiddleware, (req, res) => {
  const userId = req.params.id

  if (userId === req.userId) {
    return res.status(400).json({ error: '不能删除自己' })
  }

  const user = db.prepare('SELECT id, username, is_admin FROM users WHERE id = ?').get(userId)
  if (!user) {
    return res.status(404).json({ error: '用户不存在' })
  }

  if (user.is_admin) {
    return res.status(403).json({ error: '不能删除管理员' })
  }

  try {
    db.transaction(() => {
      const classes = db.prepare('SELECT id FROM classes WHERE user_id = ?').all(userId)
      const classIds = classes.map(c => c.id)

      if (classIds.length > 0) {
        const deleteEvals = db.prepare('DELETE FROM evaluation_records WHERE class_id IN (' + classIds.map(() => '?').join(',') + ')')
        deleteEvals.run(...classIds)

        const studentUsers = db.prepare('SELECT user_id FROM students WHERE user_id IS NOT NULL AND class_id IN (' + classIds.map(() => '?').join(',') + ')').all(...classIds)

        const deleteStudents = db.prepare('DELETE FROM students WHERE class_id IN (' + classIds.map(() => '?').join(',') + ')')
        deleteStudents.run(...classIds)

        for (const studentUser of studentUsers) {
          db.prepare('DELETE FROM users WHERE id = ? AND user_type = ?').run(studentUser.user_id, 'student')
        }

        db.prepare('DELETE FROM classes WHERE user_id = ?').run(userId)
      }

      db.prepare('DELETE FROM users WHERE id = ?').run(userId)
    })()

    res.json({ success: true, message: `已删除用户 ${user.username}` })
  } catch (err) {
    console.error('删除用户失败:', err)
    res.status(500).json({ error: '删除失败，请稍后重试' })
  }
})

router.get('/daily-stats', authMiddleware, adminMiddleware, (req, res) => {
  const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000

  const newUsers = db.prepare(`
    SELECT date(created_at/1000, 'unixepoch', 'localtime') as date, count(*) as count
    FROM users
    WHERE created_at >= ?
    GROUP BY date
  `).all(sevenDaysAgo)

  const newClasses = db.prepare(`
    SELECT date(created_at/1000, 'unixepoch', 'localtime') as date, count(*) as count
    FROM classes
    WHERE created_at >= ?
    GROUP BY date
  `).all(sevenDaysAgo)

  const newStudents = db.prepare(`
    SELECT date(created_at/1000, 'unixepoch', 'localtime') as date, count(*) as count
    FROM students
    WHERE created_at >= ?
    GROUP BY date
  `).all(sevenDaysAgo)

  const evaluations = db.prepare(`
    SELECT date(timestamp/1000, 'unixepoch', 'localtime') as date, count(*) as count
    FROM evaluation_records
    WHERE timestamp >= ?
    GROUP BY date
  `).all(sevenDaysAgo)

  const toMap = (arr) => {
    const map = {}
    arr.forEach(item => { map[item.date] = item.count })
    return map
  }

  const usersMap = toMap(newUsers)
  const classesMap = toMap(newClasses)
  const studentsMap = toMap(newStudents)
  const evalsMap = toMap(evaluations)

  const dates = []
  const now = new Date()
  
  for (let i = 6; i >= 0; i--) {
    const d = new Date(now)
    d.setDate(d.getDate() - i)
    dates.push(d.toLocaleDateString('sv-SE'))
  }

  const result = dates.map(date => ({
    date,
    newUsers: usersMap[date] || 0,
    newClasses: classesMap[date] || 0,
    newStudents: studentsMap[date] || 0,
    evaluations: evalsMap[date] || 0
  }))

  res.json({ dailyStats: result })
})

export default router
