<template>
  <div class="settings-layout">
    <div class="settings-header">
      <h1>设置</h1>
      <p>配置应用程序的基本设置</p>
    </div>

    <div class="settings-content">
      <!-- 数据库设置 -->
      <div class="settings-section">
        <div class="section-header">
          <h2>数据库设置</h2>
          <p>配置数据库文件的存放路径</p>
        </div>

        <div class="setting-item">
          <div class="setting-label">
            <label>数据库路径</label>
            <span class="setting-description"
              >指定数据库文件的存放位置，修改后需要重启应用生效</span
            >
          </div>

          <div class="setting-control">
            <n-input
              v-model:value="databasePath"
              placeholder="请输入数据库路径"
              size="large"
              style="width: 100%"
              readonly
            />
            <n-button
              @click="selectDatabasePath"
              type="primary"
              size="large"
              style="margin-left: 12px"
            >
              选择路径
            </n-button>
          </div>

          <div class="setting-actions">
            <n-button @click="resetToDefault" size="small" secondary>
              重置为默认
            </n-button>
            <n-button
              @click="saveSettings"
              type="primary"
              size="small"
              :loading="saving"
            >
              {{
                databasePath && databasePath !== currentDatabasePath
                  ? "保存并迁移"
                  : "保存设置"
              }}
            </n-button>
          </div>

          <div
            v-if="databasePath && databasePath !== currentDatabasePath"
            class="migration-notice"
          >
            <span>选择新路径后，保存时将自动迁移现有数据库文件到新位置</span>
          </div>
        </div>
      </div>

      <!-- 当前状态信息 -->
      <div class="settings-section">
        <div class="section-header">
          <h2>当前状态</h2>
          <p>显示当前数据库配置信息</p>
        </div>

        <div class="status-info">
          <div class="status-item">
            <span class="status-label">当前数据库路径:</span>
            <span class="status-value">{{ currentDatabasePath }}</span>
          </div>
          <div class="status-item">
            <span class="status-label">数据库状态:</span>
            <span
              class="status-value"
              :class="{
                'status-success': dbStatus.healthy,
                'status-error': !dbStatus.healthy,
              }"
            >
              {{ dbStatus.healthy ? "正常" : "异常" }}
            </span>
          </div>
          <div v-if="!dbStatus.healthy" class="status-item">
            <span class="status-label">错误信息:</span>
            <span class="status-value status-error">{{
              dbStatus.error || "未知错误"
            }}</span>
          </div>
        </div>
      </div>

      <!-- 关于与更新 -->
      <div class="settings-section">
        <div class="section-header">
          <h2>关于与更新</h2>
          <p>查看应用信息并检查更新</p>
        </div>

        <div class="status-info">
          <div class="status-item">
            <span class="status-label">当前版本:</span>
            <span class="status-value">{{ appVersion }}</span>
          </div>
          <div class="status-item">
            <span class="status-label">更新状态:</span>
            <span class="status-value">{{
              updateStatus || "点击按钮检查更新"
            }}</span>
          </div>
        </div>

        <div class="setting-item">
          <div class="setting-actions">
            <n-button @click="checkForUpdates" type="primary" size="large">
              检查更新
            </n-button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, onBeforeUnmount } from "vue";
import { NButton, NInput, useMessage, NIcon } from "naive-ui";

const message = useMessage();

// 状态
const databasePath = ref("");
const saving = ref(false);
const currentDatabasePath = ref("");
const dbStatus = ref({ healthy: false, error: null });
const appVersion = ref("");
const updateStatus = ref("");

// 初始化
onMounted(async () => {
  await loadSettings();
  await checkDatabaseStatus();

  // 获取应用版本
  try {
    appVersion.value = await window.electronAPI.getAppVersion();
  } catch (error) {
    console.error("获取应用版本失败:", error);
    appVersion.value = "N/A";
  }

  // 监听更新事件
  window.electronAPI.onCheckingForUpdate(() => {
    updateStatus.value = "正在检查更新...";
  });
  window.electronAPI.onUpdateAvailable(() => {
    updateStatus.value = "发现新版本，正在下载...";
    message.info(updateStatus.value);
  });
  window.electronAPI.onUpdateDownloaded(() => {
    updateStatus.value = "新版本已下载，重启应用以安装";
    message.success(updateStatus.value);
  });
  window.electronAPI.onUpdateNotAvailable(() => {
    updateStatus.value = "当前已是最新版本";
    message.success(updateStatus.value);
  });
  window.electronAPI.onDownloadProgress((event, progressObj) => {
    updateStatus.value = `下载中... ${Math.round(progressObj.percent)}%`;
  });
  window.electronAPI.onUpdateError((_event, err) => {
    updateStatus.value = `更新失败: ${err}`;
    message.error(updateStatus.value);
  });
});

onBeforeUnmount(() => {
  // 清理监听器
  window.electronAPI.removeAllListeners("update_checking");
  window.electronAPI.removeAllListeners("update_available");
  window.electronAPI.removeAllListeners("update_downloaded");
  window.electronAPI.removeAllListeners("update_not_available");
  window.electronAPI.removeAllListeners("download_progress");
  window.electronAPI.removeAllListeners("update_error");
});

// 加载设置
async function loadSettings() {
  try {
    const result = await window.electronAPI.getSettings();
    if (result && result.success) {
      databasePath.value = result.settings.databasePath || "";
      currentDatabasePath.value = result.settings.databasePath || "默认路径";
    }
  } catch (error) {
    console.error("加载设置失败:", error);
    message.error("加载设置失败");
  }
}

