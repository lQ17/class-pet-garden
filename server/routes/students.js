import { Router } from 'express'
import { v4 as uuidv4 } from 'uuid'
import { db } from '../db.js'
import { authMiddleware, teacherMiddleware } from '../middleware/auth.js'
import { hashPassword } from '../utils/password.js'
import { verifyClassOwnership, verifyStudentOwnership, verifyStudentsOwnership } from '../middleware/ownership.js'

const router = Router()

function normalizeStudentNo(studentNo) {
  return typeof studentNo === 'string' ? studentNo.trim() : ''
}

function ensureStudentAccountAvailable(studentNo) {
  const existingStudent = db.prepare('SELECT id FROM students WHERE id = ? OR student_no = ?').get(studentNo, studentNo)
  if (existingStudent) {
    return '该学号已存在'
  }

  const existingUser = db.prepare('SELECT id FROM users WHERE username = ?').get(studentNo)
  if (existingUser) {
    return '该学号已被账号占用'
  }

  return null
}

function createStudentWithAccount({ classId, name, studentNo, password }) {
  const now = Date.now()
  const userId = uuidv4()

  db.prepare(`
    INSERT INTO users (id, username, password_hash, is_guest, is_admin, user_type, student_id, class_id, created_at)
    VALUES (?, ?, ?, 0, 0, 'student', ?, ?, ?)
  `).run(userId, studentNo, hashPassword(password), studentNo, classId, now)

  db.prepare(`
    INSERT INTO students (
      id, class_id, user_id, name, student_no, total_points, usable_points,
      pet_level, pet_exp, pet_status, created_at
    ) VALUES (?, ?, ?, ?, ?, 0, 0, 1, 0, 'alive', ?)
  `).run(studentNo, classId, userId, name, studentNo, now)

  return {
    id: studentNo,
    class_id: classId,
    user_id: userId,
    name,
    student_no: studentNo,
    total_points: 0,
    usable_points: 0,
    pet_level: 1,
    pet_exp: 0,
    pet_status: 'alive',
    created_at: now
  }
}

router.post('/', authMiddleware, teacherMiddleware, (req, res) => {
  const { classId, name, studentNo, password } = req.body
  const trimmedName = typeof name === 'string' ? name.trim() : ''
  const normalizedStudentNo = normalizeStudentNo(studentNo)

  if (!trimmedName || !normalizedStudentNo || !password) {
    return res.status(400).json({ error: '姓名、学号、密码均为必填项' })
  }

  const cls = verifyClassOwnership(classId, req.userId)
  if (!cls) {
    return res.status(403).json({ error: '班级不存在或无权访问' })
  }

  const availabilityError = ensureStudentAccountAvailable(normalizedStudentNo)
  if (availabilityError) {
    return res.status(400).json({ error: availabilityError })
  }

  db.prepare('BEGIN TRANSACTION').run()
  try {
    const student = createStudentWithAccount({
      classId,
      name: trimmedName,
      studentNo: normalizedStudentNo,
      password
    })
    db.prepare('COMMIT').run()
    res.json(student)
  } catch (error) {
    db.prepare('ROLLBACK').run()
    console.error('添加学生失败:', error)
    res.status(500).json({ error: '添加学生失败' })
  }
})

