import { Router } from 'express'
import { v4 as uuidv4 } from 'uuid'
import { db } from '../db.js'
import { authMiddleware } from '../middleware/auth.js'

const router = Router()

// 获取规则列表（需要认证，用户隔离）
router.get('/', authMiddleware, (req, res) => {
  // 返回默认规则(is_custom=0) + 当前用户的自定义规则
  const rules = db.prepare(`
    SELECT * FROM evaluation_rules
    WHERE is_custom = 0 OR user_id = ?
    ORDER BY is_custom ASC, category, points DESC
  `).all(req.userId)
  res.json({ rules })
})

// 添加自定义规则（需要认证，关联用户）
router.post('/', authMiddleware, (req, res) => {
  const { name, points, category } = req.body
  const id = uuidv4()
  const now = Date.now()
  db.prepare('INSERT INTO evaluation_rules (id, name, points, category, is_custom, user_id, created_at) VALUES (?, ?, ?, ?, 1, ?, ?)')
    .run(id, name, points, category, req.userId, now)
  res.json({ id, name, points, category, is_custom: 1, user_id: req.userId, created_at: now })
})

// 删除自定义规则（需要认证，只能删除自己的）
router.delete('/:id', authMiddleware, (req, res) => {
  const result = db.prepare('DELETE FROM evaluation_rules WHERE id = ? AND is_custom = 1 AND user_id = ?')
    .run(req.params.id, req.userId)

  if (result.changes === 0) {
    return res.status(404).json({ error: '规则不存在或无权删除' })
  }

  res.json({ success: true })
})

export default router