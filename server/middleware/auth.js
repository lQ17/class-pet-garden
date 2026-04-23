import { verifyToken } from '../utils/token.js'
import { db } from '../db.js'

export function authMiddleware(req, res, next) {
  let token = req.headers.authorization?.replace('Bearer ', '')

  const payload = verifyToken(token)

  if (!payload) {
    return res.status(401).json({ error: '未登录或登录已过期' })
  }

  req.userId = payload.userId
  next()
}

export function optionalAuthMiddleware(req, res, next) {
  let token = req.headers.authorization?.replace('Bearer ', '')

  const payload = verifyToken(token)

  if (payload) {
    req.userId = payload.userId
  }

  next()
}

export function teacherMiddleware(req, res, next) {
  const user = db.prepare('SELECT is_guest, is_admin FROM users WHERE id = ?').get(req.userId)

  if (!user) {
    return res.status(401).json({ error: '用户不存在或登录已过期' })
  }

  if (user.is_admin || !user.is_guest) {
    next()
    return
  }

  return res.status(403).json({ error: '需要老师或管理员权限' })
}
