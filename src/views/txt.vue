<template>
  <div class="txt-layout">
    <!-- 顶部工具栏 -->
    <div class="top-toolbar">
      <div class="toolbar-left">
        <n-button @click="chooseTxt" type="primary" size="small"
          >选择TXT</n-button
        >
        <n-button
          size="small"
          secondary
          @click="toggleReader"
          :type="readerVisible ? 'warning' : 'primary'"
          >{{ readerVisible ? "退出阅读" : "进入阅读" }}</n-button
        >
      </div>
      <div class="toolbar-right">
        <n-button size="small" secondary @click="reload(false)">刷新</n-button>
        <n-button size="small" tertiary @click="reload(true)"
          >强制刷新</n-button
        >
        <n-select
          v-model:value="sortKey"
          size="small"
          style="width: 120px"
          :options="sortKeyOptions"
        />
        <n-button size="small" @click="toggleSortOrder">{{
          sortOrder === "asc" ? "升序" : "降序"
        }}</n-button>
        <n-radio-group v-model:value="viewMode" size="small">
          <n-radio-button value="table">表格</n-radio-button>
          <n-radio-button value="card">卡片</n-radio-button>
        </n-radio-group>
        <n-input
          v-model:value="searchKeyword"
          placeholder="搜索文件名..."
          size="small"
          style="width: 200px"
        >
          <template #prefix>
            <n-icon><SearchOutline /></n-icon>
          </template>
        </n-input>
      </div>
    </div>

    <!-- 主要内容区域 -->
    <div class="main-content">
      <div class="txt-container">
        <div v-if="loading" class="loading-state">
          <n-spin size="large">
            <template #description>
              <span>加载中...</span>
            </template>
          </n-spin>
        </div>

        <div v-else-if="filteredHistories.length === 0" class="empty-state">
          <n-icon size="64" color="#ccc">
            <DocumentTextOutline />
          </n-icon>
          <p>
            {{
              searchKeyword
                ? "没有找到匹配的记录"
                : "暂无记录，请选择本地TXT文件"
            }}
          </p>
          <n-button @click="chooseTxt" type="primary">选择TXT</n-button>
        </div>

        <div v-else-if="viewMode === 'table'" class="txt-table-wrap">
          <n-data-table
            :columns="columns"
            :data="paginatedHistories"
            :bordered="true"
            :single-line="false"
            max-height="calc(100vh - 240px)"
          />
          <div class="table-pagination">
            <n-pagination
              v-model:page="page"
              :page-count="pageCount"
              :page-sizes="pageSizeOptions"
              v-model:page-size="pageSize"
              show-size-picker
              show-quick-jumper
              :page-slot="7"
            />
          </div>
        </div>
        <div v-else class="row">
          <div class="col-12 txt-grid">
            <div
              v-for="item in paginatedHistories"
              :key="item.book_id"
              class="history-card"
            >
              <div class="history-title" :title="itemDisplayName(item)">
                {{ itemDisplayName(item) }}
              </div>
              <div class="history-sub">{{ item.file_path }}</div>
              <div class="history-sub">
                大小：{{ formatSize(item.file_size) }}
              </div>
              <div class="history-sub">
                进度：{{ item.page_index + 1 }} / {{ item.total_pages }}
              </div>
              <div class="history-actions">
                <n-button size="tiny" @click="continueLast(item)"
                  >继续上次</n-button
                >
                <n-button size="tiny" type="primary" @click="reopen(item)"
                  >重新打开</n-button
                >
                <n-button size="tiny" type="error" @click="removeHistory(item)"
                  >删除</n-button
                >
              </div>
            </div>
          </div>
          <div class="col-12 table-pagination">
            <n-pagination
              v-model:page="page"
              :page-count="pageCount"
              :page-sizes="pageSizeOptions"
              v-model:page-size="pageSize"
              show-size-picker
              show-quick-jumper
              :page-slot="7"
            />
          </div>
        </div>
      </div>
    </div>

    <!-- TXT阅读器 Modal -->
    <n-modal
      v-model:show="readerVisible"
      preset="card"
      title="TXT阅读器"
      :mask-closable="true"
      :close-on-esc="true"
      style="width: 90vw; max-width: 1400px"
      @after-enter="onReaderEnter"
      @update:show="onReaderShowUpdate"
    >
      <div class="txt-reader" tabindex="0" @keydown="onReaderKeydown">
        <!-- 阅读器工具栏 -->
        <div class="reader-toolbar">
          <div class="toolbar-left">
            <n-input-number
              v-model:value="fontSize"
              :min="12"
              :max="32"
              size="small"
              style="width: 80px"
              placeholder="字体大小"
            />
            <span class="toolbar-label">px</span>
            <n-select
              v-model:value="selectedEncoding"
              size="small"
              style="width: 160px"
              :options="encodingOptions"
              placeholder="选择编码"
              @update:value="onEncodingChange"
            />
          </div>
          <div class="toolbar-right">
            <n-input-number
              v-model:value="jumpToPage"
              :min="1"
              :max="totalPages"
              size="small"
              style="width: 80px"
              placeholder="页码"
            />
            <n-button size="small" @click="jumpToSpecificPage">跳转</n-button>
          </div>
        </div>

        <!-- 阅读内容区域 -->
        <div class="content-area" :style="{ fontSize: fontSize + 'px' }">
          <div v-if="currentPage" class="page-content">
            {{ currentPage }}
          </div>
          <div v-else class="page-placeholder">无内容</div>
        </div>

        <!-- 分页控制 -->
        <div class="reader-pagination">
          <n-button size="small" @click="prevPage">上一页</n-button>
          <span>{{ pageIndex + 1 }} / {{ totalPages }}</span>
          <n-button size="small" @click="nextPage">下一页</n-button>
          <n-button size="small" @click="toggleFullscreen">全屏 (F11)</n-button>
        </div>
      </div>
    </n-modal>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, watch, h, nextTick } from "vue";
