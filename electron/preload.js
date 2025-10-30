const { contextBridge, ipcRenderer } = require('electron')

// 暴露安全的 API 到渲染进程
contextBridge.exposeInMainWorld('electronAPI', {
    // updater
    restartApp: () => ipcRenderer.invoke('restart_app'),
    onUpdateAvailable: (callback) => ipcRenderer.on('update_available', callback),
    onUpdateDownloaded: (callback) => ipcRenderer.on('update_downloaded', callback),
    onDownloadProgress: (callback) => ipcRenderer.on('download_progress', callback),
    // 系统信息
    getVersion: () => process.versions.electron,
    getPlatform: () => process.platform,

    // 清理事件监听器（保留）
    removeAllListeners: (channel) => {
        ipcRenderer.removeAllListeners(channel)
    },

    // 文件系统相关API
    readFolderTree: (dirPath) => ipcRenderer.invoke('read-folder-tree', dirPath),
    readFolderChildren: (params) => ipcRenderer.invoke('read-folder-children', params),
    readImageFiles: (dirPath) => ipcRenderer.invoke('read-image-files', dirPath),
    readImageBase64: (imgPath) => ipcRenderer.invoke('read-image-base64', imgPath),
    readImageBuffer: (imgPath) => ipcRenderer.invoke('read-image-buffer', imgPath),
    
    // 文件夹操作API
    deleteFolders: (folderPaths) => ipcRenderer.invoke('delete-folders', folderPaths),
    moveFolders: (params) => ipcRenderer.invoke('move-folders', params),

    // 图片管理相关API
    getAppDataPath: () => ipcRenderer.invoke('getAppDataPath'),
    ensureDirectoryExists: (dirPath) => ipcRenderer.invoke('ensureDirectoryExists', dirPath),
    writeFile: (filePath, data) => ipcRenderer.invoke('writeFile', filePath, data),
    readFile: (filePath) => ipcRenderer.invoke('readFile', filePath),
    fileExists: (filePath) => ipcRenderer.invoke('fileExists', filePath),
    deleteFile: (filePath) => ipcRenderer.invoke('deleteFile', filePath),
    deleteDirectory: (dirPath) => ipcRenderer.invoke('deleteDirectory', dirPath),
    readDirectory: (dirPath) => ipcRenderer.invoke('readDirectory', dirPath),

    // 窗口控制API
    minimizeWindow: () => ipcRenderer.invoke('minimize-window'),
    maximizeWindow: () => ipcRenderer.invoke('maximize-window'),
    closeWindow: () => ipcRenderer.invoke('close-window'),
    reloadWindow: (ignoreCache = false) => ipcRenderer.invoke('reload-window', { ignoreCache }),

    // 数据库操作API
    dbSaveImage: (imageData) => ipcRenderer.invoke('db-save-image', imageData),
    dbGetAllImages: (options) => ipcRenderer.invoke('db-get-all-images', options),
    dbGetImage: (uniqueKey) => ipcRenderer.invoke('db-get-image', uniqueKey),
    dbUpdateImage: (uniqueKey, updates) => ipcRenderer.invoke('db-update-image', uniqueKey, updates),
    dbDeleteImage: (uniqueKey) => ipcRenderer.invoke('db-delete-image', uniqueKey),
    dbAddAdditionalImage: (parentKey, additionalImageData) => ipcRenderer.invoke('db-add-additional-image', parentKey, additionalImageData),
    dbRemoveAdditionalImage: (parentKey, additionalImageKey) => ipcRenderer.invoke('db-remove-additional-image', parentKey, additionalImageKey),
    dbGetStats: () => ipcRenderer.invoke('db-get-stats'),
    dbHealthCheck: () => ipcRenderer.invoke('db-health-check'),
    dbIsReady: () => ipcRenderer.invoke('db-is-ready'),
    dbInit: () => ipcRenderer.invoke('db-init'),
    // 获取图片文件路径
    dbGetImagePaths: (uniqueKey) => ipcRenderer.invoke('db-get-image-paths', uniqueKey),
    readerSaveProgress: (progress) => ipcRenderer.invoke('reader-save-progress', progress),
    readerLoadProgress: (bookId) => ipcRenderer.invoke('reader-load-progress', bookId),
    readerListProgress: () => ipcRenderer.invoke('reader-list-progress'),
    readerDeleteProgress: (bookId) => ipcRenderer.invoke('reader-delete-progress', bookId),
    epubReadImages: (epubPath) => ipcRenderer.invoke('epub-read-images', epubPath),
    epubStat: (epubPath) => ipcRenderer.invoke('epub-stat', epubPath),
    // 本地文件选择
    openEpubDialog: () => ipcRenderer.invoke('dialog-open-epub'),
    
    // TXT 相关 API
    initTxtDatabase: () => ipcRenderer.invoke('init-txt-database'),
    openTxtDialog: () => ipcRenderer.invoke('open-txt-dialog'),
    txtStat: (filePath, encoding) => ipcRenderer.invoke('txt-stat', filePath, encoding),
    txtReadContent: (filePath, encoding) => ipcRenderer.invoke('txt-read-content', filePath, encoding),
    txtSaveProgress: (progressData) => ipcRenderer.invoke('txt-save-progress', progressData),
    txtLoadProgress: (bookId) => ipcRenderer.invoke('txt-load-progress', bookId),
    txtGetHistoryList: () => ipcRenderer.invoke('txt-get-history-list'),
    txtDeleteProgress: (bookId) => ipcRenderer.invoke('txt-delete-progress', bookId),
    
    // 设置相关 API
    getSettings: () => ipcRenderer.invoke('get-settings'),
    saveSettings: (settings) => ipcRenderer.invoke('save-settings', settings),
    selectDatabasePath: () => ipcRenderer.invoke('select-database-path'),
    getCurrentWorkingDirectory: () => ipcRenderer.invoke('get-current-working-directory')
})

// 开发模式调试信息
if (process.env.NODE_ENV === 'development') {
    console.log('🔧 Electron preload loaded successfully')
    console.log('📊 Available APIs:', Object.keys(window.electronAPI || {}))
}

// 确保 DOM 加载完成后 API 可用
window.addEventListener('DOMContentLoaded', () => {
    console.log('✅ DOM loaded, electronAPI ready:', !!window.electronAPI)
})