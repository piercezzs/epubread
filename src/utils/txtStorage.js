// TXT 数据存储工具
class TxtStorage {
  constructor() {
    this.db = null;
    this.init();
  }

  async init() {
    try {
      // 通过 electron API 初始化数据库
      const result = await window.electronAPI.initTxtDatabase();
      if (result && result.success) {
        console.log('TXT 数据库初始化成功');
      }
    } catch (error) {
      console.error('TXT 数据库初始化失败:', error);
    }
  }

  // 保存阅读进度
  async saveProgress(progressData) {
    try {
      const result = await window.electronAPI.txtSaveProgress(progressData);
      return result;
    } catch (error) {
      console.error('保存 TXT 阅读进度失败:', error);
      return { success: false, error: error.message };
    }
  }

  // 加载阅读进度
  async loadProgress(bookId) {
    try {
      const result = await window.electronAPI.txtLoadProgress(bookId);
      return result;
    } catch (error) {
      console.error('加载 TXT 阅读进度失败:', error);
      return { success: false, error: error.message };
    }
  }

  // 获取阅读历史列表
  async getHistoryList() {
    try {
      const result = await window.electronAPI.txtGetHistoryList();
      return result;
    } catch (error) {
      console.error('获取 TXT 阅读历史失败:', error);
      return { success: false, error: error.message };
    }
  }

  // 删除阅读记录
  async deleteProgress(bookId) {
    try {
      const result = await window.electronAPI.txtDeleteProgress(bookId);
      return result;
    } catch (error) {
      console.error('删除 TXT 阅读记录失败:', error);
      return { success: false, error: error.message };
    }
  }

  // 生成书籍唯一标识
  generateBookId(filePath, fileSize) {
    const fileName = this.getFileName(filePath);
    return `txt:${fileName}:${fileSize || 0}`;
  }

  // 获取文件名
  getFileName(filePath) {
    if (!filePath) return '';
    const parts = filePath.split(/\\|\//);
    return parts[parts.length - 1];
  }

  // 格式化文件大小
  formatFileSize(bytes) {
    const b = Number(bytes) || 0;
    if (b <= 0) return "0 B";
    const units = ["B", "KB", "MB", "GB", "TB"];
    const i = Math.floor(Math.log(b) / Math.log(1024));
    const v = (b / Math.pow(1024, i)).toFixed(2);
    return `${v} ${units[i]}`;
  }
}

export default new TxtStorage(); 