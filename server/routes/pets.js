import { Router } from 'express'
import multer from 'multer'
import sharp from 'sharp'
import { v4 as uuidv4 } from 'uuid'
import { join } from 'path'
import { db } from '../db.js'
import { authMiddleware, teacherMiddleware } from '../middleware/auth.js'
import { getProductImageUrl, productImagesDir } from '../utils/productImages.js'

const router = Router()
const MAX_PET_IMAGE_SIZE = 8 * 1024 * 1024
const FALLBACK_PET_TYPE = 'orange-cat'

const upload = multer({
  limits: {
    fileSize: MAX_PET_IMAGE_SIZE,
    files: 8
  },
  fileFilter: (_req, file, cb) => {
    if (!file.mimetype.startsWith('image/')) {
      cb(new Error('只能上传图片文件'))
      return
    }

    cb(null, true)
  }
})

function buildPetFromRecord(record) {
  const rawImages = JSON.parse(record.level_images)
  const levelImages = {}

  rawImages.forEach((url, index) => {
    levelImages[index + 1] = url
  })

  return {
    id: record.id,
    name: record.name,
    category: record.category,
    image: rawImages[0] || '',
    levelImages,
    isCustom: true,
    createdAt: record.created_at,
    updatedAt: record.updated_at
  }
}

router.get('/', authMiddleware, (req, res) => {
  const pets = db.prepare(`
    SELECT id, name, category, level_images, created_at, updated_at
    FROM custom_pets
    WHERE user_id = ?
    ORDER BY created_at DESC
  `).all(req.userId)

  res.json({
    pets: pets.map(buildPetFromRecord)
  })
})

router.post('/', authMiddleware, teacherMiddleware, upload.array('images', 8), async (req, res) => {
  const { name, category } = req.body
  const files = req.files || []
  const trimmedName = typeof name === 'string' ? name.trim() : ''

  if (!trimmedName) {
    return res.status(400).json({ error: '请输入宠物名称' })
  }

  if (!['normal', 'mythical'].includes(category)) {
    return res.status(400).json({ error: '宠物类型不合法' })
  }

  if (!Array.isArray(files) || files.length !== 8) {
    return res.status(400).json({ error: '必须上传 8 张阶段图片' })
  }

  try {
    const levelImageUrls = []

    for (const file of files) {
      const filename = `${uuidv4()}.webp`
      const filepath = join(productImagesDir, filename)

      await sharp(file.buffer)
        .rotate()
        .resize(1200, 1200, {
          fit: 'inside',
          withoutEnlargement: true
        })
        .webp({ quality: 80 })
        .toFile(filepath)

      levelImageUrls.push(getProductImageUrl(filename))
    }

    const petId = `custom-${uuidv4()}`
    const now = Date.now()

    db.prepare(`
      INSERT INTO custom_pets (id, user_id, name, category, level_images, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      petId,
      req.userId,
      trimmedName,
      category,
      JSON.stringify(levelImageUrls),
      now,
      now
    )

    const pet = db.prepare(`
      SELECT id, name, category, level_images, created_at, updated_at
      FROM custom_pets
      WHERE id = ? AND user_id = ?
    `).get(petId, req.userId)

    res.json({ pet: buildPetFromRecord(pet) })
  } catch (error) {
    console.error('创建自定义宠物失败:', error)
    res.status(500).json({ error: '创建宠物失败，请稍后重试' })
  }
})

router.delete('/:id', authMiddleware, teacherMiddleware, (req, res) => {
  const petId = req.params.id
  const forceDelete = req.query.force === 'true' || req.query.force === '1'

  const pet = db.prepare(`
    SELECT id, name
    FROM custom_pets
    WHERE id = ? AND user_id = ?
  `).get(petId, req.userId)

  if (!pet) {
    return res.status(404).json({ error: '宠物不存在或无权删除' })
  }

  const usage = db.prepare(`
    SELECT COUNT(*) as count
    FROM students s
    JOIN classes c ON s.class_id = c.id
    WHERE c.user_id = ? AND s.pet_type = ?
  `).get(req.userId, petId)
  const studentCount = usage?.count || 0

  if (studentCount > 0 && !forceDelete) {
    return res.status(409).json({
      error: `该宠物正在被 ${studentCount} 名学生使用`,
      inUse: true,
      studentCount
    })
  }

  db.prepare('BEGIN TRANSACTION').run()
  try {
    if (studentCount > 0) {
      db.prepare(`
        UPDATE students
        SET pet_type = ?
        WHERE pet_type = ?
          AND class_id IN (SELECT id FROM classes WHERE user_id = ?)
      `).run(FALLBACK_PET_TYPE, petId, req.userId)
    }

    db.prepare('DELETE FROM custom_pets WHERE id = ? AND user_id = ?').run(petId, req.userId)
    db.prepare('COMMIT').run()

    res.json({
      success: true,
      deleted: petId,
      replacedStudents: studentCount > 0 ? studentCount : 0,
      fallbackPetType: FALLBACK_PET_TYPE
    })
  } catch (error) {
    db.prepare('ROLLBACK').run()
    console.error('删除自定义宠物失败:', error)
    res.status(500).json({ error: '删除宠物失败，请稍后重试' })
  }
})

router.use((error, _req, res, next) => {
  if (error instanceof multer.MulterError) {
    if (error.code === 'LIMIT_FILE_SIZE') {
      return res.status(413).json({ error: '宠物图片过大，请压缩后重试（单张不超过 8MB）' })
    }

    if (error.code === 'LIMIT_FILE_COUNT') {
      return res.status(400).json({ error: '请上传 8 张阶段图片' })
    }

    return res.status(400).json({ error: '图片上传失败，请检查文件后重试' })
  }

  if (error) {
    return res.status(400).json({ error: error.message || '图片上传失败，请检查文件后重试' })
  }

  next()
})

export default router
