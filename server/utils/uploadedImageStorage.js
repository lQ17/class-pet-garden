import fs from 'fs/promises'
import { extname, join } from 'path'
import { v4 as uuidv4 } from 'uuid'
import { getProductImageUrl, productImagesDir } from './productImages.js'

const IMAGE_EXTENSION_BY_MIME = {
  'image/avif': '.avif',
  'image/bmp': '.bmp',
  'image/gif': '.gif',
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp'
}

function normalizeExtension(extension) {
  if (!extension) return ''

  const normalized = extension.toLowerCase()
  return /^\.[a-z0-9]{1,10}$/.test(normalized) ? normalized : ''
}

function resolveImageExtension(file) {
  const mimeExtension = IMAGE_EXTENSION_BY_MIME[file.mimetype]
  if (mimeExtension) {
    return mimeExtension
  }

  return normalizeExtension(extname(file.originalname || '')) || '.png'
}

export function isSupportedImageMimeType(mimeType) {
  return Boolean(IMAGE_EXTENSION_BY_MIME[mimeType])
}

export async function saveUploadedImage(file) {
  const filename = `${uuidv4()}${resolveImageExtension(file)}`
  const filepath = join(productImagesDir, filename)

  // 保留原始图片内容，避免自动压缩和缩放导致画质下降。
  await fs.writeFile(filepath, file.buffer)

  return getProductImageUrl(filename)
}
