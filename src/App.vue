<template>
  <n-config-provider :locale="zhCN" :date-locale="dateZhCN">
    <n-message-provider>
      <div class="app-container">
        <!-- 自定义标题栏 -->
        <CustomTitleBar />

        <!-- 主要内容 -->
        <div class="main-content">
          <!-- 左侧侧边栏 -->
          <div class="sidebar">
            <div class="menu-list">
              <div
                class="menu-item"
                :class="{ active: currentRoute === '/epub' }"
                @click="navigateTo('/epub')"
              >
                <n-icon><BookOutline /></n-icon>
                <span>EPUB</span>
              </div>
              <div
                class="menu-item"
                :class="{ active: currentRoute === '/txt' }"
                @click="navigateTo('/txt')"
              >
                <n-icon><DocumentTextOutline /></n-icon>
                <span>TXT</span>
              </div>
              <div
                class="menu-item"
                :class="{ active: currentRoute === '/settings' }"
                @click="navigateTo('/settings')"
              >
                <n-icon><SettingsOutline /></n-icon>
                <span>设置</span>
              </div>
            </div>
          </div>

          <!-- 右侧内容区域 -->
          <div class="content-area">
            <router-view />
          </div>
        </div>
      </div>
    </n-message-provider>
  </n-config-provider>

  <n-modal v-model:show="showUpdateModal" :mask-closable="false">
    <n-card
      style="width: 400px"
      :title="
        updateError
          ? '更新出错'
          : updateDownloaded
          ? '有新版本可用'
          : '正在下载更新'
      "
      :bordered="false"
      size="huge"
      role="dialog"
      aria-modal="true"
    >
      <div v-if="updateError">
        <p>下载更新时遇到问题：</p>
        <p>
          <strong>{{ updateError }}</strong>
        </p>
        <n-button @click="showUpdateModal = false" style="margin-top: 20px">
          关闭
        </n-button>
      </div>
      <div v-else-if="!updateDownloaded">
        <n-progress type="line" :percentage="downloadProgress" />
        <p style="text-align: center; margin-top: 10px">请稍候...</p>
      </div>
      <div v-else style="text-align: center">
        <p>新版本已下载完成，重启应用以安装更新。</p>
        <n-button type="primary" @click="restartApp" style="margin-top: 20px">
          重启并安装
        </n-button>
      </div>
    </n-card>
  </n-modal>
</template>

<script setup>
import { ref, computed, onMounted } from "vue";
import { useRouter, useRoute } from "vue-router";
import {
  NConfigProvider,
  NMessageProvider,
  NIcon,
  zhCN,
  dateZhCN,
  NModal,
  NCard,
  NProgress,
  NButton,
} from "naive-ui";
import {
  BookOutline,
  DocumentTextOutline,
  SettingsOutline,
} from "@vicons/ionicons5";
import CustomTitleBar from "./components/CustomTitleBar.vue";

const router = useRouter();
const route = useRoute();

const currentRoute = computed(() => route.path);

const navigateTo = (path) => {
  router.push(path);
};

// Updater state
const showUpdateModal = ref(false);
const downloadProgress = ref(0);
const updateDownloaded = ref(false);
const updateError = ref(null);

onMounted(() => {
  if (window.electronAPI) {
    window.electronAPI.onUpdateAvailable(() => {
      showUpdateModal.value = true;
      updateDownloaded.value = false;
      updateError.value = null;
    });

    window.electronAPI.onDownloadProgress((_event, progressObj) => {
      downloadProgress.value = Math.round(progressObj.percent);
    });

    window.electronAPI.onUpdateDownloaded(() => {
      updateDownloaded.value = true;
      updateError.value = null;
    });

    window.electronAPI.onUpdateError((_event, err) => {
      updateError.value = err;
      updateDownloaded.value = false; // Stay in modal to show error
      showUpdateModal.value = true; // Show modal on error
    });
  }
});

const restartApp = () => {
  window.electronAPI.restartApp();
};
</script>

<style>
@import "./static/css/flex.css";
@import "./static/css/common.css";
/* 全局样式 */
* {
  margin: 0;
  padding: 0;
  box-sizing: border-box;
}

html,
body {
  height: 100%;
  overflow: hidden;
}

body {
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto,
    "Helvetica Neue", Arial, sans-serif;
}

#app {
  height: 100vh;
  overflow: hidden;
}

/* 应用容器 */
.app-container {
  height: 100vh;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.main-content {
  flex: 1;
  overflow: hidden;
  display: flex;
}

/* 侧边栏样式 */
.sidebar {
  width: 200px;
  background: #f5f5f5;
  border-right: 1px solid #e8e8e8;
  flex-shrink: 0;
}

.menu-list {
  padding: 20px 0;
}

.menu-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 16px 20px;
  cursor: pointer;
  transition: all 0.2s ease;
  color: #666;
}

.menu-item:hover {
  background: #e8f4fd;
  color: #1890ff;
}

.menu-item.active {
  background: #e6f7ff;
  color: #1890ff;
  border-right: 3px solid #1890ff;
}

.menu-item .n-icon {
  font-size: 18px;
}

.menu-item span {
  font-size: 16px;
  font-weight: 500;
}

/* 内容区域 */
.content-area {
  flex: 1;
  overflow: hidden;
}
</style>
