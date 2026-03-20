import { Router } from 'express'
import { v4 as uuidv4 } from 'uuid'
import { db } from '../db.js'
import { authMiddleware } from '../middleware/auth.js'

const router = Router()

// 预设颜色
const PRESET_COLORS = [
  '#ef4444', // red
  '#f97316', // orange
  '#eab308', // yellow
  '#22c55e', // green
  '#14b8a6', // teal
  '#3b82f6', // blue
  '#6366f1', // indigo
  '#a855f7', // purple
  '#ec4899', // pink
  '#78716c', // stone
]

// 获取标签列表（用户隔离）
router.get('/', authMiddleware, (req, res) => {
  const tags = db.prepare(`
    SELECT * FROM student_tags
    WHERE user_id = ?
    ORDER BY created_at DESC
  `).all(req.userId)

  res.json({ tags })
})

// 添加标签
router.post('/', authMiddleware, (req, res) => {
  const { name, color } = req.body

  if (!name || !name.trim()) {
    return res.status(400).json({ error: '标签名称不能为空' })
  }

  // 检查是否重复
  const existing = db.prepare(`
    SELECT id FROM student_tags
    WHERE user_id = ? AND name = ?
  `).get(req.userId, name.trim())

  if (existing) {
    return res.status(400).json({ error: '标签名称已存在' })
  }

  const id = uuidv4()
  const tagColor = color || PRESET_COLORS[Math.floor(Math.random() * PRESET_COLORS.length)]
  const now = Date.now()

  db.prepare(`
    INSERT INTO student_tags (id, user_id, name, color, created_at)
    VALUES (?, ?, ?, ?, ?)
  `).run(id, req.userId, name.trim(), tagColor, now)

  res.json({
    id,
    name: name.trim(),
    color: tagColor,
    user_id: req.userId,
    created_at: now
  })
})

// 更新标签
router.put('/:id', authMiddleware, (req, res) => {
  const { name, color } = req.body
  const tagId = req.params.id

  // 检查标签是否属于当前用户
  const tag = db.prepare(`
    SELECT * FROM student_tags WHERE id = ? AND user_id = ?
  `).get(tagId, req.userId)

  if (!tag) {
    return res.status(404).json({ error: '标签不存在或无权修改' })
  }

  // 检查名称是否重复（排除自己）
  if (name && name.trim() !== tag.name) {
    const existing = db.prepare(`
      SELECT id FROM student_tags
      WHERE user_id = ? AND name = ? AND id != ?
    `).get(req.userId, name.trim(), tagId)

    if (existing) {
      return res.status(400).json({ error: '标签名称已存在' })
    }
  }

  const newName = name?.trim() || tag.name
  const newColor = color || tag.color

  db.prepare(`
    UPDATE student_tags
    SET name = ?, color = ?
    WHERE id = ?
  `).run(newName, newColor, tagId)

  res.json({
    id: tagId,
    name: newName,
    color: newColor,
    user_id: req.userId,
    created_at: tag.created_at
  })
})

// 删除标签
router.delete('/:id', authMiddleware, (req, res) => {
  const tagId = req.params.id

  // 检查标签是否属于当前用户
  const tag = db.prepare(`
    SELECT * FROM student_tags WHERE id = ? AND user_id = ?
  `).get(tagId, req.userId)

  if (!tag) {
    return res.status(404).json({ error: '标签不存在或无权删除' })
  }

  // 删除标签关联
  db.prepare('DELETE FROM student_tag_relations WHERE tag_id = ?').run(tagId)

  // 删除标签
  db.prepare('DELETE FROM student_tags WHERE id = ?').run(tagId)

  res.json({ success: true })
})

// 获取预设颜色
router.get('/colors', (req, res) => {
  res.json({ colors: PRESET_COLORS })
})

export default router