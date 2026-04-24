import { Router } from 'express'
import { db } from '../db.js'
import { authMiddleware, teacherMiddleware } from '../middleware/auth.js'

const router = Router()

// 导出备份
router.get('/', authMiddleware, teacherMiddleware, (req, res) => {
  const backup = {
    version: '2.0.0',
    exportedAt: new Date().toISOString(),
    classes: db.prepare('SELECT * FROM classes WHERE user_id = ?').all(req.userId),
    students: db.prepare(`
      SELECT s.* FROM students s
      JOIN classes c ON s.class_id = c.id
      WHERE c.user_id = ?
    `).all(req.userId),
    rules: db.prepare('SELECT * FROM evaluation_rules').all(),
    records: db.prepare(`
      SELECT er.* FROM evaluation_records er
      JOIN classes c ON er.class_id = c.id
      WHERE c.user_id = ?
    `).all(req.userId),
    badges: db.prepare(`
      SELECT b.* FROM badges b
      JOIN students s ON b.student_id = s.id
      JOIN classes c ON s.class_id = c.id
      WHERE c.user_id = ?
    `).all(req.userId),
    products: db.prepare('SELECT * FROM products WHERE user_id = ?').all(req.userId),
    redemptions: db.prepare(`
      SELECT rr.* FROM redemption_records rr
      JOIN users u ON rr.user_id = u.id
      WHERE u.id = ?
    `).all(req.userId),
    customPets: db.prepare('SELECT * FROM custom_pets WHERE user_id = ?').all(req.userId),
    petImageOverrides: db.prepare('SELECT * FROM pet_image_overrides WHERE user_id = ?').all(req.userId),
    settings: db.prepare('SELECT * FROM settings').all()
  }
  res.setHeader('Content-Disposition', `attachment; filename="pet-garden-backup-${Date.now()}.json"`)
  res.json(backup)
})

// 导入备份
router.post('/', authMiddleware, teacherMiddleware, (req, res) => {
  const { classes, students, rules, records, badges, products, redemptions, customPets, petImageOverrides, settings } = req.body

  if (!classes || !students) {
    return res.status(400).json({ error: 'Invalid backup data' })
  }

  try {
    // Clear existing data for current user
    db.prepare('DELETE FROM redemption_records WHERE user_id = ?').run(req.userId)
    db.prepare('DELETE FROM products WHERE user_id = ?').run(req.userId)
    db.prepare('DELETE FROM pet_image_overrides WHERE user_id = ?').run(req.userId)
    db.prepare('DELETE FROM custom_pets WHERE user_id = ?').run(req.userId)
    db.prepare('DELETE FROM evaluation_records WHERE class_id IN (SELECT id FROM classes WHERE user_id = ?)').run(req.userId)
    db.prepare('DELETE FROM badges WHERE student_id IN (SELECT s.id FROM students s JOIN classes c ON s.class_id = c.id WHERE c.user_id = ?)').run(req.userId)
    db.prepare(`
      DELETE FROM users
      WHERE user_type = 'student'
        AND id IN (
          SELECT s.user_id
          FROM students s
          JOIN classes c ON s.class_id = c.id
          WHERE c.user_id = ? AND s.user_id IS NOT NULL
        )
    `).run(req.userId)
    db.prepare('DELETE FROM students WHERE class_id IN (SELECT id FROM classes WHERE user_id = ?)').run(req.userId)
    db.prepare('DELETE FROM classes WHERE user_id = ?').run(req.userId)

    // Restore classes (关联当前用户)
    const insertClass = db.prepare('INSERT INTO classes (id, user_id, name, created_at, updated_at) VALUES (?, ?, ?, ?, ?)')
    for (const c of classes) {
      insertClass.run(c.id, req.userId, c.name, c.created_at, c.updated_at)
    }

    // Restore students (包含 usable_points)
    const insertStudent = db.prepare('INSERT INTO students (id, class_id, name, student_no, total_points, usable_points, pet_type, pet_level, pet_exp, pet_status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
    for (const s of students) {
      insertStudent.run(
        s.id, 
        s.class_id, 
        s.name, 
        s.student_no, 
        s.total_points, 
        s.usable_points || 0,
        s.pet_type, 
        s.pet_level, 
        s.pet_exp, 
        s.pet_status || 'alive',
        s.created_at
      )
    }

    // Restore custom rules
    if (rules) {
      const insertRule = db.prepare('INSERT OR IGNORE INTO evaluation_rules (id, name, points, category, is_custom, created_at) VALUES (?, ?, ?, ?, ?, ?)')
      for (const r of rules.filter(r => r.is_custom)) {
        insertRule.run(r.id, r.name, r.points, r.category, r.is_custom, r.created_at)
      }
    }

    // Restore records
    if (records) {
      const insertRecord = db.prepare('INSERT INTO evaluation_records (id, class_id, student_id, points, usable_delta, reason, category, timestamp) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
      for (const r of records) {
        insertRecord.run(r.id, r.class_id, r.student_id, r.points, r.usable_delta ?? (r.points > 0 ? r.points : 0), r.reason, r.category, r.timestamp)
      }
    }

    // Restore badges
    if (badges) {
      const insertBadge = db.prepare('INSERT INTO badges (id, student_id, pet_type, earned_at) VALUES (?, ?, ?, ?)')
      for (const b of badges) {
        insertBadge.run(b.id, b.student_id, b.pet_type, b.earned_at)
      }
    }

    // Restore products
    if (products) {
      const insertProduct = db.prepare('INSERT INTO products (id, user_id, name, description, price, stock, image_url, is_enabled, sort_order, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
      for (const p of products) {
        insertProduct.run(
          p.id, req.userId, p.name, p.description, p.price, 
          p.stock, p.image_url, p.is_enabled, p.sort_order, 
          p.created_at, p.updated_at
        )
      }
    }

    // Restore custom pets
    if (customPets) {
      const insertCustomPet = db.prepare('INSERT INTO custom_pets (id, user_id, name, category, level_images, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
      for (const pet of customPets) {
        insertCustomPet.run(pet.id, req.userId, pet.name, pet.category, pet.level_images, pet.created_at, pet.updated_at)
      }
    }

    // Restore pet image overrides
    if (petImageOverrides) {
      const insertOverride = db.prepare('INSERT INTO pet_image_overrides (id, user_id, pet_id, level_images, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)')
      for (const override of petImageOverrides) {
        insertOverride.run(override.id, req.userId, override.pet_id, override.level_images, override.created_at, override.updated_at)
      }
    }

    // Restore redemptions
    if (redemptions) {
      const insertRedemption = db.prepare('INSERT INTO redemption_records (id, user_id, student_id, product_id, product_name, price, redeemed_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
      for (const r of redemptions) {
        insertRedemption.run(r.id, req.userId, r.student_id, r.product_id, r.product_name, r.price, r.redeemed_at)
      }
    }

    res.json({ success: true, message: '数据恢复成功' })
  } catch (error) {
    console.error('Restore error:', error)
    res.status(500).json({ error: '恢复失败' })
  }
})

export default router
