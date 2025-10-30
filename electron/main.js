const { app, BrowserWindow, Menu, shell, dialog, ipcMain } = require('electron')
const { autoUpdater } = require('electron-updater')
const log = require('electron-log')
const path = require('path')
const fs = require('fs')
// 移除未使用的抓取/下载依赖（axios/cheerio/puppeteer/yt-dlp）
const Database = require('better-sqlite3')
const AdmZip = require('adm-zip')
const isDev = process.env.NODE_ENV === 'development'

// 数据库实例
let db = null
let dbInitError = null

// 数据库路径
let dbPath = path.join(process.cwd(), 'jsondata', 'epub.db')
let txtDbPath = path.join(process.cwd(), 'jsondata', 'txt.db')

// 设置文件路径
const settingsPath = path.join(process.cwd(), 'jsondata', 'settings.json')

let mainWindow
// 单实例锁，防止应用多开
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
  try { process.exit(0); } catch { }
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.show();
      mainWindow.focus();
    }
  });
}

// 建议设置 AppUserModelId，保证任务栏行为一致
app.setAppUserModelId('com.epubread.app');
// process.env.GH_TOKEN = 'YOUR_GITHUB_TOKEN_HERE';

function createWindow () {
  mainWindow = new BrowserWindow({
    width: 1600,
    height: 800,
    minWidth: 1000,
    minHeight: 700,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      enableRemoteModule: false,
      preload: path.join(__dirname, 'preload.js'),
      webSecurity: true,
      allowRunningInsecureContent: false,
      experimentalFeatures: false
    },
    show: false,
    titleBarStyle: 'hidden',
    titleBarOverlay: {
      color: '#ffffff',
      symbolColor: '#000000',
      height: 40
    },
    icon: path.join(__dirname, '../src/static/images/logo.svg')
  })

  // 设置CSP头
  mainWindow.webContents.session.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        'Content-Security-Policy': [
          "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'self'"
        ]
      }
    })
  })

  if (isDev) {
    mainWindow.loadURL('http://localhost:5174')
    mainWindow.webContents.openDevTools()
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'))
  }

  mainWindow.once('ready-to-show', () => {
    mainWindow.show()
  })

  mainWindow.on('closed', () => {
    mainWindow = null
  })

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url)
    return { action: 'deny' }
  })
  // mainWindow.webContents.openDevTools()
}


ipcMain.handle('open-folder', async (event, folderPath) => {
  shell.openPath(folderPath)
})

// 选择本地EPUB文件
ipcMain.handle('dialog-open-epub', async () => {
  try {
    const result = await dialog.showOpenDialog({
      title: '选择 EPUB 文件',
      properties: ['openFile', 'multiSelections'],
      filters: [{ name: 'EPUB', extensions: ['epub'] }]
    })
    if (result.canceled || !result.filePaths || result.filePaths.length === 0) {
      return { canceled: true }
    }
    return { canceled: false, filePaths: result.filePaths }
  } catch (e) {
    return { canceled: true, error: e.message }
  }
})

// 递归读取文件夹树
function getFolderTree (dirPath) {
  const stats = fs.statSync(dirPath)
  if (!stats.isDirectory()) return null
  const name = path.basename(dirPath)
  const children = []
  const files = fs.readdirSync(dirPath)
  for (const file of files) {
    const fullPath = path.join(dirPath, file)
    try {
      const stat = fs.statSync(fullPath)
      if (stat.isDirectory()) {
        children.push(getFolderTree(fullPath))
      }
    } catch (e) { /* ignore */ }
  }
  return { name, path: dirPath, children }
}

// 获取文件夹的子文件夹列表（支持分页）
function getFolderChildren (dirPath, page = 1, pageSize = 100) {
  try {
    const stats = fs.statSync(dirPath)
    if (!stats.isDirectory()) return { children: [], total: 0, page: 1, pageSize }

    const files = fs.readdirSync(dirPath)
    const directories = []

    for (const file of files) {
      const fullPath = path.join(dirPath, file)
      try {
        const stat = fs.statSync(fullPath)
        if (stat.isDirectory()) {
          directories.push({ name: file, path: fullPath })
        }
      } catch (e) { /* ignore */ }
    }

    const total = directories.length
    const startIndex = (page - 1) * pageSize
    const endIndex = startIndex + pageSize
    const paginatedChildren = directories.slice(startIndex, endIndex)

    return {
      children: paginatedChildren,
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize)
    }
  } catch (e) {
    return { children: [], total: 0, page: 1, pageSize, totalPages: 0 }
  }
}

ipcMain.handle('read-folder-tree', async (event, dirPath) => {
  try {
    return getFolderTree(dirPath)
  } catch (e) {
    return null
  }
})

ipcMain.handle('read-folder-children', async (event, { dirPath, page = 1, pageSize = 100 }) => {
  try {
    console.log('Electron: Reading folder children', { dirPath, page, pageSize });
    const result = getFolderChildren(dirPath, page, pageSize);
    console.log('Electron: Folder children result', result);
    return result;
  } catch (e) {
    console.error('Electron: Error reading folder children', e);
    return { children: [], total: 0, page: 1, pageSize, totalPages: 0 }
  }
})

// 读取指定目录下所有图片文件（不递归）
ipcMain.handle('read-image-files', async (event, dirPath) => {
  try {
    const files = fs.readdirSync(dirPath)
    const imageExts = ['.jpg', '.jpeg', '.png', '.gif', '.webp']
    return files.filter(f => imageExts.includes(path.extname(f).toLowerCase()))
      .map(f => ({ name: f, path: path.join(dirPath, f) }))
  } catch (e) {
    return []
  }
})

ipcMain.handle('read-image-base64', async (event, imgPath) => {
  try {
    const ext = path.extname(imgPath).toLowerCase().replace('.', '')
    const data = fs.readFileSync(imgPath)
    const base64 = data.toString('base64')
    return `data:image/${ext};base64,${base64}`
  } catch (e) {
    return ''
  }
})

ipcMain.handle('read-image-buffer', async (event, imgPath) => {
  try {
    const data = fs.readFileSync(imgPath)
    return Uint8Array.from(data)
  } catch (e) {
    return null
  }
})

