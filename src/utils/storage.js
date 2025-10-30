// 存储管理工具 - 使用SQLite数据库

import { saveImageFile, deleteImageFile } from './fileSystem.js'

/**
 * 获取所有存储的数据（兼容性函数，返回空对象）
 * @returns {Promise<Object>} 存储的数据
 */
export async function getAllData() {
  // 为了兼容性保留此函数，但返回空对象
  console.warn('getAllData() 已废弃，请使用数据库API')
  return {}
}

/**
 * 保存数据到本地文件（兼容性函数）
 * @param {Object} data - 要保存的数据
 */
export async function saveData(data) {
  // 为了兼容性保留此函数，但不执行任何操作
  console.warn('saveData() 已废弃，请使用数据库API')
}

/**
 * 保存图片信息
 * @param {string} uniqueKey - 唯一键
 * @param {Object} imageInfo - 图片信息
 * @param {File} file - 图片文件
 * @param {Blob} thumbnail - 缩略图
 */
export async function saveImageInfo(uniqueKey, imageInfo, file, thumbnail) {
  try {
    // 等待数据库初始化
    const dbReady = await waitForDatabase()
    if (!dbReady) {
      throw new Error('数据库未初始化')
    }
    
    // 保存原图与缩略图至 jsondata/images 目录
    const fileResult = await saveImageFile(uniqueKey, file, thumbnail)
    if (!fileResult.success) {
      throw new Error(fileResult.error || '保存文件失败')
    }
    const imageData = {
      uniqueKey,
      name: imageInfo.name,
      size: imageInfo.size,
      type: imageInfo.type,
      sizeFormatted: imageInfo.sizeFormatted,
      originalPath: fileResult.originalPath,
      thumbnailPath: fileResult.thumbnailPath,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      date: new Date().toISOString().split('T')[0], // 默认今天
      description: "",
      tags: []
    }
    
    // 保存到数据库
    const result = await window.electronAPI.dbSaveImage(imageData)
    
    if (!result.success) {
      throw new Error(result.error)
    }
    
    return { success: true, uniqueKey }
  } catch (error) {
    console.error('保存图片信息失败:', error)
    return { success: false, error: error.message }
  }
}

/**
 * 获取图片信息
 * @param {string} uniqueKey - 唯一键
 * @returns {Promise<Object|null>} 图片信息
 */
export async function getImageInfo(uniqueKey) {
  try {
    // 等待数据库初始化
    const dbReady = await waitForDatabase()
    if (!dbReady) {
      console.warn('数据库未初始化，无法获取图片信息')
      return null
    }
    
    const result = await window.electronAPI.dbGetImage(uniqueKey)
    
    if (!result.success) {
      return null
    }
    
    // 转换数据库字段名到前端字段名（包含路径）
    const image = result.image
    return {
      uniqueKey: image.unique_key,
      name: image.name,
      size: image.size,
      type: image.type,
      sizeFormatted: image.size_formatted,
      originalPath: image.original_path,
      thumbnailPath: image.thumbnail_path,
      createdAt: image.created_at,
      updatedAt: image.updated_at,
      date: image.date,
      description: image.description,
      tags: image.tags || [],
      additionalImages: image.additionalImages || []
    }
  } catch (error) {
    console.error('获取图片信息失败:', error)
    return null
  }
}

/**
 * 更新图片信息
 * @param {string} uniqueKey - 唯一键
 * @param {Object} updates - 更新的信息
 */
export async function updateImageInfo(uniqueKey, updates) {
  try {
    // 等待数据库初始化
    const dbReady = await waitForDatabase()
    if (!dbReady) {
      throw new Error('数据库未初始化')
    }
    
    // 转换前端字段名到数据库字段名
    const dbUpdates = {}
    for (const [key, value] of Object.entries(updates)) {
      if (key === 'uniqueKey') {
        dbUpdates.unique_key = value
      } else if (key === 'sizeFormatted') {
        dbUpdates.size_formatted = value
      } else if (key === 'originalPath') {
        dbUpdates.original_path = value
      } else if (key === 'thumbnailPath') {
        dbUpdates.thumbnail_path = value
      } else if (key === 'createdAt') {
        dbUpdates.created_at = value
      } else if (key === 'updatedAt') {
        dbUpdates.updated_at = value
      } else if (key === 'additionalImages') {
        // 额外图片通过专用接口管理，这里不透传，避免结构化克隆失败
        continue
      } else if (key === 'tags') {
        // 确保为普通数组，避免 Proxy 导致无法克隆
        dbUpdates.tags = Array.isArray(value) ? [...value] : []
      } else {
        dbUpdates[key] = value
      }
    }
    
    const result = await window.electronAPI.dbUpdateImage(uniqueKey, dbUpdates)
    if (!result.success) {
      throw new Error(result.error)
    }
    return true
  } catch (error) {
    console.error('更新图片信息失败:', error)
    return false
  }
}

