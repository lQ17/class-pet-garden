import { Router } from 'express'
import { db } from '../db.js'
import { authMiddleware } from '../middleware/auth.js'
import multer from 'multer'
import sharp from 'sharp'
import { v4 as uuidv4 } from 'uuid'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const uploadDirPublic = join(__dirname, '..', '..', 'public', 'product-images')
const uploadDirDist = join(__dirname, '..', '..', 'dist', 'product-images')

// 确保两个目录都存在
import fs from 'fs'
try {
  if (!fs.existsSync(uploadDirPublic)) fs.mkdirSync(uploadDirPublic, { recursive: true })
  if (!fs.existsSync(uploadDirDist)) fs.mkdirSync(uploadDirDist, { recursive: true })
} catch (e) {
  console.log('创建目录失败:', e)
}

const upload = multer({
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (!file.mimetype.startsWith('image/')) {
      cb(new Error('只允许上传图片'))
    } else {
      cb(null, true)
    }
  }
})

const router = Router()

router.post('/upload-image', authMiddleware, upload.single('image'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: '请上传图片' })
  }

  try {
    const filename = `${uuidv4()}.webp`
    const filepathPublic = join(uploadDirPublic, filename)
    const filepathDist = join(uploadDirDist, filename)

    await sharp(req.file.buffer)
      .webp({ quality: 75 })
      .toFile(filepathPublic)
    
    try {
      await sharp(req.file.buffer)
        .webp({ quality: 75 })
        .toFile(filepathDist)
    } catch (e) {
      console.log('保存到dist目录失败:', e)
    }

    const imageUrl = `/pet-garden/product-images/${filename}`
    res.json({ imageUrl })
  } catch (error) {
    console.error('图片处理失败:', error)
    res.status(500).json({ error: '图片处理失败' })
  }
})

// 商品相关路由
router.get('/products', authMiddleware, (req, res) => {
  const products = db.prepare('SELECT * FROM products WHERE user_id = ? AND is_deleted = 0 ORDER BY sort_order ASC, created_at DESC').all(req.userId)
  res.json({ products })
})

router.post('/products', authMiddleware, (req, res) => {
  const { name, description, price, stock = -1, imageUrl, isEnabled = true, sortOrder = 0 } = req.body
  const id = uuidv4()
  const now = Date.now()
  db.prepare(
    'INSERT INTO products (id, user_id, name, description, price, stock, image_url, is_enabled, sort_order, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
  ).run(id, req.userId, name, description, price, stock, imageUrl || null, isEnabled ? 1 : 0, sortOrder, now, now)
  res.json({ id, name, description, price, stock, image_url: imageUrl, is_enabled: isEnabled, sort_order: sortOrder, created_at: now, updated_at: now })
})

router.put('/products/:id', authMiddleware, (req, res) => {
  const { name, description, price, stock, imageUrl, isEnabled, sortOrder } = req.body
  const now = Date.now()
  const product = db.prepare('SELECT * FROM products WHERE id = ? AND user_id = ? AND is_deleted = 0').get(req.params.id, req.userId)
  if (!product) {
    return res.status(404).json({ error: '商品不存在或无权访问' })
  }
  db.prepare(
    'UPDATE products SET name = ?, description = ?, price = ?, stock = ?, image_url = ?, is_enabled = ?, sort_order = ?, updated_at = ? WHERE id = ?'
  ).run(name, description, price, stock, imageUrl || null, isEnabled ? 1 : 0, sortOrder, now, req.params.id)
  res.json({ success: true })
})

