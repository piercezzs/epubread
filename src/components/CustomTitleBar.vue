<template>
  <div class="custom-title-bar">
    <!-- 左侧：应用图标和名称 -->
    <div class="title-bar-left">
      <img
        src="/src/static/images/logo.svg"
        alt="Logo"
        class="title-bar-logo"
        @error="handleImageError"
      />
      <span class="title-bar-title">epubread</span>
    </div>

    <!-- 右侧：窗口控制按钮 -->
    <div class="title-bar-right">
      <button class="title-bar-button minimize" @click="minimizeWindow">
        <svg width="12" height="12" viewBox="0 0 12 12">
          <rect x="2" y="5" width="8" height="2" fill="currentColor" />
        </svg>
      </button>
      <button class="title-bar-button maximize" @click="maximizeWindow">
        <svg width="12" height="12" viewBox="0 0 12 12">
          <rect
            x="2"
            y="2"
            width="8"
            height="8"
            fill="none"
            stroke="currentColor"
            stroke-width="1"
          />
        </svg>
      </button>
      <button class="title-bar-button close" @click="closeWindow">
        <svg width="12" height="12" viewBox="0 0 12 12">
          <path
            d="M2 2L10 10M10 2L2 10"
            stroke="currentColor"
            stroke-width="1.5"
            stroke-linecap="round"
          />
        </svg>
      </button>
    </div>
  </div>
</template>

<script setup>
import { onMounted } from "vue";

// 处理图片加载错误
const handleImageError = (event) => {
  const target = event.target;
  target.style.display = "none";

  // 创建默认图标
  const fallbackIcon = document.createElement("div");
  fallbackIcon.innerHTML = `
    <svg viewBox="0 0 24 24" style="width: 16px; height: 16px; color: #1890ff;">
      <path fill="currentColor" d="M12 2L2 7V17L12 22L22 17V7L12 2Z" />
    </svg>
  `;
  target.parentNode.appendChild(fallbackIcon);
};

// 窗口控制函数
const minimizeWindow = () => {
  if (window.electronAPI) {
    window.electronAPI.minimizeWindow();
  }
};

const maximizeWindow = () => {
  if (window.electronAPI) {
    window.electronAPI.maximizeWindow();
  }
};

const closeWindow = () => {
  if (window.electronAPI) {
    window.electronAPI.closeWindow();
  }
};

onMounted(() => {
  // 确保标题栏可以拖动窗口
  const titleBar = document.querySelector(".custom-title-bar");
  if (titleBar) {
    titleBar.style.webkitAppRegion = "drag";
  }
});
</script>

<style scoped>
.custom-title-bar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  height: 40px;
  background: #ffffff;
  border-bottom: 1px solid #e8e8e8;
  padding: 0 16px;
  -webkit-app-region: drag;
  user-select: none;
  z-index: 1005;
}

.title-bar-left {
  display: flex;
  align-items: center;
  gap: 8px;
  -webkit-app-region: no-drag;
}

.title-bar-logo {
  width: 16px;
  height: 16px;
  object-fit: contain;
}

.title-bar-title {
  font-size: 14px;
  font-weight: 500;
  color: #333;
}

.title-bar-right {
  display: flex;
  align-items: center;
  gap: 4px;
  -webkit-app-region: no-drag;
}

.title-bar-button {
  width: 32px;
  height: 32px;
  border: none;
  background: transparent;
  color: #666;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 4px;
  transition: all 0.2s ease;
}

.title-bar-button:hover {
  background: #f5f5f5;
  color: #333;
}

.title-bar-button.close:hover {
  background: #ff4d4f;
  color: #fff;
}

.title-bar-button.minimize:hover {
  background: #f0f0f0;
}

.title-bar-button.maximize:hover {
  background: #f0f0f0;
}
</style>