/**
 * 添加额外图片
 * @param {string} uniqueKey - 主图唯一键
 * @param {Object} additionalImageInfo - 额外图片信息
 */
export async function addAdditionalImage(uniqueKey, additionalImageInfo) {
  try {
    // 等待数据库初始化
    const dbReady = await waitForDatabase()
    if (!dbReady) {
      throw new Error('数据库未初始化')
    }
    
    const additionalImageData = {
      uniqueKey: additionalImageInfo.uniqueKey,
      name: additionalImageInfo.name,
      size: additionalImageInfo.size,
      type: additionalImageInfo.type,
      sizeFormatted: additionalImageInfo.sizeFormatted,
      originalBuffer: additionalImageInfo.originalBuffer,
      thumbnailBuffer: additionalImageInfo.thumbnailBuffer,
      createdAt: Date.now()
    }
    
    const result = await window.electronAPI.dbAddAdditionalImage(uniqueKey, additionalImageData)
    
    if (!result.success) {
      throw new Error(result.error)
    }
    
    return { success: true }
  } catch (error) {
    console.error('添加额外图片失败:', error)
    return { success: false, error: error.message }
  }
}

/**
 * 删除额外图片
 * @param {string} uniqueKey - 主图唯一键
 * @param {string} additionalImageKey - 额外图片唯一键
 */
export async function removeAdditionalImage(uniqueKey, additionalImageKey) {
  try {
    // 等待数据库初始化
    const dbReady = await waitForDatabase()
    if (!dbReady) {
      throw new Error('数据库未初始化')
    }
    
    const result = await window.electronAPI.dbRemoveAdditionalImage(uniqueKey, additionalImageKey)
    
    if (!result.success) {
      throw new Error(result.error)
    }
    
    return { success: true }
  } catch (error) {
    console.error('删除额外图片失败:', error)
    return { success: false, error: error.message }
  }
}

/**
 * 删除图片信息
 * @param {string} uniqueKey - 唯一键
 */
export async function deleteImageInfo(uniqueKey) {
  try {
    // 等待数据库初始化
    const dbReady = await waitForDatabase()
    if (!dbReady) {
      throw new Error('数据库未初始化')
    }
    
    // 先删除本地文件目录（硬删除）
    try {
      await deleteImageFile(uniqueKey)
    } catch (e) {
      console.warn('删除图片文件夹失败（继续删除数据库记录）:', e?.message || e)
    }

    // 删除数据库记录
    const result = await window.electronAPI.dbDeleteImage(uniqueKey)
    
    if (!result.success) {
      throw new Error(result.error)
    }
  } catch (error) {
    console.error('删除图片信息失败:', error)
  }
}

/**
 * 等待数据库初始化
 * @param {number} maxRetries - 最大重试次数
 * @param {number} delay - 重试间隔（毫秒）
 * @returns {Promise<boolean>} 是否初始化成功
 */
async function waitForDatabase(maxRetries = 20, delay = 1000) {
  for (let i = 0; i < maxRetries; i++) {
    try {
      // 首先检查数据库是否已创建
      const isReady = await window.electronAPI.dbIsReady()
      if (!isReady.ready) {
        if (isReady.error) {
          console.error(`数据库初始化失败: ${isReady.error}，尝试重新初始化...`)
          try {
            const initResult = await window.electronAPI.dbInit()
            if (!initResult.success) {
              console.error(`数据库重新初始化失败: ${initResult.error}`)
              break
            }
          } catch (_) { /* ignore */ }
        }
        console.log(`数据库未就绪，重试 ${i + 1}/${maxRetries}`)
        await new Promise(resolve => setTimeout(resolve, delay))
        continue
      }
      
      // 然后检查数据库健康状态
      const healthCheck = await window.electronAPI.dbHealthCheck()
      if (healthCheck.healthy) {
        console.log('✅ 数据库初始化完成')
        return true
      } else {
        console.log(`数据库健康检查失败: ${healthCheck.error}，重试 ${i + 1}/${maxRetries}`)
      }
    } catch (error) {
      console.log(`数据库初始化检查失败，重试 ${i + 1}/${maxRetries}:`, error.message)
    }
    
    if (i < maxRetries - 1) {
      await new Promise(resolve => setTimeout(resolve, delay))
    }
  }
  
  console.error('❌ 数据库初始化超时')
  return false
}