// 删除文件夹
ipcMain.handle('delete-folders', async (event, folderPaths) => {
  try {
    const results = []
    for (const folderPath of folderPaths) {
      try {
        // 递归删除文件夹
        function deleteFolderRecursive (folderPath) {
          if (fs.existsSync(folderPath)) {
            const files = fs.readdirSync(folderPath)
            for (const file of files) {
              const curPath = path.join(folderPath, file)
              const stat = fs.statSync(curPath)
              if (stat.isDirectory()) {
                deleteFolderRecursive(curPath)
              } else {
                fs.unlinkSync(curPath)
              }
            }
            fs.rmdirSync(folderPath)
          }
        }

        deleteFolderRecursive(folderPath)
        results.push({ path: folderPath, success: true })
      } catch (error) {
        results.push({ path: folderPath, success: false, error: error.message })
      }
    }

    const allSuccess = results.every(result => result.success)
    return {
      success: allSuccess,
      results: results,
      error: allSuccess ? null : '部分文件夹删除失败'
    }
  } catch (error) {
    return {
      success: false,
      error: error.message
    }
  }
})

// 移动文件夹
ipcMain.handle('move-folders', async (event, { folders, targetPath }) => {
  try {
    if (!fs.existsSync(targetPath)) {
      return {
        success: false,
        error: '目标文件夹不存在'
      }
    }

    const results = []
    for (const folderPath of folders) {
      try {
        const folderName = path.basename(folderPath)
        const targetFolderPath = path.join(targetPath, folderName)

        // 检查目标路径是否已存在
        if (fs.existsSync(targetFolderPath)) {
          results.push({
            path: folderPath,
            success: false,
            error: '目标文件夹已存在'
          })
          continue
        }

        // 移动文件夹
        fs.renameSync(folderPath, targetFolderPath)
        results.push({ path: folderPath, success: true })
      } catch (error) {
        results.push({ path: folderPath, success: false, error: error.message })
      }
    }

    const allSuccess = results.every(result => result.success)
    return {
      success: allSuccess,
      results: results,
      error: allSuccess ? null : '部分文件夹移动失败'
    }
  } catch (error) {
    return {
      success: false,
      error: error.message
    }
  }
})

// 文件系统API - 图片管理相关
ipcMain.handle('getAppDataPath', async () => {
  return app.getPath('userData')
})

ipcMain.handle('ensureDirectoryExists', async (event, dirPath) => {
  try {
    if (!fs.existsSync(dirPath)) {
      fs.mkdirSync(dirPath, { recursive: true })
    }
    return true
  } catch (error) {
    console.error('创建目录失败:', error)
    return false
  }
})

ipcMain.handle('writeFile', async (event, filePath, data) => {
  try {
    // 确保目录存在
    const dir = path.dirname(filePath)
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true })
    }

    // 写入文件
    fs.writeFileSync(filePath, Buffer.from(data))
    return true
  } catch (error) {
    console.error('写入文件失败:', error)
    return false
  }
})

ipcMain.handle('readFile', async (event, filePath) => {
  try {
    const data = fs.readFileSync(filePath)
    return Array.from(data)
  } catch (error) {
    console.error('读取文件失败:', error)
    throw error
  }
})

ipcMain.handle('fileExists', async (event, filePath) => {
  try {
    return fs.existsSync(filePath)
  } catch (error) {
    console.error('检查文件存在失败:', error)
    return false
  }
})

ipcMain.handle('deleteFile', async (event, filePath) => {
  try {
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath)
    }
    return true
  } catch (error) {
    console.error('删除文件失败:', error)
    return false
  }
})

ipcMain.handle('deleteDirectory', async (event, dirPath) => {
  try {
    if (fs.existsSync(dirPath)) {
      // 递归删除目录
      function deleteFolderRecursive (folderPath) {
        if (fs.existsSync(folderPath)) {
          const files = fs.readdirSync(folderPath)
          for (const file of files) {
            const curPath = path.join(folderPath, file)
            const stat = fs.statSync(curPath)
            if (stat.isDirectory()) {
              deleteFolderRecursive(curPath)
            } else {
              fs.unlinkSync(curPath)
            }
          }
          fs.rmdirSync(folderPath)
        }
      }

      deleteFolderRecursive(dirPath)
    }
    return true
  } catch (error) {
    console.error('删除目录失败:', error)
    return false
  }
})

ipcMain.handle('readDirectory', async (event, dirPath) => {
  try {
    if (!fs.existsSync(dirPath)) {
      return []
    }

    const files = fs.readdirSync(dirPath)
    const directories = []

    for (const file of files) {
      const fullPath = path.join(dirPath, file)
      try {
        const stat = fs.statSync(fullPath)
        if (stat.isDirectory()) {
          directories.push(file)
        }
      } catch (e) {
        // 忽略无法访问的文件
      }
    }

    return directories
  } catch (error) {
    console.error('读取目录失败:', error)
    return []
  }
})

