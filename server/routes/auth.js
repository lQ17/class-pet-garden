import { Router } from 'express'
import { v4 as uuidv4 } from 'uuid'
import { db } from '../db.js'
import { hashPassword, verifyPassword } from '../utils/password.js'
import { generateToken } from '../utils/token.js'
import { authMiddleware } from '../middleware/auth.js'

const router = Router()

function serializeUser(user) {
  const userType = user.is_admin ? 'admin' : (user.user_type || 'teacher')
  return {
    id: user.id,
    username: user.username,
    isGuest: !!user.is_guest,
    isAdmin: !!user.is_admin,
    userType,
    studentId: user.student_id || null,
    classId: user.class_id || null
  }
}

router.post('/register', (req, res) => {
  const { username, password } = req.body

  if (!username || !password) {
    return res.status(400).json({ error: '用户名和密码不能为空' })
  }

  if (username.length < 3 || username.length > 20) {
    return res.status(400).json({ error: '用户名长度需为 3-20 个字符' })
  }

  if (password.length < 6) {
    return res.status(400).json({ error: '密码至少 6 位' })
  }

  const existingUser = db.prepare('SELECT id FROM users WHERE username = ?').get(username)
  if (existingUser) {
    return res.status(400).json({ error: '用户名已存在' })
  }

  const userId = uuidv4()
  const passwordHash = hashPassword(password)
  const now = Date.now()

  db.prepare(`
    INSERT INTO users (id, username, password_hash, is_guest, is_admin, user_type, created_at)
    VALUES (?, ?, ?, 0, 0, 'teacher', ?)
  `).run(userId, username, passwordHash, now)

  const user = db.prepare(`
    SELECT id, username, is_guest, is_admin, user_type, student_id, class_id
    FROM users
    WHERE id = ?
  `).get(userId)

  const token = generateToken(userId)
  res.json({ success: true, token, user: serializeUser(user) })
})

router.post('/login', (req, res) => {
  const { username, password } = req.body

  if (!username || !password) {
    return res.status(400).json({ error: '用户名和密码不能为空' })
  }

  const user = db.prepare(`
    SELECT id, username, password_hash, is_guest, is_admin, user_type, student_id, class_id
    FROM users
    WHERE username = ?
  `).get(username)

  if (!user || !verifyPassword(password, user.password_hash)) {
    return res.status(401).json({ error: '用户名或密码错误' })
  }

  const token = generateToken(user.id)
  res.json({ success: true, token, user: serializeUser(user) })
})

router.get('/me', authMiddleware, (req, res) => {
  res.json({ user: serializeUser(req.user) })
})

export default router