/**
 * 获取所有图片信息
 * @param {Object} options - 查询选项
 * @returns {Promise<Array>} 图片信息数组
 */
export async function getAllImageInfo(options = {}) {
  try {
    // 等待数据库初始化
    const dbReady = await waitForDatabase()
    if (!dbReady) {
      console.warn('数据库未初始化，返回空数组')
      return []
    }
    
    const result = await window.electronAPI.dbGetAllImages(options)
    
    if (!result.success) {
      throw new Error(result.error)
    }
    
    // 转换数据库字段名到前端字段名（不包含文件路径字段）
    return result.images.map(image => ({
      uniqueKey: image.unique_key,
      name: image.name,
      size: image.size,
      type: image.type,
      sizeFormatted: image.size_formatted,
      createdAt: image.created_at,
      updatedAt: image.updated_at,
      date: image.date,
      description: image.description,
      tags: image.tags || [],
      additionalImages: image.additionalImages || []
    }))
  } catch (error) {
    console.error('获取所有图片信息失败:', error)
    return []
  }
}

/**
 * 分页获取图片信息
 * @param {Object} options { page, pageSize, search }
 * @returns {Promise<{items: Array, totalCount: number, page: number, pageSize: number, totalPages: number}>}
 */
export async function getImagesPaged(options = {}) {
  try {
    const dbReady = await waitForDatabase()
    if (!dbReady) {
      return { items: [], totalCount: 0, page: 1, pageSize: options.pageSize || 10, totalPages: 0 }
    }

    const result = await window.electronAPI.dbGetAllImages(options)
    if (!result.success) {
      throw new Error(result.error)
    }

    const items = result.images.map(image => ({
      uniqueKey: image.unique_key,
      name: image.name,
      size: image.size,
      type: image.type,
      sizeFormatted: image.size_formatted,
      originalPath: image.original_path,
      thumbnailPath: image.thumbnail_path,
      createdAt: image.created_at,
      updatedAt: image.updated_at,
      date: image.date,
      description: image.description,
      tags: image.tags || [],
      additionalImages: image.additionalImages || []
    }))

    return {
      items,
      totalCount: result.totalCount || items.length,
      page: result.page || 1,
      pageSize: result.pageSize || (options.pageSize || 10),
      totalPages: result.totalPages || 1
    }
  } catch (error) {
    console.error('分页获取图片信息失败:', error)
    return { items: [], totalCount: 0, page: 1, pageSize: options.pageSize || 10, totalPages: 0 }
  }
}

/**
 * 获取图片缩略图URL
 * @param {string} uniqueKey - 唯一键
 * @returns {Promise<string>} 缩略图URL
 */
export async function getThumbnailUrl(uniqueKey) {
  try {
    const paths = await window.electronAPI.dbGetImagePaths(uniqueKey)
    if (!paths || !paths.thumbnail_path) return null
    const exists = await window.electronAPI.fileExists(paths.thumbnail_path)
    if (!exists) return null
    const buffer = await window.electronAPI.readFile(paths.thumbnail_path)
    const uint8Array = new Uint8Array(buffer)
    const blob = new Blob([uint8Array], { type: 'image/jpeg' })
    return URL.createObjectURL(blob)
  } catch (error) {
    console.error('获取缩略图URL失败:', error)
    return null
  }
}

/**
 * 清空所有数据
 */
export async function clearAllData() {
  try {
    console.warn('clearAllData() 需在主进程提供重置数据库的实现（当前未暴露）')
  } catch (error) {
    console.error('清空所有数据失败:', error)
  }
} 