import {
  NButton,
  NInput,
  NIcon,
  NSpin,
  NDataTable,
  NPagination,
  NRadioGroup,
  NRadioButton,
  NSelect,
  NInputNumber,
} from "naive-ui";
import { SearchOutline, DocumentTextOutline } from "@vicons/ionicons5";
import txtStorage from "@/utils/txtStorage";

// 状态
const histories = ref([]);
const loading = ref(false);
const viewMode = ref("table");
const searchKeyword = ref("");
const page = ref(1);
const pageSize = ref(10);
const pageSizeOptions = [10, 20, 50, 999999];

// 排序
const sortKey = ref("book");
const sortOrder = ref("asc");
const sortKeyOptions = [
  { label: "按文件名", value: "book" },
  { label: "按路径", value: "path" },
];

// 过滤与分页
const filteredHistories = computed(() => {
  const kw = (searchKeyword.value || "").trim().toLowerCase();
  if (!kw) return histories.value;
  return histories.value.filter(
    (item) =>
      (item.book_id || "").toLowerCase().includes(kw) ||
      (item.file_path || "").toLowerCase().includes(kw)
  );
});

const pageCount = computed(() =>
  Math.max(1, Math.ceil((filteredHistories.value.length || 1) / pageSize.value))
);

const sortedHistories = computed(() => {
  const arr = [...filteredHistories.value];
  const getVal = (item) =>
    sortKey.value === "book"
      ? itemDisplayName(item) || ""
      : item.file_path || "";
  arr.sort((a, b) => {
    const va = getVal(a);
    const vb = getVal(b);
    const r = va.localeCompare(vb, undefined, {
      numeric: true,
      sensitivity: "base",
    });
    return sortOrder.value === "asc" ? r : -r;
  });
  return arr;
});

const paginatedHistories = computed(() => {
  const start = (page.value - 1) * pageSize.value;
  const end = start + pageSize.value;
  return sortedHistories.value.slice(start, end);
});

function toggleSortOrder() {
  sortOrder.value = sortOrder.value === "asc" ? "desc" : "asc";
}

// 表格列
const columns = [
  {
    title: "文件名",
    key: "book_id",
    render: (row) => itemDisplayName(row),
    sorter: (a, b) =>
      itemDisplayName(a).localeCompare(itemDisplayName(b), undefined, {
        numeric: true,
        sensitivity: "base",
      }),
  },
  {
    title: "路径",
    key: "file_path",
    sorter: (a, b) =>
      (a.file_path || "").localeCompare(b.file_path || "", undefined, {
        numeric: true,
        sensitivity: "base",
      }),
  },
  {
    title: "大小",
    key: "file_size",
    render: (row) => formatSize(row.file_size),
  },
  {
    title: "进度",
    key: "progress",
    render: (row) => `${row.page_index + 1} / ${row.total_pages}`,
  },
  {
    title: "操作",
    key: "actions",
    render(row) {
      return [
        h(
          NButton,
          {
            size: "tiny",
            style: "margin-right:8px",
            onClick: () => continueLast(row),
          },
          { default: () => "继续上次" }
        ),
        h(
          NButton,
          {
            size: "tiny",
            type: "primary",
            style: "margin-right:8px",
            onClick: () => reopen(row),
          },
          { default: () => "重新打开" }
        ),
        h(
          NButton,
          { size: "tiny", type: "error", onClick: () => removeHistory(row) },
          { default: () => "删除" }
        ),
      ];
    },
  },
];

