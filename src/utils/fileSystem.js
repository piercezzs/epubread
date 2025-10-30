// 文件系统工具 - 使用Electron API实现本地存储

/**
 * 获取应用数据目录
 * @returns {Promise<string>} 应用数据目录路径
 */
export async function getAppDataPath() {
  // 使用项目本地的 jsondata 目录
  return 'jsondata'
}

/**
 * 确保目录存在，如果不存在则创建
 * @param {string} dirPath - 目录路径
 * @returns {Promise<boolean>} 是否成功
 */
export async function ensureDirectoryExists(dirPath) {
  try {
    await window.electronAPI.ensureDirectoryExists(dirPath)
    return true
  } catch (error) {
    console.error('创建目录失败:', error)
    return false
  }
}

/**
 * 保存图片文件到本地
 * @param {string} uniqueKey - 唯一键
 * @param {File} file - 图片文件
 * @param {Blob} thumbnail - 缩略图Blob
 * @param {boolean} isAdditional - 是否为额外图片
 * @returns {Promise<Object>} 保存结果
 */
export async function saveImageFile(uniqueKey, file, thumbnail, isAdditional = false) {
  try {
    const appDataPath = await getAppDataPath()
    const imageDir = isAdditional 
      ? `${appDataPath}/images/${uniqueKey}/extra`
      : `${appDataPath}/images/${uniqueKey}`
    
    // 确保目录存在
    await ensureDirectoryExists(imageDir)
    
    // 保存原图（如调用方已压缩则直接保存）
    const originalPath = `${imageDir}/original.${getFileExtension(file.name)}`
    await window.electronAPI.writeFile(originalPath, await file.arrayBuffer())
    
    // 保存缩略图
    const thumbnailPath = `${imageDir}/thumbnail.jpg`
    await window.electronAPI.writeFile(thumbnailPath, await thumbnail.arrayBuffer())
    
    return {
      success: true,
      originalPath,
      thumbnailPath,
      uniqueKey
    }
  } catch (error) {
    console.error('保存图片文件失败:', error)
    return { success: false, error: error.message }
  }
}

/**
 * 删除图片文件
 * @param {string} uniqueKey - 唯一键
 * @returns {Promise<boolean>} 是否成功
 */
export async function deleteImageFile(uniqueKey) {
  try {
    const appDataPath = await getAppDataPath()
    const imageDir = `${appDataPath}/images/${uniqueKey}`
    
    await window.electronAPI.deleteDirectory(imageDir)
    return true
  } catch (error) {
    console.error('删除图片文件失败:', error)
    return false
  }
}

/**
 * 获取图片文件路径
 * @param {string} uniqueKey - 唯一键
 * @param {string} type - 文件类型 ('original' 或 'thumbnail')
 * @returns {string} 文件路径
 */
export async function getImageFilePath(uniqueKey, type = 'thumbnail') {
  const appDataPath = await getAppDataPath()
  const imageDir = `${appDataPath}/images/${uniqueKey}`
  
  if (type === 'original') {
    return `${imageDir}/original.*`
  }
  return `${imageDir}/thumbnail.jpg`
}

/**
 * 获取文件扩展名
 * @param {string} filename - 文件名
 * @returns {string} 文件扩展名
 */
function getFileExtension(filename) {
  return filename.split('.').pop().toLowerCase()
}

/**
 * 检查文件是否存在
 * @param {string} filePath - 文件路径
 * @returns {Promise<boolean>} 是否存在
 */
export async function fileExists(filePath) {
  try {
    return await window.electronAPI.fileExists(filePath)
  } catch (error) {
    console.error('检查文件存在失败:', error)
    return false
  }
}

/**
 * 读取文件内容
 * @param {string} filePath - 文件路径
 * @returns {Promise<ArrayBuffer>} 文件内容
 */
export async function readFile(filePath) {
  try {
    return await window.electronAPI.readFile(filePath)
  } catch (error) {
    console.error('读取文件失败:', error)
    throw error
  }
}

/**
 * 获取所有图片目录
 * @returns {Promise<Array>} 图片目录列表
 */
export async function getAllImageDirectories() {
  try {
    const appDataPath = await getAppDataPath()
    const imagesDir = `${appDataPath}/images`
    
    await ensureDirectoryExists(imagesDir)
    return await window.electronAPI.readDirectory(imagesDir)
  } catch (error) {
    console.error('获取图片目录失败:', error)
    return []
  }
} 