router.put('/:id', authMiddleware, teacherMiddleware, (req, res) => {
  const { name, studentNo, password } = req.body
  const student = verifyStudentOwnership(req.params.id, req.userId)

  if (!student) {
    return res.status(404).json({ error: '学生不存在或无权访问' })
  }

  const normalizedStudentNo = normalizeStudentNo(studentNo)
  if (normalizedStudentNo && normalizedStudentNo !== student.student_no) {
    return res.status(400).json({ error: '学号是学生唯一登录 ID，暂不支持修改' })
  }

  db.prepare('BEGIN TRANSACTION').run()
  try {
    if (typeof name === 'string' && name.trim()) {
      db.prepare('UPDATE students SET name = ? WHERE id = ?').run(name.trim(), req.params.id)
    }

    if (typeof password === 'string' && password.length > 0) {
      if (password.length < 3) {
        db.prepare('ROLLBACK').run()
        return res.status(400).json({ error: '密码至少 3 位' })
      }

      if (student.user_id) {
        db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(hashPassword(password), student.user_id)
      } else {
        const legacyStudentNo = normalizeStudentNo(student.student_no)
        if (!legacyStudentNo) {
          db.prepare('ROLLBACK').run()
          return res.status(400).json({ error: '旧学生缺少学号，无法创建登录账号' })
        }

        const existingUser = db.prepare('SELECT id FROM users WHERE username = ?').get(legacyStudentNo)
        if (existingUser) {
          db.prepare('ROLLBACK').run()
          return res.status(400).json({ error: '该学号已被账号占用' })
        }

        const userId = uuidv4()
        db.prepare(`
          INSERT INTO users (id, username, password_hash, is_guest, is_admin, user_type, student_id, class_id, created_at)
          VALUES (?, ?, ?, 0, 0, 'student', ?, ?, ?)
        `).run(userId, legacyStudentNo, hashPassword(password), student.id, student.class_id, Date.now())
        db.prepare('UPDATE students SET user_id = ? WHERE id = ?').run(userId, req.params.id)
      }
    }

    db.prepare('COMMIT').run()
    res.json({ success: true })
  } catch (error) {
    db.prepare('ROLLBACK').run()
    console.error('更新学生失败:', error)
    res.status(500).json({ error: '更新学生失败' })
  }
})

router.delete('/:id', authMiddleware, teacherMiddleware, (req, res) => {
  const student = verifyStudentOwnership(req.params.id, req.userId)
  if (!student) {
    return res.status(404).json({ error: '学生不存在或无权访问' })
  }

  db.prepare('BEGIN TRANSACTION').run()
  try {
    db.prepare('DELETE FROM evaluation_records WHERE student_id = ?').run(req.params.id)
    db.prepare('DELETE FROM badges WHERE student_id = ?').run(req.params.id)
    db.prepare('DELETE FROM redemption_records WHERE student_id = ?').run(req.params.id)
    db.prepare('DELETE FROM student_tag_relations WHERE student_id = ?').run(req.params.id)
    db.prepare('DELETE FROM students WHERE id = ?').run(req.params.id)
    if (student.user_id) {
      db.prepare('DELETE FROM users WHERE id = ? AND user_type = ?').run(student.user_id, 'student')
    }
    db.prepare('COMMIT').run()
    res.json({ success: true })
  } catch (error) {
    db.prepare('ROLLBACK').run()
    console.error('删除学生失败:', error)
    res.status(500).json({ error: '删除失败' })
  }
})

router.post('/import', authMiddleware, teacherMiddleware, (req, res) => {
  const { classId, students } = req.body
  if (!classId || !students || !Array.isArray(students)) {
    return res.status(400).json({ error: 'Invalid input' })
  }

  const cls = verifyClassOwnership(classId, req.userId)
  if (!cls) {
    return res.status(403).json({ error: '班级不存在或无权访问' })
  }

  db.prepare('BEGIN TRANSACTION').run()
  try {
    let imported = 0
    const skipped = []

    for (const student of students) {
      const name = typeof student.name === 'string' ? student.name.trim() : ''
      const studentNo = normalizeStudentNo(student.studentNo)
      const password = typeof student.password === 'string' ? student.password : ''

      if (!name || !studentNo || !password) {
        skipped.push({ studentNo, reason: '姓名、学号、密码不完整' })
        continue
      }

      const availabilityError = ensureStudentAccountAvailable(studentNo)
      if (availabilityError) {
        skipped.push({ studentNo, reason: availabilityError })
        continue
      }

      createStudentWithAccount({ classId, name, studentNo, password })
      imported++
    }

    db.prepare('COMMIT').run()
    res.json({ success: true, imported, skipped })
  } catch (error) {
    db.prepare('ROLLBACK').run()
    console.error('批量导入学生失败:', error)
    res.status(500).json({ error: '批量导入学生失败' })
  }
})

