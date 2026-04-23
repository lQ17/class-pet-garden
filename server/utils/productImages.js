import fs from 'fs'
import { dirname, join } from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

const repoProductImagesDir = join(__dirname, '..', '..', 'public', 'product-images')
const nginxProductImagesDir = '/var/www/pet-garden/product-images'
const configuredBaseUrl = process.env.PRODUCT_IMAGES_BASE_URL || '/pet-garden/product-images'

function ensureWritableDirectory(dir) {
  try {
    fs.mkdirSync(dir, { recursive: true })
    fs.accessSync(dir, fs.constants.W_OK)
    return true
  } catch {
    return false
  }
}

function resolveProductImagesDir() {
  const configuredDir = process.env.PRODUCT_IMAGES_DIR
  if (configuredDir && ensureWritableDirectory(configuredDir)) {
    return configuredDir
  }

  if (process.platform !== 'win32' && ensureWritableDirectory(nginxProductImagesDir)) {
    return nginxProductImagesDir
  }

  ensureWritableDirectory(repoProductImagesDir)
  return repoProductImagesDir
}

export const productImagesDir = resolveProductImagesDir()
export const productImagesUrlPrefix = configuredBaseUrl.replace(/\/$/, '')

export function getProductImageUrl(filename) {
  return `${productImagesUrlPrefix}/${filename}`
}
