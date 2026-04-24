import { Router } from 'express'
import multer from 'multer'
import { v4 as uuidv4 } from 'uuid'
import { db } from '../db.js'
import { authMiddleware, teacherMiddleware } from '../middleware/auth.js'
import { isSupportedImageMimeType, saveUploadedImage } from '../utils/uploadedImageStorage.js'

const router = Router()
const MAX_PET_IMAGE_SIZE = 10 * 1024 * 1024
const FALLBACK_PET_TYPE = 'orange-cat'
const STATIC_PET_IDS = new Set([
  'west-highland',
  'bichon',
  'border-collie',
  'shiba',
  'golden-retriever',
  'samoyed',
  'husky',
  'tabby-cat',
  'persian-cat',
  'ragdoll-cat',
  'orange-cat',
  'lop-rabbit',
  'angora-rabbit',
  'hamster',
  'winter-hamster',
  'call-duck',
  'alpaca',
  'red-panda',
  'corgi',
  'white-tiger',
  'unicorn',
  'azure-dragon',
  'vermilion-bird',
  'succulent-spirit',
  'pixiu',
  'suanni'
])

const upload = multer({
  limits: {
    fileSize: MAX_PET_IMAGE_SIZE,
    files: 8
  },
  fileFilter: (_req, file, cb) => {
    if (!isSupportedImageMimeType(file.mimetype)) {
      cb(new Error('只支持 JPG、PNG、WebP、GIF、AVIF、BMP 图片'))
      return
    }

    cb(null, true)
  }
})

function buildPetFromRecord(record) {
  const rawImages = JSON.parse(record.level_images)

  return {
    id: record.id,
    name: record.name,
    category: record.category,
    image: rawImages[0] || '',
    levelImages: toLevelImagesObject(rawImages),
    isCustom: true,
    createdAt: record.created_at,
    updatedAt: record.updated_at
  }
}

function toLevelImagesObject(images) {
  const levelImages = {}

  images.forEach((url, index) => {
    levelImages[index + 1] = url
  })

  return levelImages
}

function getStaticLevelImages(petId) {
  return Array.from({ length: 8 }, (_, index) => `/pet-garden/pets/${petId}/lv${index + 1}.png`)
}

function getExistingOverrideImages(userId, petId) {
  const override = db.prepare(`
    SELECT level_images
    FROM pet_image_overrides
    WHERE user_id = ? AND pet_id = ?
  `).get(userId, petId)

  return override ? JSON.parse(override.level_images) : null
}

function normalizeArray(value) {
  if (Array.isArray(value)) return value
  if (value === undefined || value === null) return []
  return [value]
}

async function savePetImage(file) {
  return saveUploadedImage(file)
}

router.get('/', authMiddleware, (req, res) => {
  const pets = db.prepare(`
    SELECT id, name, category, level_images, created_at, updated_at
    FROM custom_pets
    WHERE user_id = ?
    ORDER BY created_at DESC
  `).all(req.userId)
  const overrides = db.prepare(`
    SELECT pet_id, level_images
    FROM pet_image_overrides
    WHERE user_id = ?
  `).all(req.userId)
  const imageOverrides = {}

  for (const override of overrides) {
    imageOverrides[override.pet_id] = toLevelImagesObject(JSON.parse(override.level_images))
  }

  res.json({
    pets: pets.map(buildPetFromRecord),
    imageOverrides
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
      levelImageUrls.push(await savePetImage(file))
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

router.put('/:id/images', authMiddleware, teacherMiddleware, upload.array('images', 8), async (req, res) => {
  const petId = req.params.id
  const files = req.files || []
  const levels = normalizeArray(req.body.levels).map(level => Number(level))

  if (!Array.isArray(files) || files.length === 0) {
    return res.status(400).json({ error: '请至少选择一张要替换的等级图片' })
  }

  if (files.length !== levels.length || levels.some(level => !Number.isInteger(level) || level < 1 || level > 8)) {
    return res.status(400).json({ error: '等级图片参数不合法' })
  }

  const customPet = db.prepare(`
    SELECT id, name, category, level_images, created_at, updated_at
    FROM custom_pets
    WHERE id = ? AND user_id = ?
  `).get(petId, req.userId)

  if (!customPet && !STATIC_PET_IDS.has(petId)) {
    return res.status(404).json({ error: '宠物不存在或无权修改' })
  }

  try {
    const currentImages = customPet
      ? JSON.parse(customPet.level_images)
      : (getExistingOverrideImages(req.userId, petId) || getStaticLevelImages(petId))

    for (let index = 0; index < files.length; index++) {
      currentImages[levels[index] - 1] = await savePetImage(files[index])
    }

    const now = Date.now()
    const levelImagesJson = JSON.stringify(currentImages)

    if (customPet) {
      db.prepare(`
        UPDATE custom_pets
        SET level_images = ?, updated_at = ?
        WHERE id = ? AND user_id = ?
      `).run(levelImagesJson, now, petId, req.userId)

      const updatedPet = db.prepare(`
        SELECT id, name, category, level_images, created_at, updated_at
        FROM custom_pets
        WHERE id = ? AND user_id = ?
      `).get(petId, req.userId)

      res.json({ pet: buildPetFromRecord(updatedPet), levelImages: toLevelImagesObject(currentImages) })
      return
    }

    db.prepare(`
      INSERT INTO pet_image_overrides (id, user_id, pet_id, level_images, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(user_id, pet_id) DO UPDATE SET
        level_images = excluded.level_images,
        updated_at = excluded.updated_at
    `).run(uuidv4(), req.userId, petId, levelImagesJson, now, now)

    res.json({ petId, levelImages: toLevelImagesObject(currentImages) })
  } catch (error) {
    console.error('更新宠物图片失败:', error)
    res.status(500).json({ error: '更新宠物图片失败，请稍后重试' })
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
      return res.status(413).json({ error: `单张宠物图片不能超过 ${Math.floor(MAX_PET_IMAGE_SIZE / 1024 / 1024)}MB` })
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