router.post('/batch-delete', authMiddleware, teacherMiddleware, (req, res) => {
  const { ids } = req.body
  if (!ids || !Array.isArray(ids) || ids.length === 0) {
    return res.status(400).json({ error: '无效的学生 ID 列表' })
  }

  const { valid, students } = verifyStudentsOwnership(ids, req.userId)
  if (!valid) {
    return res.status(403).json({ error: '部分学生不存在或无权删除' })
  }

  const placeholders = ids.map(() => '?').join(',')
  const userIds = students.map(student => student.user_id).filter(Boolean)

  db.prepare('BEGIN TRANSACTION').run()
  try {
    db.prepare(`DELETE FROM evaluation_records WHERE student_id IN (${placeholders})`).run(...ids)
    db.prepare(`DELETE FROM badges WHERE student_id IN (${placeholders})`).run(...ids)
    db.prepare(`DELETE FROM redemption_records WHERE student_id IN (${placeholders})`).run(...ids)
    db.prepare(`DELETE FROM student_tag_relations WHERE student_id IN (${placeholders})`).run(...ids)
    db.prepare(`DELETE FROM students WHERE id IN (${placeholders})`).run(...ids)

    for (const userId of userIds) {
      db.prepare('DELETE FROM users WHERE id = ? AND user_type = ?').run(userId, 'student')
    }

    db.prepare('COMMIT').run()
    res.json({ success: true, deleted: ids.length })
  } catch (error) {
    db.prepare('ROLLBACK').run()
    console.error('批量删除学生失败:', error)
    res.status(500).json({ error: '批量删除学生失败' })
  }
})

router.put('/:id/pet', authMiddleware, teacherMiddleware, (req, res) => {
  const { petType } = req.body
  const now = Date.now()
  const student = verifyStudentOwnership(req.params.id, req.userId)

  if (!student) {
    return res.status(404).json({ error: '学生不存在或无权访问' })
  }

  if (student.pet_type && student.pet_level >= 8) {
    db.prepare('INSERT INTO badges (id, student_id, pet_type, earned_at) VALUES (?, ?, ?, ?)')
      .run(uuidv4(), req.params.id, student.pet_type, now)
  }

  db.prepare('UPDATE students SET pet_type = ? WHERE id = ?').run(petType, req.params.id)
  res.json({ success: true })
})

router.put('/:id/transfer', authMiddleware, teacherMiddleware, (req, res) => {
  const { targetClassId } = req.body

  if (!targetClassId) {
    return res.status(400).json({ error: '请选择目标班级' })
  }

  const student = verifyStudentOwnership(req.params.id, req.userId)
  if (!student) {
    return res.status(404).json({ error: '学生不存在或无权访问' })
  }

  const targetClass = verifyClassOwnership(targetClassId, req.userId)
  if (!targetClass) {
    return res.status(403).json({ error: '目标班级不存在或无权访问' })
  }

  if (student.class_id === targetClassId) {
    return res.status(400).json({ error: '学生已在该班级中' })
  }

  db.prepare('UPDATE students SET class_id = ? WHERE id = ?').run(targetClassId, req.params.id)
  db.prepare('UPDATE users SET class_id = ? WHERE id = ?').run(targetClassId, student.user_id)
  db.prepare('UPDATE evaluation_records SET class_id = ? WHERE student_id = ?').run(targetClassId, req.params.id)
  res.json({ success: true })
})

router.post('/batch-transfer', authMiddleware, teacherMiddleware, (req, res) => {
  const { ids, targetClassId } = req.body

  if (!ids || !Array.isArray(ids) || ids.length === 0) {
    return res.status(400).json({ error: '请选择要转班的学生' })
  }

  if (!targetClassId) {
    return res.status(400).json({ error: '请选择目标班级' })
  }

  const { valid, students } = verifyStudentsOwnership(ids, req.userId)
  if (!valid) {
    return res.status(403).json({ error: '部分学生不存在或无权访问' })
  }

  const targetClass = verifyClassOwnership(targetClassId, req.userId)
  if (!targetClass) {
    return res.status(403).json({ error: '目标班级不存在或无权访问' })
  }

  const placeholders = ids.map(() => '?').join(',')
  db.prepare(`UPDATE students SET class_id = ? WHERE id IN (${placeholders})`).run(targetClassId, ...ids)
  db.prepare(`UPDATE evaluation_records SET class_id = ? WHERE student_id IN (${placeholders})`).run(targetClassId, ...ids)

  for (const student of students) {
    if (student.user_id) {
      db.prepare('UPDATE users SET class_id = ? WHERE id = ?').run(targetClassId, student.user_id)
    }
  }

  res.json({ success: true, transferred: ids.length })
})

export default router
