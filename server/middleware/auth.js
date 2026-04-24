import { verifyToken } from '../utils/token.js'
import { db } from '../db.js'

function getUser(userId) {
  return db.prepare(`
    SELECT id, username, is_guest, is_admin, user_type, student_id, class_id
    FROM users
    WHERE id = ?
  `).get(userId)
}

export function authMiddleware(req, res, next) {
  const token = req.headers.authorization?.replace('Bearer ', '')
  const payload = verifyToken(token)

  if (!payload) {
    return res.status(401).json({ error: '未登录或登录已过期' })
  }

  const user = getUser(payload.userId)
  if (!user) {
    return res.status(401).json({ error: '用户不存在或登录已过期' })
  }

  req.userId = payload.userId
  req.user = {
    ...user,
    user_type: user.is_admin ? 'admin' : (user.user_type || 'teacher')
  }
  next()
}

export function optionalAuthMiddleware(req, _res, next) {
  const token = req.headers.authorization?.replace('Bearer ', '')
  const payload = verifyToken(token)

  if (payload) {
    const user = getUser(payload.userId)
    if (user) {
      req.userId = payload.userId
      req.user = {
        ...user,
        user_type: user.is_admin ? 'admin' : (user.user_type || 'teacher')
      }
    }
  }

  next()
}

export function teacherMiddleware(req, res, next) {
  if (req.user?.is_admin || req.user?.user_type === 'teacher') {
    next()
    return
  }

  return res.status(403).json({ error: '需要老师或管理员权限' })
}

export function readonlyStudentClassMiddleware(req, res, next) {
  const classId = req.params.classId || req.body.classId || req.query.classId

  if (req.user?.user_type !== 'student') {
    next()
    return
  }

  if (classId && classId === req.user.class_id) {
    next()
    return
  }

  return res.status(403).json({ error: '学生只能查看所在班级的数据' })
}