router.delete('/products/:id', authMiddleware, (req, res) => {
  try {
    const product = db.prepare('SELECT * FROM products WHERE id = ? AND user_id = ?').get(req.params.id, req.userId)
    if (!product) {
      return res.status(404).json({ error: '商品不存在或无权访问' })
    }

    const redemptionCount = db.prepare('SELECT COUNT(*) as count FROM redemption_records WHERE product_id = ? AND user_id = ?').get(req.params.id, req.userId)
    const hasRedemptions = redemptionCount && redemptionCount.count > 0

    if (hasRedemptions) {
      const now = Date.now()
      db.prepare('UPDATE products SET is_deleted = 1, updated_at = ? WHERE id = ?').run(now, req.params.id)
      res.json({ success: true, softDeleted: true })
    } else {
      db.prepare('DELETE FROM products WHERE id = ?').run(req.params.id)
      res.json({ success: true, softDeleted: false })
    }
  } catch (error) {
    console.error('删除商品错误:', error)
    res.status(500).json({ error: '删除失败' })
  }
})

// 兑换记录相关路由
router.get('/redemptions', authMiddleware, (req, res) => {
  const { studentId, page = 1, pageSize = 20 } = req.query
  const offset = (Number(page) - 1) * Number(pageSize)

  let countQuery = 'SELECT COUNT(*) as total FROM redemption_records rr JOIN users u ON rr.user_id = u.id'
  let query = 'SELECT rr.*, s.name as student_name FROM redemption_records rr JOIN students s ON rr.student_id = s.id JOIN users u ON rr.user_id = u.id'
  const params = []
  const countParams = []

  params.push(req.userId)
  countParams.push(req.userId)

  const conditions = ['rr.user_id = ?']
  if (studentId) {
    conditions.push('rr.student_id = ?')
    params.push(studentId)
    countParams.push(studentId)
  }

  query += ' WHERE ' + conditions.join(' AND ')
  countQuery += ' WHERE ' + conditions.join(' AND ')

  const totalResult = db.prepare(countQuery).get(...countParams)
  const total = totalResult?.total || 0

  query += ' ORDER BY rr.redeemed_at DESC LIMIT ? OFFSET ?'
  params.push(Number(pageSize), offset)

  const records = db.prepare(query).all(...params)
  res.json({
    records,
    total,
    page: Number(page),
    pageSize: Number(pageSize),
    totalPages: Math.ceil(total / Number(pageSize))
  })
})

// 兑换商品
router.post('/redeem', authMiddleware, (req, res) => {
  const { studentId, productId } = req.body

  const student = db.prepare('SELECT * FROM students s JOIN classes c ON s.class_id = c.id WHERE s.id = ? AND c.user_id = ?').get(studentId, req.userId)
  if (!student) {
    return res.status(404).json({ error: '学生不存在或无权访问' })
  }

  const product = db.prepare('SELECT * FROM products WHERE id = ? AND user_id = ? AND is_deleted = 0').get(productId, req.userId)
  if (!product) {
    return res.status(404).json({ error: '商品不存在或无权访问' })
  }

  if (!product.is_enabled) {
    return res.status(400).json({ error: '该商品已下架' })
  }

  if (product.stock !== -1 && product.stock <= 0) {
    return res.status(400).json({ error: '该商品库存不足' })
  }

  if (student.usable_points < product.price) {
    return res.status(400).json({ error: '可用积分不足' })
  }

  const id = uuidv4()
  const now = Date.now()

  db.prepare('BEGIN TRANSACTION').run()
  try {
    // 扣除可用积分
    db.prepare('UPDATE students SET usable_points = usable_points - ? WHERE id = ?').run(product.price, studentId)
    
    // 减少库存（如果不是无限库存）
    if (product.stock !== -1) {
      db.prepare('UPDATE products SET stock = stock - 1 WHERE id = ?').run(productId)
    }
    
    // 记录兑换
    db.prepare(
      'INSERT INTO redemption_records (id, user_id, student_id, product_id, product_name, price, redeemed_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
    ).run(id, req.userId, studentId, productId, product.name, product.price, now)
    
    db.prepare('COMMIT').run()
    res.json({ id, success: true })
  } catch (error) {
    db.prepare('ROLLBACK').run()
    console.error('兑换失败:', error)
    res.status(500).json({ error: '兑换失败，请重试' })
  }
})

export default router
