import { Router } from 'express'
import { db } from '../db.js'
import { authMiddleware, teacherMiddleware } from '../middleware/auth.js'

const router = Router()

function buildBackupPayload(userId) {
  const teacher = db.prepare(`
    SELECT id, username, revival_enabled, created_at
    FROM users
    WHERE id = ?
  `).get(userId)

  return {
    version: '3.0.0',
    exportedAt: new Date().toISOString(),
    teacher: {
      username: teacher?.username || '',
      revival_enabled: teacher?.revival_enabled || 0,
      created_at: teacher?.created_at || Date.now()
    },
    classes: db.prepare('SELECT * FROM classes WHERE user_id = ? ORDER BY created_at ASC').all(userId),
    studentUsers: db.prepare(`
      SELECT u.id, u.username, u.password_hash, u.student_id, u.class_id, u.created_at
      FROM users u
      JOIN students s ON s.user_id = u.id
      JOIN classes c ON s.class_id = c.id
      WHERE c.user_id = ? AND COALESCE(u.user_type, 'student') = 'student'
      ORDER BY u.created_at ASC
    `).all(userId),
    students: db.prepare(`
      SELECT s.*
      FROM students s
      JOIN classes c ON s.class_id = c.id
      WHERE c.user_id = ?
      ORDER BY s.created_at ASC
    `).all(userId),
    rules: db.prepare(`
      SELECT *
      FROM evaluation_rules
      WHERE user_id = ?
      ORDER BY created_at ASC
    `).all(userId),
    records: db.prepare(`
      SELECT er.*
      FROM evaluation_records er
      JOIN classes c ON er.class_id = c.id
      WHERE c.user_id = ?
      ORDER BY er.timestamp ASC
    `).all(userId),
    badges: db.prepare(`
      SELECT b.*
      FROM badges b
      JOIN students s ON b.student_id = s.id
      JOIN classes c ON s.class_id = c.id
      WHERE c.user_id = ?
      ORDER BY b.earned_at ASC
    `).all(userId),
    tags: db.prepare(`
      SELECT *
      FROM student_tags
      WHERE user_id = ?
      ORDER BY created_at ASC
    `).all(userId),
    tagRelations: db.prepare(`
      SELECT str.*
      FROM student_tag_relations str
      JOIN student_tags st ON str.tag_id = st.id
      WHERE st.user_id = ?
      ORDER BY str.created_at ASC
    `).all(userId),
    products: db.prepare(`
      SELECT *
      FROM products
      WHERE user_id = ?
      ORDER BY created_at ASC
    `).all(userId),
    redemptions: db.prepare(`
      SELECT *
      FROM redemption_records
      WHERE user_id = ?
      ORDER BY redeemed_at ASC
    `).all(userId),
    customPets: db.prepare(`
      SELECT *
      FROM custom_pets
      WHERE user_id = ?
      ORDER BY created_at ASC
    `).all(userId),
    petImageOverrides: db.prepare(`
      SELECT *
      FROM pet_image_overrides
      WHERE user_id = ?
      ORDER BY created_at ASC
    `).all(userId),
    revivalTasks: db.prepare(`
      SELECT *
      FROM revival_tasks
      WHERE user_id = ?
      ORDER BY sort_order ASC, created_at ASC
    `).all(userId),
    studentRevivalTasks: db.prepare(`
      SELECT srt.*
      FROM student_revival_tasks srt
      JOIN students s ON srt.student_id = s.id
      JOIN classes c ON s.class_id = c.id
      WHERE c.user_id = ?
      ORDER BY srt.assigned_at ASC
    `).all(userId),
    revivalRecords: db.prepare(`
      SELECT rr.*
      FROM revival_records rr
      JOIN students s ON rr.student_id = s.id
      JOIN classes c ON s.class_id = c.id
      WHERE c.user_id = ?
      ORDER BY rr.revived_at ASC
    `).all(userId)
  }
}

function validateBackupPayload(payload) {
  return !!payload
    && payload.version === '3.0.0'
    && Array.isArray(payload.classes)
    && Array.isArray(payload.studentUsers)
    && Array.isArray(payload.students)
}