// EPUB 图片列表读取（方案二：解压并按图片顺序返回）
ipcMain.handle('epub-read-images', async (event, epubPath) => {
  try {
    if (!fs.existsSync(epubPath)) return { success: false, error: 'EPUB 文件不存在' }
    const stat = fs.statSync(epubPath)
    const fileSize = stat && stat.size ? stat.size : 0
    const zip = new AdmZip(epubPath)
    const entries = zip.getEntries()

    // Helper: build quick lookup map
    const entryMap = new Map()
    for (const e of entries) {
      if (!e.isDirectory) {
        // Always use posix-like path separators inside zip
        entryMap.set(e.entryName, e)
        // Also store a lowercase key for case-insensitive lookup (rare zips)
        entryMap.set(e.entryName.toLowerCase(), e)
      }
    }

    const posix = path.posix

    function readText (entryName) {
      try {
        const ent = entryMap.get(entryName) || entryMap.get(entryName.toLowerCase())
        if (!ent) return null
        const buf = zip.readFile(ent)
        return buf ? Buffer.from(buf).toString('utf8') : null
      } catch (e) {
        return null
      }
    }

    function resolveHref (baseFile, href) {
      // baseFile: e.g. OEBPS/content.opf, href may contain ../images/001.jpg
      const baseDir = posix.dirname(baseFile || '')
      // Normalize href (remove anchors, queries)
      const cleanHref = String(href || '').split('#')[0].split('?')[0]
      return posix.normalize(posix.join(baseDir, cleanHref))
    }

    // Try to locate container.xml
    const containerPaths = [
      'META-INF/container.xml',
      'meta-inf/container.xml'
    ]
    let containerXml = null
    let containerPathUsed = null
    for (const p of containerPaths) {
      const t = readText(p)
      if (t) { containerXml = t; containerPathUsed = p; break }
    }

    let opfPath = null
    if (containerXml) {
      // Very small regex-based extraction of rootfile full-path
      const rootfileMatch = containerXml.match(/full-path\s*=\s*"([^"]+)"|full-path\s*=\s*'([^']+)'/i)
      if (rootfileMatch) {
        opfPath = rootfileMatch[1] || rootfileMatch[2] || null
        if (opfPath) opfPath = posix.normalize(opfPath)
      }
    }

    let items = []

    function pushImageByPath (imgPath) {
      try {
        const ent = entryMap.get(imgPath) || entryMap.get(imgPath.toLowerCase())
        if (!ent) return false
        const data = zip.readFile(ent)
        const ext = path.extname(ent.entryName).toLowerCase().replace('.', '') || 'jpeg'
        const base64 = Buffer.from(data).toString('base64')
        items.push({ name: ent.entryName, dataUrl: `data:image/${ext};base64,${base64}` })
        return true
      } catch (_) {
        return false
      }
    }

    if (opfPath) {
      const opfXml = readText(opfPath)
      if (opfXml) {
        // Parse manifest items: id, href, media-type
        const manifest = new Map()
        const itemRegex = /<item\b([^>]+?)\/>/gi
        let m
        while ((m = itemRegex.exec(opfXml)) !== null) {
          const attrs = m[1]
          const id = (attrs.match(/\bid\s*=\s*"([^"]+)"|\bid\s*=\s*'([^']+)'/) || [])[1] || (attrs.match(/\bid\s*=\s*"([^"]+)"|\bid\s*=\s*'([^']+)'/) || [])[2]
          const href = (attrs.match(/\bhref\s*=\s*"([^"]+)"|\bhref\s*=\s*'([^']+)'/) || [])[1] || (attrs.match(/\bhref\s*=\s*"([^"]+)"|\bhref\s*=\s*'([^']+)'/) || [])[2]
          const mediaType = (attrs.match(/\bmedia-type\s*=\s*"([^"]+)"|\bmedia-type\s*=\s*'([^']+)'/) || [])[1] || (attrs.match(/\bmedia-type\s*=\s*"([^"]+)"|\bmedia-type\s*=\s*'([^']+)'/) || [])[2]
          if (id && href) {
            manifest.set(id, { id, href: href.trim(), mediaType: (mediaType || '').trim() })
          }
        }

        // Parse spine order
        const spineIds = []
        const spineRegex = /<spine\b[\s\S]*?>[\s\S]*?<\/spine>/i
        const spineBlockMatch = opfXml.match(spineRegex)
        if (spineBlockMatch) {
          const spineBlock = spineBlockMatch[0]
          const itemrefRegex = /<itemref\b([^>]+?)\/?>(?:<\/itemref>)?/gi
          let r
          while ((r = itemrefRegex.exec(spineBlock)) !== null) {
            const attrs = r[1]
            const idref = (attrs.match(/\bidref\s*=\s*"([^"]+)"|\bidref\s*=\s*'([^']+)'/) || [])[1] || (attrs.match(/\bidref\s*=\s*"([^"]+)"|\bidref\s*=\s*'([^']+)'/) || [])[2]
            if (idref) spineIds.push(idref.trim())
          }
        }

        const seen = new Set()
        // Walk through spine in order
        for (const idref of spineIds) {
          const it = manifest.get(idref)
          if (!it) continue

          const hrefResolved = resolveHref(opfPath, it.href)

          if ((it.mediaType || '').toLowerCase().startsWith('image/')) {
            if (!seen.has(hrefResolved) && pushImageByPath(hrefResolved)) {
              seen.add(hrefResolved)
            }
            continue
          }

          // If XHTML, try to pull the first <img src="...">
          if ((it.mediaType || '').toLowerCase().includes('xhtml') || (it.mediaType || '').toLowerCase().includes('html')) {
            const html = readText(hrefResolved)
            if (html) {
              const imgMatch = html.match(/<img[^>]+src\s*=\s*"([^"]+)"|<img[^>]+src\s*=\s*'([^']+)'/i)
              const src = (imgMatch && (imgMatch[1] || imgMatch[2])) ? (imgMatch[1] || imgMatch[2]) : null
              if (src) {
                const imgPath = resolveHref(hrefResolved, src)
                if (!seen.has(imgPath) && pushImageByPath(imgPath)) {
                  seen.add(imgPath)
                }
              }
            }
          }
        }

        // If we found at least one item, return in spine order
        if (items.length > 0) {
          return { success: true, items, fileSize }
        }
      }
    }

    // Fallback: collect all images and sort by name (numeric)
    const imageExts = ['.jpg', '.jpeg', '.png', '.gif', '.webp']
    const images = entries
      .filter(e => !e.isDirectory && imageExts.includes(path.extname(e.entryName).toLowerCase()))
      .map(e => e.entryName)
      .sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' }))

    items = []
    for (const name of images) {
      pushImageByPath(name)
    }

    return { success: true, items, fileSize }
  } catch (e) {
    return { success: false, error: e.message }
  }
})

// 仅获取 EPUB 概要（不读取图片数据）
ipcMain.handle('epub-stat', async (event, epubPath) => {
  try {
    if (!fs.existsSync(epubPath)) return { success: false, error: 'EPUB 文件不存在' }
    const stat = fs.statSync(epubPath)
    const fileSize = stat && stat.size ? stat.size : 0
    const fileName = path.basename(epubPath)
    let pageCount = 0
    try {
      const zip = new AdmZip(epubPath)
      const entries = zip.getEntries()
      const imageExts = ['.jpg', '.jpeg', '.png', '.gif', '.webp']
      pageCount = entries.filter(e => !e.isDirectory && imageExts.includes(path.extname(e.entryName).toLowerCase())).length
    } catch (_) { /* 忽略无法解析的情况，页面数置0 */ }
    return { success: true, fileSize, fileName, filePath: epubPath, pageCount }
  } catch (e) {
    return { success: false, error: e.message }
  }
})

// 初始化数据库
async function initDatabase () {
  try {
    // 确保目录存在
    const dir = path.dirname(dbPath)
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true })
    }

    // 创建数据库连接
    db = new Database(dbPath)

    // 启用外键约束
    db.pragma('foreign_keys = ON')

    // 创建表结构
    createTables()

    // 初始化TXT数据库
    initTxtDatabase()

    console.log('数据库初始化成功:', dbPath)
    dbInitError = null
    return true
  } catch (error) {
    console.error('数据库初始化失败:', error)
    dbInitError = error.message || String(error)
    return false
  }
}

