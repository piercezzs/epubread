// 图片处理工具函数

/**
 * 生成唯一键
 * @returns {string} 唯一标识符
 */
export function generateUniqueKey() {
  const timestamp = Date.now();
  const random = Math.random().toString(36).substring(2, 15);
  return `${timestamp}_${random}`;
}

/**
 * 生成缩略图
 * @param {File} file - 图片文件
 * @param {number} maxWidth - 最大宽度
 * @param {number} maxHeight - 最大高度
 * @returns {Promise<Blob>} 缩略图Blob
 */
export function generateThumbnail(file, maxWidth = 200, maxHeight = 200) {
  return new Promise((resolve, reject) => {
    console.log('开始生成缩略图:', file.name, file.type, file.size);
    
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    const img = new Image();
    
    img.onload = () => {
      try {
        console.log('图片加载成功，尺寸:', img.width, 'x', img.height);
        
        // 计算缩放比例
        const ratio = Math.min(maxWidth / img.width, maxHeight / img.height);
        const newWidth = Math.max(1, img.width * ratio);
        const newHeight = Math.max(1, img.height * ratio);
        
        console.log('缩略图尺寸:', newWidth, 'x', newHeight);
        
        // 设置canvas尺寸
        canvas.width = newWidth;
        canvas.height = newHeight;
        
        // 绘制缩略图
        ctx.drawImage(img, 0, 0, newWidth, newHeight);
        
        // 转换为Blob
        canvas.toBlob((blob) => {
          if (blob) {
            console.log('缩略图生成成功，大小:', blob.size);
            resolve(blob);
          } else {
            console.error('canvas.toBlob返回null');
            reject(new Error('Failed to create thumbnail blob - toBlob returned null'));
          }
        }, 'image/jpeg', 0.8);
      } catch (error) {
        console.error('生成缩略图时出错:', error);
        reject(error);
      }
    };
    
    img.onerror = (error) => {
      console.error('图片加载失败:', error);
      reject(new Error('Failed to load image: ' + (error.message || 'Unknown error')));
    };
    
    // 创建对象URL
    try {
      const objectUrl = URL.createObjectURL(file);
      console.log('创建对象URL成功:', objectUrl);
      img.src = objectUrl;
    } catch (error) {
      console.error('创建对象URL失败:', error);
      reject(new Error('Failed to create object URL: ' + error.message));
    }
  });
}

/**
 * 获取文件扩展名
 * @param {string} filename - 文件名
 * @returns {string} 文件扩展名
 */
export function getFileExtension(filename) {
  return filename.split('.').pop().toLowerCase();
}

/**
 * 检查是否为图片文件
 * @param {File} file - 文件对象
 * @returns {boolean} 是否为图片
 */
export function isImageFile(file) {
  const imageTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp'];
  return imageTypes.includes(file.type);
}

/**
 * 格式化文件大小
 * @param {number} bytes - 字节数
 * @returns {string} 格式化的大小
 */
export function formatFileSize(bytes) {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
} 

/**
 * 将图片压缩至不超过指定大小（字节）
 * - 使用 canvas 重新编码为 JPEG，不改变分辨率
 * - 逐步降低质量直到小于等于 maxBytes，或达到最小质量阈值
 * @param {File} file 源文件
 * @param {number} maxBytes 最大字节数，默认 200KB
 * @returns {Promise<{file: File, wasCompressed: boolean}>}
 */
export async function compressImageToMaxSize(file, maxBytes = 200 * 1024) {
  if (!(file instanceof File)) return { file, wasCompressed: false }
  if (file.size <= maxBytes) return { file, wasCompressed: false }

  const arrayBuffer = await file.arrayBuffer()
  const blob = new Blob([arrayBuffer], { type: file.type })
  const objectUrl = URL.createObjectURL(blob)

  const loadImage = () => new Promise((resolve, reject) => {
    const image = new Image()
    image.onload = () => resolve(image)
    image.onerror = reject
    image.src = objectUrl
  })

  try {
    const img = await loadImage()
    const canvas = document.createElement('canvas')
    const ctx = canvas.getContext('2d')

    let width = img.width
    let height = img.height
    const minDimension = 320 // 防止过度缩小
    const scaleStep = 0.85
    const qualities = [0.9, 0.8, 0.7, 0.6, 0.5, 0.45, 0.4, 0.35, 0.3]

    const encode = async (q) => new Promise(resolve => {
      canvas.toBlob((b) => resolve(b), 'image/jpeg', q)
    })

    // 先尝试仅降低质量
    canvas.width = width
    canvas.height = height
    ctx.drawImage(img, 0, 0, width, height)
    for (const q of qualities) {
      const out = await encode(q)
      if (out && out.size <= maxBytes) {
        const outFile = new File([out], (file.name || 'image').replace(/\.[^.]+$/, '.jpg'), { type: 'image/jpeg' })
        return { file: outFile, wasCompressed: true }
      }
    }

    // 若仅降质仍超标，开始等比缩小分辨率 + 质量尝试，直到 <= maxBytes 或到达下限
    let lastBlob = null
    while ((width > minDimension || height > minDimension)) {
      width = Math.max(minDimension, Math.floor(width * scaleStep))
      height = Math.max(minDimension, Math.floor(height * scaleStep))
      canvas.width = width
      canvas.height = height
      ctx.drawImage(img, 0, 0, width, height)
      for (const q of qualities) {
        const out = await encode(q)
        if (!out) continue
        lastBlob = out
        if (out.size <= maxBytes) {
          const outFile = new File([out], (file.name || 'image').replace(/\.[^.]+$/, '.jpg'), { type: 'image/jpeg' })
          return { file: outFile, wasCompressed: true }
        }
      }
    }

    // 仍然超标则返回最小尺度的最后一次编码结果
    if (lastBlob) {
      const outFile = new File([lastBlob], (file.name || 'image').replace(/\.[^.]+$/, '.jpg'), { type: 'image/jpeg' })
      return { file: outFile, wasCompressed: true }
    }
    return { file, wasCompressed: false }
  } finally {
    URL.revokeObjectURL(objectUrl)
  }
}