function clearTeacherScopedData(userId) {
  db.prepare(`
    DELETE FROM student_tag_relations
    WHERE student_id IN (
      SELECT s.id
      FROM students s
      JOIN classes c ON s.class_id = c.id
      WHERE c.user_id = ?
    )
       OR tag_id IN (
      SELECT id FROM student_tags WHERE user_id = ?
    )
  `).run(userId, userId)

  db.prepare(`
    DELETE FROM student_revival_tasks
    WHERE student_id IN (
      SELECT s.id
      FROM students s
      JOIN classes c ON s.class_id = c.id
      WHERE c.user_id = ?
    )
  `).run(userId)

  db.prepare(`
    DELETE FROM revival_records
    WHERE student_id IN (
      SELECT s.id
      FROM students s
      JOIN classes c ON s.class_id = c.id
      WHERE c.user_id = ?
    )
  `).run(userId)

  db.prepare(`
    DELETE FROM redemption_records
    WHERE user_id = ?
  `).run(userId)

  db.prepare(`
    DELETE FROM badges
    WHERE student_id IN (
      SELECT s.id
      FROM students s
      JOIN classes c ON s.class_id = c.id
      WHERE c.user_id = ?
    )
  `).run(userId)

  db.prepare(`
    DELETE FROM evaluation_records
    WHERE class_id IN (
      SELECT id FROM classes WHERE user_id = ?
    )
  `).run(userId)

  db.prepare('DELETE FROM evaluation_rules WHERE user_id = ?').run(userId)
  db.prepare('DELETE FROM student_tags WHERE user_id = ?').run(userId)
  db.prepare('DELETE FROM products WHERE user_id = ?').run(userId)
  db.prepare('DELETE FROM pet_image_overrides WHERE user_id = ?').run(userId)
  db.prepare('DELETE FROM custom_pets WHERE user_id = ?').run(userId)
  db.prepare('DELETE FROM revival_tasks WHERE user_id = ?').run(userId)

  db.prepare(`
    DELETE FROM users
    WHERE COALESCE(user_type, 'student') = 'student'
      AND id IN (
        SELECT s.user_id
        FROM students s
        JOIN classes c ON s.class_id = c.id
        WHERE c.user_id = ? AND s.user_id IS NOT NULL
      )
  `).run(userId)

  db.prepare('DELETE FROM students WHERE class_id IN (SELECT id FROM classes WHERE user_id = ?)').run(userId)
  db.prepare('DELETE FROM classes WHERE user_id = ?').run(userId)
}