// 历史加载
async function loadHistories() {
  try {
    loading.value = true;
    const res = await txtStorage.getHistoryList();
    histories.value =
      res && res.success && Array.isArray(res.items) ? res.items : [];
  } finally {
    loading.value = false;
  }
}

// 阅读器状态
const readerVisible = ref(false);
const txtPath = ref("");
const txtFileSize = ref(0);
const pageIndex = ref(0);
const totalPages = ref(0);
const pages = ref([]);
const fontSize = ref(18);
const jumpToPage = ref(1);
const isFullscreen = ref(false);
const fileEncoding = ref("");
const selectedEncoding = ref("");
const encodingOptions = [
  { label: "ANSI", value: "gbk" },
  { label: "GB18030", value: "gb18030" },
  { label: "UTF-8", value: "utf8" },
  { label: "带BOM的UTF-8", value: "utf8-bom" },
  { label: "UTF-16 LE", value: "utf16le" },
  { label: "UTF-16 BE", value: "utf16be" },
];

const currentPage = computed(() => pages.value[pageIndex.value] || null);

function clampIndex(i) {
  return Math.min(Math.max(0, i), Math.max(0, totalPages.value - 1));
}

function getBaseName(fp) {
  const parts = (fp || "").split(/\\|\//);
  return parts[parts.length - 1];
}

function hashBookId() {
  return txtStorage.generateBookId(txtPath.value, txtFileSize.value);
}

function hashBookIdByPath(fp, size) {
  return txtStorage.generateBookId(fp, size);
}

async function openTxtFromPath(filePath, startAtIndex = 0) {
  if (!filePath) return;
  txtPath.value = filePath;

  try {
    // 优先读取历史的编码
    let preferEncoding = "";
    try {
      // 先用 stat 拿尺寸，生成 bookId 再读历史
      const s = await window.electronAPI.txtStat(filePath);
      if (s && s.success) {
        txtFileSize.value = s.fileSize || 0;
        const bid = hashBookIdByPath(filePath, txtFileSize.value);
        const stat = await txtStorage.loadProgress(bid);
        if (stat && stat.success && stat.progress && stat.progress.encoding) {
          preferEncoding = stat.progress.encoding;
        }
      }
    } catch {}

    const res = await window.electronAPI.txtReadContent(
      filePath,
      preferEncoding || undefined
    );
    if (!res || !res.success) return;

    pages.value = res.pages || [];
    totalPages.value = pages.value.length;
    if (!txtFileSize.value) txtFileSize.value = res.fileSize || 0;
    fileEncoding.value = res.encoding || "未知";
    selectedEncoding.value = res.encoding || preferEncoding || "";

    // 本地同步总页数
    upsertHistoryLocal({
      book_id: hashBookIdByPath(filePath, txtFileSize.value),
      file_path: filePath,
      total_pages: totalPages.value,
    });

    const stat = await txtStorage.loadProgress(hashBookId());
    if (stat.success && stat.progress) {
      pageIndex.value = clampIndex(
        typeof startAtIndex === "number"
          ? startAtIndex
          : stat.progress.page_index
      );
    } else {
      pageIndex.value = clampIndex(startAtIndex);
    }

    jumpToPage.value = pageIndex.value + 1;
    readerVisible.value = true;

    // 立即保存一次
    await txtStorage.saveProgress({
      bookId: hashBookId(),
      fileName: getBaseName(txtPath.value),
      filePath: txtPath.value,
      fileSize: txtFileSize.value,
      pageIndex: pageIndex.value,
      totalPages: totalPages.value,
      encoding: selectedEncoding.value || fileEncoding.value || "",
    });
  } catch (error) {
    console.error("打开TXT文件失败:", error);
  }
}

async function chooseTxt() {
  const r = await window.electronAPI.openTxtDialog();
  if (!r || r.canceled || !r.filePaths || r.filePaths.length === 0) return;

  const files = r.filePaths.slice(0, 100);
  for (const file of files) {
    try {
      const stat = await window.electronAPI.txtStat(file);
      if (stat && stat.success) {
        const bookId = hashBookIdByPath(file, stat.fileSize);
        await txtStorage.saveProgress({
          bookId,
          fileName: stat.fileName,
          filePath: stat.filePath,
          fileSize: stat.fileSize,
          pageIndex: 0,
          totalPages: stat.pageCount || 0,
        });

        upsertHistoryLocal({
          book_id: bookId,
          file_path: stat.filePath,
          page_index: 0,
          total_pages: stat.pageCount || 0,
          updated_at: Date.now(),
          file_size: stat.fileSize,
        });
      }
    } catch (error) {
      console.error("处理TXT文件失败:", error);
    }
  }
  await loadHistories();
}

function toggleReader() {
  readerVisible.value = !readerVisible.value;
}

function scheduleRender(to) {
  const newIndex = clampIndex(to);
  pageIndex.value = newIndex;
  jumpToPage.value = newIndex + 1;

  txtStorage.saveProgress({
    bookId: hashBookId(),
    fileName: getBaseName(txtPath.value),
    filePath: txtPath.value,
    fileSize: txtFileSize.value,
    pageIndex: pageIndex.value,
    totalPages: totalPages.value,
    encoding: selectedEncoding.value || fileEncoding.value || "",
  });

  // 同步更新内存中的历史记录
  upsertHistoryLocal({
    book_id: hashBookId(),
    file_path: txtPath.value,
    page_index: pageIndex.value,
    total_pages: totalPages.value,
    updated_at: Date.now(),
  });

  // 重置滚动条到顶部 - 使用更可靠的方式
  setTimeout(() => {
    const contentArea = document.querySelector(".txt-reader .content-area");
    if (contentArea) {
      contentArea.scrollTop = 0;
    }
  }, 50);
}

function nextPage() {
  scheduleRender(pageIndex.value + 1);
}

function prevPage() {
  scheduleRender(pageIndex.value - 1);
}

function jumpToSpecificPage() {
  const targetPage = Math.max(1, Math.min(jumpToPage.value, totalPages.value));
  scheduleRender(targetPage - 1);

  // 直接跳转时也重置滚动条
  setTimeout(() => {
    const contentArea = document.querySelector(".txt-reader .content-area");
    if (contentArea) {
      contentArea.scrollTop = 0;
    }
  }, 50);
}

function onReaderKeydown(e) {
  if (e.key === "ArrowRight") nextPage();
  else if (e.key === "ArrowLeft") prevPage();
  else if (e.key === "Escape") {
    if (isFullscreen.value) toggleFullscreen();
    else readerVisible.value = false;
  } else if (e.key === "F11") {
    e.preventDefault();
    toggleFullscreen();
  }
}

// 刷新窗口
function reload(ignoreCache = false) {
  window.electronAPI.reloadWindow(!!ignoreCache);
}

function toggleFullscreen() {
  const el = document.documentElement;
  if (!document.fullscreenElement) {
    el.requestFullscreen?.();
    isFullscreen.value = true;
  } else {
    document.exitFullscreen?.();
    isFullscreen.value = false;
  }
}

function onReaderEnter() {
  setTimeout(() => {
    try {
      const cont = document.querySelector(".txt-reader");
      cont && cont.focus();
    } catch {}
  }, 0);
}

function onReaderShowUpdate(v) {
  readerVisible.value = v;
}

function itemDisplayName(item) {
  if (item && item.file_path) {
    const parts = item.file_path.split(/\\|\//);
    return parts[parts.length - 1];
  }
  return item?.book_id || "未命名";
}

function formatSize(bytes) {
  return txtStorage.formatFileSize(bytes);
}

async function continueLast(item) {
  await openTxtFromPath(item.file_path, item.page_index);
}

async function reopen(item) {
  await txtStorage.saveProgress({
    bookId: item.book_id,
    fileName: getBaseName(item.file_path),
    filePath: item.file_path,
    fileSize: item.file_size || 0,
    pageIndex: 0,
    totalPages: item.total_pages || 0,
    encoding: selectedEncoding.value || fileEncoding.value || "",
  });

  upsertHistoryLocal({
    book_id: item.book_id,
    file_path: item.file_path,
    page_index: 0,
    total_pages: item.total_pages || 0,
    updated_at: Date.now(),
  });

  await openTxtFromPath(item.file_path, 0);
}

async function onEncodingChange(enc) {
  try {
    if (!txtPath.value) return;
    const res = await window.electronAPI.txtReadContent(txtPath.value, enc);
    if (!res || !res.success) return;
    pages.value = res.pages || [];
    totalPages.value = pages.value.length;
    fileEncoding.value = res.encoding || enc || "";
    selectedEncoding.value = fileEncoding.value;
    pageIndex.value = clampIndex(0);
    jumpToPage.value = 1;
    await txtStorage.saveProgress({
      bookId: hashBookId(),
      fileName: getBaseName(txtPath.value),
      filePath: txtPath.value,
      fileSize: txtFileSize.value,
      pageIndex: pageIndex.value,
      totalPages: totalPages.value,
      encoding: selectedEncoding.value || fileEncoding.value || "",
    });
  } catch (e) {
    console.error("切换编码失败:", e);
  }
}

async function removeHistory(item) {
  try {
    const res = await txtStorage.deleteProgress(item.book_id);
    if (res && res.success) {
      const idx = histories.value.findIndex((h) => h.book_id === item.book_id);
      if (idx >= 0) histories.value.splice(idx, 1);
    }
  } catch (e) {
    console.error("删除失败", e);
  }
}

onMounted(loadHistories);

watch([pageSize], () => {
  if (pageSize.value === 999999) pageSize.value = 1000000;
});

// 在内存中更新/插入历史记录
function upsertHistoryLocal(partial) {
  const idx = histories.value.findIndex((h) => h.book_id === partial.book_id);
  if (idx >= 0) {
    histories.value[idx] = { ...histories.value[idx], ...partial };
  } else {
    histories.value.unshift({
      book_id: partial.book_id,
      file_path: partial.file_path || "",
      page_index:
        typeof partial.page_index === "number" ? partial.page_index : 0,
      total_pages: partial.total_pages || 0,
      updated_at: partial.updated_at || Date.now(),
      file_size: partial.file_size || 0,
    });
  }
}
</script>

<style scoped>
.txt-layout {
  height: 100%;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.top-toolbar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px 24px;
  border-bottom: 1px solid #e8e8e8;
  background: #fff;
  flex-shrink: 0;
  z-index: 10;
}

.toolbar-left {
  display: flex;
  gap: 12px;
  align-items: center;
}

.toolbar-right {
  display: flex;
  gap: 12px;
  align-items: center;
}

.main-content {
  flex: 1;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.txt-container {
  padding: 24px;
  flex: 1;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.loading-state {
  display: flex;
  align-items: center;
  justify-content: center;
}

.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  color: #999;
  padding: 40px;
}

.empty-state p {
  margin: 16px 0 24px 0;
  font-size: 14px;
}

.txt-grid {
  padding: 6px;
  display: flex;
  flex-wrap: wrap;
  gap: 20px;
  overflow-y: auto;
  overflow-x: hidden;
}

.history-card {
  border: 1px solid #e8e8e8;
  border-radius: 8px;
  padding: 12px;
  width: 260px;
  background: #fff;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.history-title {
  font-weight: 600;
  font-size: 14px;
  color: #333;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.history-sub {
  font-size: 12px;
  color: #666;
}

.history-actions {
  margin-top: 4px;
  display: flex;
  gap: 8px;
}

.table-pagination {
  margin-top: 16px;
  display: flex;
  justify-content: flex-end;
}

/* TXT阅读器样式 */
.txt-reader {
  border: 1px solid #e8e8e8;
  border-radius: 6px;
  padding: 12px;
  outline: none;
}

.reader-toolbar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px 0;
  border-bottom: 1px solid #e8e8e8;
  margin-bottom: 16px;
}

.toolbar-left,
.toolbar-right {
  display: flex;
  align-items: center;
  gap: 8px;
}

.toolbar-label {
  font-size: 12px;
  color: #666;
}

.encoding-info {
  font-size: 12px;
  color: #1890ff;
  background: #e6f7ff;
  padding: 2px 8px;
  border-radius: 4px;
  margin-left: 8px;
}

.content-area {
  display: flex;
  justify-content: center;
  align-items: flex-start;
  height: 60vh;
  background: #fafafa;
  border-radius: 4px;
  padding: 20px;
  overflow-y: auto;
  line-height: 1.6;
  text-align: justify;
}

.page-content {
  max-width: 100%;
  white-space: pre-wrap;
  word-wrap: break-word;
}

.page-placeholder {
  color: #999;
}

.reader-pagination {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 12px;
  padding-top: 16px;
  border-top: 1px solid #e8e8e8;
  margin-top: 16px;
}

/* 响应式设计 */
@media (max-width: 768px) {
  .txt-grid {
    gap: 16px;
    padding: 16px;
  }

  .top-toolbar {
    padding: 12px 16px;
  }

  .toolbar-left {
    gap: 8px;
  }
}

@media (max-width: 480px) {
  .txt-grid {
    gap: 12px;
    padding: 12px;
  }
}
</style>
