import { verifyToken } from '../utils/token.js'
import { db } from '../db.js'

export function authMiddleware(req, res, next) {
  let token = req.headers.authorization?.replace('Bearer ', '')

  // 处理游客模式
  if (token === 'guest') {
    const guest = db.prepare('SELECT id FROM users WHERE username = ?').get('guest')
    if (guest) {
      req.userId = guest.id
      return next()
    }
    return res.status(401).json({ error: '游客模式不可用' })
  }

  const payload = verifyToken(token)

  if (!payload) {
    return res.status(401).json({ error: '未登录或登录已过期' })
  }

  req.userId = payload.userId
  next()
}

export function optionalAuthMiddleware(req, res, next) {
  let token = req.headers.authorization?.replace('Bearer ', '')

  // 处理游客模式
  if (token === 'guest') {
    const guest = db.prepare('SELECT id FROM users WHERE username = ?').get('guest')
    if (guest) {
      req.userId = guest.id
    }
    return next()
  }

  const payload = verifyToken(token)

  if (payload) {
    req.userId = payload.userId
  }

  next()
}