function restoreTeacherScopedData(userId, payload) {
  const teacherInfo = payload.teacher || {}
  const classes = payload.classes || []
  const studentUsers = payload.studentUsers || []
  const students = payload.students || []
  const rules = payload.rules || []
  const records = payload.records || []
  const badges = payload.badges || []
  const tags = payload.tags || []
  const tagRelations = payload.tagRelations || []
  const products = payload.products || []
  const redemptions = payload.redemptions || []
  const customPets = payload.customPets || []
  const petImageOverrides = payload.petImageOverrides || []
  const revivalTasks = payload.revivalTasks || []
  const studentRevivalTasks = payload.studentRevivalTasks || []
  const revivalRecords = payload.revivalRecords || []

  db.prepare('UPDATE users SET revival_enabled = ? WHERE id = ?').run(teacherInfo.revival_enabled ? 1 : 0, userId)

  const insertClass = db.prepare(`
    INSERT INTO classes (id, user_id, name, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?)
  `)
  for (const item of classes) {
    insertClass.run(item.id, userId, item.name, item.created_at, item.updated_at)
  }

  const insertStudentUser = db.prepare(`
    INSERT INTO users (id, username, password_hash, is_guest, is_admin, user_type, student_id, class_id, created_at)
    VALUES (?, ?, ?, 0, 0, 'student', ?, ?, ?)
  `)
  for (const item of studentUsers) {
    insertStudentUser.run(item.id, item.username, item.password_hash, item.student_id, item.class_id, item.created_at)
  }

  const insertStudent = db.prepare(`
    INSERT INTO students (
      id, class_id, user_id, name, student_no, total_points, usable_points,
      pet_type, pet_level, pet_exp, pet_status, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `)
  for (const item of students) {
    insertStudent.run(
      item.id,
      item.class_id,
      item.user_id || null,
      item.name,
      item.student_no,
      item.total_points || 0,
      item.usable_points || 0,
      item.pet_type || null,
      item.pet_level || 1,
      item.pet_exp || 0,
      item.pet_status || 'alive',
      item.created_at
    )
  }

  const insertRule = db.prepare(`
    INSERT INTO evaluation_rules (id, name, points, category, is_custom, user_id, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `)
  for (const item of rules) {
    insertRule.run(item.id, item.name, item.points, item.category, item.is_custom ? 1 : 0, userId, item.created_at)
  }

  const insertRecord = db.prepare(`
    INSERT INTO evaluation_records (id, class_id, student_id, points, usable_delta, reason, category, timestamp, user_id)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `)
  for (const item of records) {
    insertRecord.run(
      item.id,
      item.class_id,
      item.student_id,
      item.points,
      item.usable_delta ?? (item.points > 0 ? item.points : 0),
      item.reason,
      item.category,
      item.timestamp,
      userId
    )
  }

  const insertBadge = db.prepare(`
    INSERT INTO badges (id, student_id, pet_type, earned_at)
    VALUES (?, ?, ?, ?)
  `)
  for (const item of badges) {
    insertBadge.run(item.id, item.student_id, item.pet_type, item.earned_at)
  }

  const insertTag = db.prepare(`
    INSERT INTO student_tags (id, user_id, name, color, created_at)
    VALUES (?, ?, ?, ?, ?)
  `)
  for (const item of tags) {
    insertTag.run(item.id, userId, item.name, item.color, item.created_at)
  }

  const insertTagRelation = db.prepare(`
    INSERT INTO student_tag_relations (id, student_id, tag_id, created_at)
    VALUES (?, ?, ?, ?)
  `)
  for (const item of tagRelations) {
    insertTagRelation.run(item.id, item.student_id, item.tag_id, item.created_at)
  }

  const insertProduct = db.prepare(`
    INSERT INTO products (id, user_id, name, description, price, stock, image_url, is_enabled, is_deleted, sort_order, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `)
  for (const item of products) {
    insertProduct.run(
      item.id,
      userId,
      item.name,
      item.description,
      item.price,
      item.stock,
      item.image_url,
      item.is_enabled ? 1 : 0,
      item.is_deleted ? 1 : 0,
      item.sort_order || 0,
      item.created_at,
      item.updated_at
    )
  }

  const insertRedemption = db.prepare(`
    INSERT INTO redemption_records (id, user_id, student_id, product_id, product_name, price, redeemed_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `)
  for (const item of redemptions) {
    insertRedemption.run(item.id, userId, item.student_id, item.product_id, item.product_name, item.price, item.redeemed_at)
  }

  const insertCustomPet = db.prepare(`
    INSERT INTO custom_pets (id, user_id, name, category, level_images, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `)
  for (const item of customPets) {
    insertCustomPet.run(item.id, userId, item.name, item.category, item.level_images, item.created_at, item.updated_at)
  }

  const insertPetImageOverride = db.prepare(`
    INSERT INTO pet_image_overrides (id, user_id, pet_id, level_images, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `)
  for (const item of petImageOverrides) {
    insertPetImageOverride.run(item.id, userId, item.pet_id, item.level_images, item.created_at, item.updated_at)
  }

  const insertRevivalTask = db.prepare(`
    INSERT INTO revival_tasks (id, user_id, name, description, is_preset, is_enabled, sort_order, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `)
  for (const item of revivalTasks) {
    insertRevivalTask.run(
      item.id,
      userId,
      item.name,
      item.description,
      item.is_preset ? 1 : 0,
      item.is_enabled ? 1 : 0,
      item.sort_order || 0,
      item.created_at
    )
  }

  const insertStudentRevivalTask = db.prepare(`
    INSERT INTO student_revival_tasks (id, student_id, task_id, status, assigned_at, completed_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `)
  for (const item of studentRevivalTasks) {
    insertStudentRevivalTask.run(item.id, item.student_id, item.task_id, item.status || 'pending', item.assigned_at, item.completed_at || null)
  }

  const insertRevivalRecord = db.prepare(`
    INSERT INTO revival_records (id, student_id, revived_at)
    VALUES (?, ?, ?)
  `)
  for (const item of revivalRecords) {
    insertRevivalRecord.run(item.id, item.student_id, item.revived_at)
  }
}

// 导出备份
router.get('/', authMiddleware, teacherMiddleware, (req, res) => {
  const backup = buildBackupPayload(req.userId)
  res.setHeader('Content-Disposition', `attachment; filename="pet-garden-backup-${Date.now()}.json"`)
  res.json(backup)
})

// 导入备份
router.post('/', authMiddleware, teacherMiddleware, (req, res) => {
  if (!validateBackupPayload(req.body)) {
    return res.status(400).json({ error: '备份格式无效，请使用新的教师备份文件' })
  }

  try {
    db.transaction(() => {
      clearTeacherScopedData(req.userId)
      restoreTeacherScopedData(req.userId, req.body)
    })()

    res.json({ success: true, message: '数据恢复成功' })
  } catch (error) {
    console.error('Restore error:', error)
    res.status(500).json({ error: '恢复失败' })
  }
})

export default router