// 创建数据库表结构
function createTables () {
  // 创建主图片表
  db.exec(`
    CREATE TABLE IF NOT EXISTS images (
      unique_key TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      size INTEGER NOT NULL,
      type TEXT NOT NULL,
      size_formatted TEXT NOT NULL,
      original_path TEXT NOT NULL,
      thumbnail_path TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      date TEXT NOT NULL,
      description TEXT DEFAULT ''
    )
  `)

  // 创建标签表
  db.exec(`
    CREATE TABLE IF NOT EXISTS tags (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      image_key TEXT NOT NULL,
      tag TEXT NOT NULL,
      FOREIGN KEY (image_key) REFERENCES images(unique_key) ON DELETE CASCADE
    )
  `)

  // 创建额外图片表
  db.exec(`
    CREATE TABLE IF NOT EXISTS additional_images (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      parent_key TEXT NOT NULL,
      unique_key TEXT NOT NULL,
      name TEXT NOT NULL,
      size INTEGER NOT NULL,
      type TEXT NOT NULL,
      size_formatted TEXT NOT NULL,
      original_path TEXT NOT NULL,
      thumbnail_path TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      FOREIGN KEY (parent_key) REFERENCES images(unique_key) ON DELETE CASCADE
    )
  `)

  // 创建索引
  db.exec('CREATE INDEX IF NOT EXISTS idx_images_created_at ON images(created_at)')
  db.exec('CREATE INDEX IF NOT EXISTS idx_images_date ON images(date)')
  db.exec('CREATE INDEX IF NOT EXISTS idx_tags_image_key ON tags(image_key)')
  db.exec('CREATE INDEX IF NOT EXISTS idx_additional_images_parent_key ON additional_images(parent_key)')

  // 漫画/EPUB 阅读进度表
  db.exec(`
    CREATE TABLE IF NOT EXISTS reading_progress (
      book_id TEXT PRIMARY KEY,
      file_name TEXT DEFAULT '',
      file_path TEXT DEFAULT '',
      file_size INTEGER DEFAULT 0,
      page_index INTEGER NOT NULL,
      total_pages INTEGER NOT NULL,
      rtl INTEGER DEFAULT 0,
      spread_mode TEXT DEFAULT 'single',
      updated_at INTEGER NOT NULL
    )
  `)

  // 兼容旧库：确保所需列存在
  function ensureColumnExists (table, column, type) {
    try {
      const cols = db.prepare(`PRAGMA table_info(${table})`).all().map(c => c.name)
      if (!cols.includes(column)) {
        db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${type}`)
      }
    } catch (_) { /* ignore */ }
  }
  ensureColumnExists('images', 'original_path', 'TEXT')
  ensureColumnExists('images', 'thumbnail_path', 'TEXT')
  ensureColumnExists('additional_images', 'original_path', 'TEXT')
  ensureColumnExists('additional_images', 'thumbnail_path', 'TEXT')
  ensureColumnExists('reading_progress', 'file_path', 'TEXT')
  ensureColumnExists('reading_progress', 'file_name', 'TEXT')
  ensureColumnExists('reading_progress', 'file_size', 'INTEGER')
}

// 初始化TXT数据库
function initTxtDatabase () {
  try {
    const txtDb = new Database(txtDbPath)
    console.log('TXT数据库连接成功:', txtDbPath)

    // 创建TXT阅读进度表
    txtDb.exec(`
      CREATE TABLE IF NOT EXISTS txt_progress (
        book_id TEXT PRIMARY KEY,
        file_name TEXT,
        file_path TEXT,
        file_size INTEGER,
        page_index INTEGER DEFAULT 0,
        total_pages INTEGER DEFAULT 0,
        updated_at INTEGER DEFAULT (strftime('%s', 'now')),
        encoding TEXT
      )
    `)
    // 兼容已有表，补充缺失列
    try {
      const cols = txtDb.prepare(`PRAGMA table_info(txt_progress)`).all().map(c => c.name)
      if (!cols.includes('encoding')) {
        txtDb.exec(`ALTER TABLE txt_progress ADD COLUMN encoding TEXT`)
      }
    } catch (_) { /* ignore */ }

    txtDb.close()
  } catch (error) {
    console.error('TXT数据库初始化失败:', error)
  }
}

// 加载设置
function loadSettings () {
  try {
    if (fs.existsSync(settingsPath)) {
      const settingsData = fs.readFileSync(settingsPath, 'utf-8')
      const settings = JSON.parse(settingsData)

      // 如果设置了自定义数据库路径，更新路径变量
      if (settings.databasePath && fs.existsSync(settings.databasePath)) {
        const customDbPath = path.join(settings.databasePath, 'epub.db')
        const customTxtDbPath = path.join(settings.databasePath, 'txt.db')

        if (fs.existsSync(customDbPath)) {
          dbPath = customDbPath
          console.log('使用自定义数据库路径:', dbPath)
        }

        if (fs.existsSync(customTxtDbPath)) {
          txtDbPath = customTxtDbPath
          console.log('使用自定义TXT数据库路径:', txtDbPath)
        }
      }

      return settings
    }
  } catch (error) {
    console.error('加载设置失败:', error)
  }
  return {}
}

// 保存设置
function saveSettings (settings) {
  try {
    // 确保目录存在
    const dir = path.dirname(settingsPath)
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true })
    }

    // 如果设置了新的数据库路径，需要迁移数据库文件
    if (settings.databasePath && settings.databasePath !== process.cwd()) {
      const success = migrateDatabaseFiles(settings.databasePath)
      if (!success) {
        throw new Error('数据库文件迁移失败')
      }
    }

    fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2), 'utf-8')
    return true
  } catch (error) {
    console.error('保存设置失败:', error)
    return false
  }
}

// 迁移数据库文件到新路径
function migrateDatabaseFiles (newPath) {
  try {
    // 确保新目录存在
    if (!fs.existsSync(newPath)) {
      fs.mkdirSync(newPath, { recursive: true })
    }

    const oldDbPath = path.join(process.cwd(), 'jsondata', 'epub.db')
    const oldTxtDbPath = path.join(process.cwd(), 'jsondata', 'txt.db')
    const newDbPath = path.join(newPath, 'epub.db')
    const newTxtDbPath = path.join(newPath, 'txt.db')

    let migrated = false

    // 迁移 epub.db
    if (fs.existsSync(oldDbPath)) {
      fs.copyFileSync(oldDbPath, newDbPath)
      console.log('epub.db 已迁移到:', newDbPath)
      migrated = true
    }

    // 迁移 txt.db
    if (fs.existsSync(oldTxtDbPath)) {
      fs.copyFileSync(oldTxtDbPath, newTxtDbPath)
      console.log('txt.db 已迁移到:', newTxtDbPath)
      migrated = true
    }

    // 如果没有找到任何数据库文件，创建空的数据库文件
    if (!migrated) {
      console.log('未找到现有数据库文件，将在新路径创建空数据库')
    }

    return true
  } catch (error) {
    console.error('数据库文件迁移失败:', error)
    return false
  }
}

app.whenReady().then(async () => {
  // 加载设置
  const settings = loadSettings()
  console.log('设置加载完成:', settings)

  // 初始化数据库
  const dbInitSuccess = await initDatabase()

  if (dbInitSuccess) {
    console.log('✅ 数据库初始化成功')

    // 执行数据库健康检查
    try {
      const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all()
      console.log('📋 数据库表:', tables.map(t => t.name))

      // 使用 sqlite_master 查询索引列表，而不是不存在的 sqlite_index_list
      const indexes = db.prepare("SELECT name FROM sqlite_master WHERE type='index'").all()
      console.log('🔍 数据库索引:', indexes.map(i => i.name))
    } catch (error) {
      console.error('❌ 数据库健康检查失败:', error)
    }
  } else {
    console.error('❌ 数据库初始化失败')
  }

  createWindow()

  if (!isDev) {
    autoUpdater.checkForUpdates()
    log.transports.file.level = 'info'
    autoUpdater.logger = log

    autoUpdater.on('update-available', (info) => {
      log.info('Update available.', info)
      mainWindow.webContents.send('update_available')
    })

    autoUpdater.on('update-not-available', (info) => {
      log.info('Update not available.', info)
    })

    autoUpdater.on('error', (err) => {
      log.error('Error in auto-updater. ' + err)
    })

    autoUpdater.on('download-progress', (progressObj) => {
      mainWindow.webContents.send('download_progress', progressObj)
    })

    autoUpdater.on('update-downloaded', (info) => {
      log.info('Update downloaded', info)
      mainWindow.webContents.send('update_downloaded')
    })
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow()
    }
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

const template = [
  {
    label: 'File',
    submenu: [
      {
        label: 'Exit',
        accelerator: 'CmdOrCtrl+Q',
        click: () => {
          app.quit()
        }
      }
    ]
  },
  {
    label: 'Edit',
    submenu: [
      { role: 'undo', label: 'Undo' },
      { role: 'redo', label: 'Redo' },
      { type: 'separator' },
      { role: 'cut', label: 'Cut' },
      { role: 'copy', label: 'Copy' },
      { role: 'paste', label: 'Paste' }
    ]
  },
  {
    label: 'View',
    submenu: [
      { role: 'reload', label: 'Reload' },
      { role: 'forceReload', label: 'Force Reload' },
      { role: 'toggleDevTools', label: 'Toggle Developer Tools' },
      { type: 'separator' },
      { role: 'resetZoom', label: 'Actual Size' },
      { role: 'zoomIn', label: 'Zoom In' },
      { role: 'zoomOut', label: 'Zoom Out' },
      { type: 'separator' },
      { role: 'togglefullscreen', label: 'Toggle Fullscreen' }
    ]
  },
  {
    label: 'Window',
    submenu: [
      { role: 'minimize', label: 'Minimize' },
      { role: 'close', label: 'Close' }
    ]
  },
  {
    label: 'Help',
    submenu: [
      {
        label: 'About epubread',
        click: () => {
          dialog.showMessageBox(mainWindow, {
            type: 'info',
            title: 'About epubread',
            message: 'epubread File Download Management Tool',
            detail: 'Version: 1.0.0'
          })
        }
      }
    ]
  }
]

const menu = Menu.buildFromTemplate(template)
Menu.setApplicationMenu(menu)

// 窗口控制IPC处理器
ipcMain.handle('minimize-window', () => {
  if (mainWindow) {
    mainWindow.minimize()
  }
})

ipcMain.handle('maximize-window', () => {
  if (mainWindow) {
    if (mainWindow.isMaximized()) {
      mainWindow.unmaximize()
    } else {
      mainWindow.maximize()
    }
  }
})

ipcMain.handle('close-window', () => {
  if (mainWindow) {
    mainWindow.close()
  }
})

ipcMain.handle('restart_app', () => {
  autoUpdater.quitAndInstall()
})

// 刷新窗口
ipcMain.handle('reload-window', (event, { ignoreCache } = { ignoreCache: false }) => {
  if (mainWindow) {
    if (ignoreCache) {
      mainWindow.webContents.reloadIgnoringCache()
    } else {
      mainWindow.reload()
    }
  }
})

// 数据库操作IPC处理器
ipcMain.handle('db-save-image', async (event, imageData) => {
  try {
    if (!db) {
      throw new Error('数据库未初始化')
    }

    const transaction = db.transaction(() => {
      // 插入主图片信息
      const insertImage = db.prepare(`
        INSERT OR REPLACE INTO images (
          unique_key, name, size, type, size_formatted,
          original_path, thumbnail_path, created_at, updated_at, date, description
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `)

      insertImage.run(
        imageData.uniqueKey,
        imageData.name,
        imageData.size,
        imageData.type,
        imageData.sizeFormatted,
        imageData.originalPath,
        imageData.thumbnailPath,
        imageData.createdAt,
        imageData.updatedAt,
        imageData.date,
        imageData.description || ''
      )

      // 插入标签
      if (imageData.tags && imageData.tags.length > 0) {
        const insertTag = db.prepare('INSERT INTO tags (image_key, tag) VALUES (?, ?)')
        for (const tag of imageData.tags) {
          insertTag.run(imageData.uniqueKey, tag)
        }
      }
    })

    transaction()
    return { success: true }
  } catch (error) {
    console.error('保存图片到数据库失败:', error)
    return { success: false, error: error.message }
  }
})

ipcMain.handle('db-get-all-images', async (event, options = {}) => {
  try {
    if (!db) {
      throw new Error('数据库未初始化')
    }

    const { page = 1, pageSize = 50, search = '' } = options
    const offset = (page - 1) * pageSize

    // 只查询元数据，避免传输 BLOB
    let query = 'SELECT unique_key, name, size, type, size_formatted, created_at, updated_at, date, description FROM images'
    let countQuery = 'SELECT COUNT(*) as count FROM images'
    let params = []

    if (search) {
      query += ' WHERE name LIKE ? OR description LIKE ?'
      countQuery += ' WHERE name LIKE ? OR description LIKE ?'
      params = [`%${search}%`, `%${search}%`]
    }

    query += ' ORDER BY created_at DESC LIMIT ? OFFSET ?'
    params.push(pageSize, offset)

    const images = db.prepare(query).all(...params)
    const totalCount = db.prepare(countQuery).get(...params.slice(0, -2)).count

    // 获取每个图片的标签
    for (const image of images) {
      const tags = db.prepare('SELECT tag FROM tags WHERE image_key = ?').all(image.unique_key)
      image.tags = tags.map(t => t.tag)
    }

    return {
      success: true,
      images,
      totalCount,
      page,
      pageSize,
      totalPages: Math.ceil(totalCount / pageSize)
    }
  } catch (error) {
    console.error('获取图片列表失败:', error)
    return { success: false, error: error.message }
  }
})

ipcMain.handle('db-get-image', async (event, uniqueKey) => {
  try {
    if (!db) {
      throw new Error('数据库未初始化')
    }

    const image = db.prepare('SELECT * FROM images WHERE unique_key = ?').get(uniqueKey)
    if (!image) {
      return { success: false, error: '图片不存在' }
    }

    // 获取标签
    const tags = db.prepare('SELECT tag FROM tags WHERE image_key = ?').all(uniqueKey)
    image.tags = tags.map(t => t.tag)

    // 获取额外图片
    const additionalImages = db.prepare('SELECT * FROM additional_images WHERE parent_key = ?').all(uniqueKey)
    image.additionalImages = additionalImages

    return { success: true, image }
  } catch (error) {
    console.error('获取图片信息失败:', error)
    return { success: false, error: error.message }
  }
})

ipcMain.handle('db-update-image', async (event, uniqueKey, updates) => {
  try {
    if (!db) {
      throw new Error('数据库未初始化')
    }

    const transaction = db.transaction(() => {
      // 更新主图片信息
      const updateFields = []
      const updateValues = []

      for (const [key, value] of Object.entries(updates)) {
        if (key !== 'tags' && key !== 'additionalImages') {
          updateFields.push(`${key} = ?`)
          updateValues.push(value)
        }
      }

      if (updateFields.length > 0) {
        updateFields.push('updated_at = ?')
        updateValues.push(Date.now())
        updateValues.push(uniqueKey)

        const updateQuery = `UPDATE images SET ${updateFields.join(', ')} WHERE unique_key = ?`
        db.prepare(updateQuery).run(...updateValues)
      }

      // 更新标签
      if (updates.tags) {
        // 删除旧标签
        db.prepare('DELETE FROM tags WHERE image_key = ?').run(uniqueKey)

        // 插入新标签
        const insertTag = db.prepare('INSERT INTO tags (image_key, tag) VALUES (?, ?)')
        for (const tag of updates.tags) {
          insertTag.run(uniqueKey, tag)
        }
      }
    })

    transaction()
    return { success: true }
  } catch (error) {
    console.error('更新图片信息失败:', error)
    return { success: false, error: error.message }
  }
})

ipcMain.handle('db-delete-image', async (event, uniqueKey) => {
  try {
    if (!db) {
      throw new Error('数据库未初始化')
    }

    const transaction = db.transaction(() => {
      // 删除标签（外键约束会自动删除）
      db.prepare('DELETE FROM tags WHERE image_key = ?').run(uniqueKey)

      // 删除额外图片（外键约束会自动删除）
      db.prepare('DELETE FROM additional_images WHERE parent_key = ?').run(uniqueKey)

      // 删除主图片
      db.prepare('DELETE FROM images WHERE unique_key = ?').run(uniqueKey)
    })

    transaction()
    return { success: true }
  } catch (error) {
    console.error('删除图片失败:', error)
    return { success: false, error: error.message }
  }
})

ipcMain.handle('db-add-additional-image', async (event, parentKey, additionalImageData) => {
  try {
    if (!db) {
      throw new Error('数据库未初始化')
    }

    const insertAdditionalImage = db.prepare(`
      INSERT INTO additional_images (
        parent_key, unique_key, name, size, type, size_formatted,
        original_path, thumbnail_path, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `)

    insertAdditionalImage.run(
      parentKey,
      additionalImageData.uniqueKey,
      additionalImageData.name,
      additionalImageData.size,
      additionalImageData.type,
      additionalImageData.sizeFormatted,
      additionalImageData.originalPath,
      additionalImageData.thumbnailPath,
      additionalImageData.createdAt
    )

    return { success: true }
  } catch (error) {
    console.error('添加额外图片失败:', error)
    return { success: false, error: error.message }
  }
})

ipcMain.handle('db-remove-additional-image', async (event, parentKey, additionalImageKey) => {
  try {
    if (!db) {
      throw new Error('数据库未初始化')
    }

    db.prepare('DELETE FROM additional_images WHERE parent_key = ? AND unique_key = ?').run(parentKey, additionalImageKey)

    return { success: true }
  } catch (error) {
    console.error('删除额外图片失败:', error)
    return { success: false, error: error.message }
  }
})

// 读取缩略图/原图路径（改为文件路径存储后，渲染进程直接读文件）
ipcMain.handle('db-get-image-paths', async (event, uniqueKey) => {
  try {
    if (!db) throw new Error('数据库未初始化')
    const row = db.prepare('SELECT original_path, thumbnail_path FROM images WHERE unique_key = ?').get(uniqueKey)
    return row || null
  } catch (e) {
    return null
  }
})

// 阅读进度：保存
ipcMain.handle('reader-save-progress', async (event, progress) => {
  try {
    if (!db) throw new Error('数据库未初始化')
    const stmt = db.prepare(`
      INSERT INTO reading_progress (book_id, file_name, file_path, file_size, page_index, total_pages, rtl, spread_mode, updated_at)
      VALUES (@book_id, @file_name, @file_path, @file_size, @page_index, @total_pages, @rtl, @spread_mode, @updated_at)
      ON CONFLICT(book_id) DO UPDATE SET
        file_name = CASE WHEN excluded.file_name IS NOT NULL AND excluded.file_name != '' THEN excluded.file_name ELSE reading_progress.file_name END,
        file_path = CASE WHEN excluded.file_path IS NOT NULL AND excluded.file_path != '' THEN excluded.file_path ELSE reading_progress.file_path END,
        file_size = CASE WHEN excluded.file_size IS NOT NULL AND excluded.file_size > 0 THEN excluded.file_size ELSE reading_progress.file_size END,
        page_index = excluded.page_index,
        total_pages = excluded.total_pages,
        rtl = excluded.rtl,
        spread_mode = excluded.spread_mode,
        updated_at = excluded.updated_at
    `)
    stmt.run({
      book_id: progress.bookId,
      file_name: progress.fileName || '',
      file_path: progress.filePath || '',
      file_size: progress.fileSize || 0,
      page_index: progress.pageIndex,
      total_pages: progress.totalPages,
      rtl: progress.rtl ? 1 : 0,
      spread_mode: progress.spreadMode || 'single',
      updated_at: Date.now()
    })
    return { success: true }
  } catch (e) {
    return { success: false, error: e.message }
  }
})

// 阅读进度：读取
ipcMain.handle('reader-load-progress', async (event, bookId) => {
  try {
    if (!db) throw new Error('数据库未初始化')
    const row = db.prepare('SELECT * FROM reading_progress WHERE book_id = ?').get(bookId)
    return { success: true, progress: row || null }
  } catch (e) {
    return { success: false, error: e.message }
  }
})

// 阅读进度：列表
ipcMain.handle('reader-list-progress', async () => {
  try {
    if (!db) throw new Error('数据库未初始化')
    const rows = db.prepare('SELECT * FROM reading_progress ORDER BY updated_at DESC').all()
    return { success: true, items: rows }
  } catch (e) {
    return { success: false, error: e.message, items: [] }
  }
})

// 阅读进度：删除
ipcMain.handle('reader-delete-progress', async (event, bookId) => {
  try {
    if (!db) throw new Error('数据库未初始化')
    db.prepare('DELETE FROM reading_progress WHERE book_id = ?').run(bookId)
    return { success: true }
  } catch (e) {
    return { success: false, error: e.message }
  }
})

ipcMain.handle('db-get-stats', async () => {
  try {
    if (!db) {
      throw new Error('数据库未初始化')
    }

    const imageCount = db.prepare('SELECT COUNT(*) as count FROM images').get().count
    const tagCount = db.prepare('SELECT COUNT(*) as count FROM tags').get().count
    const additionalImageCount = db.prepare('SELECT COUNT(*) as count FROM additional_images').get().count

    return {
      success: true,
      stats: {
        imageCount,
        tagCount,
        additionalImageCount,
        totalRecords: imageCount + tagCount + additionalImageCount
      }
    }
  } catch (error) {
    console.error('获取数据库统计失败:', error)
    return { success: false, error: error.message }
  }
})

ipcMain.handle('db-health-check', async () => {
  try {
    if (!db) {
      return { healthy: false, error: '数据库未初始化' }
    }

    // 检查表是否存在
    const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all()
    const requiredTables = ['images', 'tags', 'additional_images']
    const existingTables = tables.map(t => t.name)

    const missingTables = requiredTables.filter(table => !existingTables.includes(table))

    if (missingTables.length > 0) {
      return {
        healthy: false,
        error: `缺少必要的表: ${missingTables.join(', ')}`
      }
    }

    // 检查索引是否存在（通过 sqlite_master 列出索引）
    const indexes = db.prepare("SELECT name FROM sqlite_master WHERE type='index'").all()
    const requiredIndexes = [
      'idx_images_created_at',
      'idx_images_date',
      'idx_tags_image_key',
      'idx_additional_images_parent_key'
    ]
    const existingIndexes = indexes.map(i => i.name)

    const missingIndexes = requiredIndexes.filter(index => !existingIndexes.includes(index))

    if (missingIndexes.length > 0) {
      return {
        healthy: false,
        error: `缺少必要的索引: ${missingIndexes.join(', ')}`
      }
    }

    // 检查外键约束是否启用
    const foreignKeys = db.pragma('foreign_keys', { simple: true })
    if (foreignKeys !== 1) {
      return {
        healthy: false,
        error: '外键约束未启用'
      }
    }

    return {
      healthy: true,
      message: '数据库健康检查通过',
      tables: existingTables,
      indexes: existingIndexes
    }
  } catch (error) {
    return {
      healthy: false,
      error: `健康检查失败: ${error.message}`
    }
  }
})

ipcMain.handle('db-is-ready', async () => {
  return { ready: db !== null, error: db ? null : dbInitError }
})

// 允许渲染进程主动触发初始化并拿到错误信息
ipcMain.handle('db-init', async () => {
  if (db) return { success: true }
  const ok = await initDatabase()
  return { success: ok, error: ok ? null : dbInitError }
})

// ========== TXT 相关 API ==========

// 初始化TXT数据库
ipcMain.handle('init-txt-database', async () => {
  try {
    initTxtDatabase()
    return { success: true }
  } catch (error) {
    return { success: false, error: error.message }
  }
})

// 选择TXT文件对话框
ipcMain.handle('open-txt-dialog', async () => {
  try {
    const result = await dialog.showOpenDialog({
      properties: ['openFile', 'multiSelections'],
      filters: [
        { name: '文本文件', extensions: ['txt'] },
        { name: '所有文件', extensions: ['*'] }
      ]
    })
    return result
  } catch (error) {
    return { canceled: true, error: error.message }
  }
})

// 获取TXT文件信息
ipcMain.handle('txt-stat', async (event, filePath, encodingHint) => {
  try {
    if (!fs.existsSync(filePath)) return { success: false, error: 'TXT 文件不存在' }
    const stat = fs.statSync(filePath)
    const fileSize = stat && stat.size ? stat.size : 0
    const fileName = path.basename(filePath)

    // 统一以 Buffer 读取，再按编码解码
    const iconv = require('iconv-lite')
    const buffer = fs.readFileSync(filePath)

    function hasUtf8Bom (buf) { return buf.length >= 3 && buf[0] === 0xEF && buf[1] === 0xBB && buf[2] === 0xBF }
    function hasUtf16LeBom (buf) { return buf.length >= 2 && buf[0] === 0xFF && buf[1] === 0xFE }
    function hasUtf16BeBom (buf) { return buf.length >= 2 && buf[0] === 0xFE && buf[1] === 0xFF }

    const decodeBy = (enc) => {
      let text = ''
      if (enc === 'utf8-bom') {
        text = iconv.decode(buffer, 'utf8')
        if (text.charCodeAt(0) === 0xFEFF) text = text.slice(1)
        return { text, used: 'utf8-bom' }
      }
      if (enc === 'utf16le') return { text: iconv.decode(buffer, 'utf16le'), used: 'utf16le' }
      if (enc === 'utf16be') return { text: iconv.decode(buffer, 'utf16be'), used: 'utf16be' }
      if (enc === 'gb18030') return { text: iconv.decode(buffer, 'gb18030'), used: 'gb18030' }
      if (enc === 'gbk' || enc === 'ansi') return { text: iconv.decode(buffer, 'gbk'), used: 'gbk' }
      // default utf8
      return { text: iconv.decode(buffer, 'utf8'), used: 'utf8' }
    }

    let content = ''
    let encoding = 'utf8'
    if (encodingHint) {
      const r = decodeBy(encodingHint)
      content = r.text
      encoding = r.used
    } else if (hasUtf8Bom(buffer)) {
      const r = decodeBy('utf8-bom')
      content = r.text
      encoding = r.used
    } else if (hasUtf16LeBom(buffer)) {
      const r = decodeBy('utf16le')
      content = r.text
      encoding = r.used
    } else if (hasUtf16BeBom(buffer)) {
      const r = decodeBy('utf16be')
      content = r.text
      encoding = r.used
    } else {
      // 先尝试 utf8，再回退 gb18030、gbk
      let r = decodeBy('utf8')
      // 简单启发：如果出现大量替换符，则尝试东亚编码
      const replacementCount = (r.text.match(/�/g) || []).length
      if (replacementCount > 0) {
        r = decodeBy('gb18030')
        const rep2 = (r.text.match(/�/g) || []).length
        if (rep2 > 0) {
          r = decodeBy('gbk')
        }
      }
      content = r.text
      encoding = r.used
    }

    const pageCount = Math.ceil(content.length / 2000)

    return {
      success: true,
      fileSize,
      fileName,
      filePath,
      pageCount,
      contentLength: content.length,
      encoding: encoding
    }
  } catch (error) {
    return { success: false, error: error.message }
  }
})

// 读取TXT文件内容并分页
ipcMain.handle('txt-read-content', async (event, filePath, encodingHint) => {
  try {
    if (!fs.existsSync(filePath)) return { success: false, error: 'TXT 文件不存在' }
    // 统一以 Buffer 读取，再按编码解码
    const iconv = require('iconv-lite')
    const buffer = fs.readFileSync(filePath)
    function hasUtf8Bom (buf) { return buf.length >= 3 && buf[0] === 0xEF && buf[1] === 0xBB && buf[2] === 0xBF }
    function hasUtf16LeBom (buf) { return buf.length >= 2 && buf[0] === 0xFF && buf[1] === 0xFE }
    function hasUtf16BeBom (buf) { return buf.length >= 2 && buf[0] === 0xFE && buf[1] === 0xFF }
    const decodeBy = (enc) => {
      let text = ''
      if (enc === 'utf8-bom') {
        text = iconv.decode(buffer, 'utf8')
        if (text.charCodeAt(0) === 0xFEFF) text = text.slice(1)
        return { text, used: 'utf8-bom' }
      }
      if (enc === 'utf16le') return { text: iconv.decode(buffer, 'utf16le'), used: 'utf16le' }
      if (enc === 'utf16be') return { text: iconv.decode(buffer, 'utf16be'), used: 'utf16be' }
      if (enc === 'gb18030') return { text: iconv.decode(buffer, 'gb18030'), used: 'gb18030' }
      if (enc === 'gbk' || enc === 'ansi') return { text: iconv.decode(buffer, 'gbk'), used: 'gbk' }
      return { text: iconv.decode(buffer, 'utf8'), used: 'utf8' }
    }
    let content = ''
    let encoding = 'utf8'
    if (encodingHint) {
      const r = decodeBy(encodingHint)
      content = r.text
      encoding = r.used
    } else if (hasUtf8Bom(buffer)) {
      const r = decodeBy('utf8-bom')
      content = r.text
      encoding = r.used
    } else if (hasUtf16LeBom(buffer)) {
      const r = decodeBy('utf16le')
      content = r.text
      encoding = r.used
    } else if (hasUtf16BeBom(buffer)) {
      const r = decodeBy('utf16be')
      content = r.text
      encoding = r.used
    } else {
      let r = decodeBy('utf8')
      const replacementCount = (r.text.match(/�/g) || []).length
      if (replacementCount > 0) {
        r = decodeBy('gb18030')
        const rep2 = (r.text.match(/�/g) || []).length
        if (rep2 > 0) {
          r = decodeBy('gbk')
        }
      }
      content = r.text
      encoding = r.used
    }

    const stat = fs.statSync(filePath)
    const fileSize = stat && stat.size ? stat.size : 0

    // 分页处理，每页约2000字符
    const pages = []
    const pageSize = 2000

    for (let i = 0; i < content.length; i += pageSize) {
      const pageContent = content.slice(i, i + pageSize)
      pages.push(pageContent)
    }

    return {
      success: true,
      pages,
      fileSize,
      totalPages: pages.length,
      contentLength: content.length,
      encoding: encoding
    }
  } catch (error) {
    return { success: false, error: error.message }
  }
})

// TXT阅读进度：保存
ipcMain.handle('txt-save-progress', async (event, progressData) => {
  try {
    const txtDb = new Database(txtDbPath)

    const { bookId, fileName, filePath, fileSize, pageIndex, totalPages, encoding } = progressData

    txtDb.prepare(`
      INSERT OR REPLACE INTO txt_progress 
      (book_id, file_name, file_path, file_size, page_index, total_pages, updated_at, encoding)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(bookId, fileName, filePath, fileSize, pageIndex, totalPages, Math.floor(Date.now() / 1000), encoding || null)

    txtDb.close()
    return { success: true }
  } catch (error) {
    return { success: false, error: error.message }
  }
})

// TXT阅读进度：加载
ipcMain.handle('txt-load-progress', async (event, bookId) => {
  try {
    const txtDb = new Database(txtDbPath)

    const row = txtDb.prepare('SELECT * FROM txt_progress WHERE book_id = ?').get(bookId)

    txtDb.close()

    if (row) {
      return { success: true, progress: row }
    } else {
      return { success: false, error: '未找到阅读进度' }
    }
  } catch (error) {
    return { success: false, error: error.message }
  }
})

// TXT阅读进度：获取历史列表
ipcMain.handle('txt-get-history-list', async () => {
  try {
    const txtDb = new Database(txtDbPath)

    const rows = txtDb.prepare('SELECT * FROM txt_progress ORDER BY updated_at DESC').all()

    txtDb.close()

    return { success: true, items: rows }
  } catch (error) {
    return { success: false, error: error.message, items: [] }
  }
})

// TXT阅读进度：删除
ipcMain.handle('txt-delete-progress', async (event, bookId) => {
  try {
    const txtDb = new Database(txtDbPath)

    txtDb.prepare('DELETE FROM txt_progress WHERE book_id = ?').run(bookId)

    txtDb.close()

    return { success: true }
  } catch (error) {
    return { success: false, error: error.message }
  }
})

// ========== 设置相关 API ==========

// 获取设置
ipcMain.handle('get-settings', async () => {
  try {
    const settings = loadSettings()
    return { success: true, settings }
  } catch (error) {
    return { success: false, error: error.message }
  }
})

// 保存设置
ipcMain.handle('save-settings', async (event, newSettings) => {
  try {
    const success = saveSettings(newSettings)
    if (success) {
      // 重新加载设置以更新数据库路径
      loadSettings()

      // 返回迁移信息
      if (newSettings.databasePath && newSettings.databasePath !== process.cwd()) {
        return {
          success: true,
          message: '设置保存成功，数据库文件已迁移到新路径',
          migrated: true,
          newPath: newSettings.databasePath
        }
      } else {
        return {
          success: true,
          message: '设置保存成功',
          migrated: false
        }
      }
    }
    return { success: false, error: '保存失败' }
  } catch (error) {
    return { success: false, error: error.message }
  }
})

// 选择数据库路径
ipcMain.handle('select-database-path', async () => {
  try {
    const result = await dialog.showOpenDialog({
      properties: ['openDirectory'],
      title: '选择数据库存放目录'
    })
    return result
  } catch (error) {
    return { canceled: true, error: error.message }
  }
})

// 获取当前工作目录
ipcMain.handle('get-current-working-directory', async () => {
  try {
    return { success: true, path: process.cwd() }
  } catch (error) {
    return { success: false, error: error.message }
  }
})