// 选择数据库路径
async function selectDatabasePath() {
  try {
    const result = await window.electronAPI.selectDatabasePath();
    if (
      result &&
      !result.canceled &&
      result.filePaths &&
      result.filePaths.length > 0
    ) {
      const selectedPath = result.filePaths[0];

      // 验证路径是否有效 - 通过 API 获取当前工作目录
      try {
        const result = await window.electronAPI.getCurrentWorkingDirectory();
        if (result && result.success && selectedPath === result.path) {
          message.warning("不能选择当前项目目录作为数据库路径");
          return;
        }
      } catch (error) {
        console.warn("无法验证路径，继续执行");
      }

      databasePath.value = selectedPath;
      message.info("已选择路径，点击保存按钮将迁移数据库文件");
    }
  } catch (error) {
    console.error("选择路径失败:", error);
    message.error("选择路径失败");
  }
}

// 重置为默认路径
function resetToDefault() {
  databasePath.value = "";
  message.info("已重置为默认路径");
}

// 保存设置
async function saveSettings() {
  if (!databasePath.value.trim()) {
    message.warning("请输入数据库路径");
    return;
  }

  try {
    saving.value = true;
    const result = await window.electronAPI.saveSettings({
      databasePath: databasePath.value.trim(),
    });

    if (result && result.success) {
      if (result.migrated) {
        message.success(`设置保存成功！数据库文件已迁移到: ${result.newPath}`);
        message.info("请重启应用以使用新的数据库路径");
      } else {
        message.success("设置保存成功");
      }
      currentDatabasePath.value = databasePath.value;
    } else {
      message.error(result.error || "保存设置失败");
    }
  } catch (error) {
    console.error("保存设置失败:", error);
    message.error("保存设置失败");
  } finally {
    saving.value = false;
  }
}

// 检查数据库状态
async function checkDatabaseStatus() {
  try {
    const result = await window.electronAPI.dbHealthCheck();
    if (result) {
      dbStatus.value = result;
    }
  } catch (error) {
    console.error("检查数据库状态失败:", error);
    dbStatus.value = { healthy: false, error: "检查失败" };
  }
}

// 检查更新
async function checkForUpdates() {
  try {
    updateStatus.value = "正在检查更新...";
    message.info(updateStatus.value);
    await window.electronAPI.checkForUpdates();
  } catch (error) {
    console.error("检查更新失败:", error);
    updateStatus.value = "检查更新失败";
    message.error(updateStatus.value);
  }
}
</script>

<style scoped>
.settings-layout {
  height: 100%;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.settings-header {
  padding: 24px;
  border-bottom: 1px solid #e8e8e8;
  background: #fff;
}

.settings-header h1 {
  margin: 0 0 8px 0;
  font-size: 24px;
  font-weight: 600;
  color: #333;
}

.settings-header p {
  margin: 0;
  color: #666;
  font-size: 14px;
}

.settings-content {
  flex: 1;
  padding: 24px;
  overflow-y: auto;
}

.settings-section {
  margin-bottom: 32px;
  background: #fff;
  border-radius: 8px;
  border: 1px solid #e8e8e8;
  overflow: hidden;
}

.section-header {
  padding: 20px 24px;
  background: #fafafa;
  border-bottom: 1px solid #e8e8e8;
}

.section-header h2 {
  margin: 0 0 8px 0;
  font-size: 18px;
  font-weight: 600;
  color: #333;
}

.section-header p {
  margin: 0;
  color: #666;
  font-size: 14px;
}

.setting-item {
  padding: 24px;
}

.setting-label {
  margin-bottom: 16px;
}

.setting-label label {
  display: block;
  font-size: 16px;
  font-weight: 500;
  color: #333;
  margin-bottom: 8px;
}

.setting-description {
  display: block;
  font-size: 14px;
  color: #666;
  line-height: 1.5;
}

.setting-control {
  display: flex;
  align-items: center;
  margin-bottom: 16px;
}

.setting-actions {
  display: flex;
  gap: 12px;
  justify-content: flex-end;
}

.migration-notice {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 12px;
  padding: 12px;
  background: #e6f7ff;
  border: 1px solid #91d5ff;
  border-radius: 6px;
  color: #1890ff;
  font-size: 14px;
}

.status-info {
  padding: 24px;
}

.status-item {
  display: flex;
  align-items: center;
  margin-bottom: 16px;
  padding: 12px;
  background: #fafafa;
  border-radius: 6px;
}

.status-item:last-child {
  margin-bottom: 0;
}

.status-label {
  font-size: 14px;
  color: #666;
  min-width: 120px;
  margin-right: 16px;
}

.status-value {
  font-size: 14px;
  color: #333;
  font-family: monospace;
  word-break: break-all;
}

.status-success {
  color: #52c41a;
  font-weight: 500;
}

.status-error {
  color: #ff4d4f;
  font-weight: 500;
}

/* 响应式设计 */
@media (max-width: 768px) {
  .settings-header {
    padding: 16px;
  }

  .settings-content {
    padding: 16px;
  }

  .setting-control {
    flex-direction: column;
    align-items: stretch;
  }

  .setting-control .n-button {
    margin-left: 0;
    margin-top: 12px;
  }

  .setting-actions {
    justify-content: stretch;
  }

  .setting-actions .n-button {
    flex: 1;
  }
}
</style>
