<template>
  <div class="home-layout">
    <!-- 顶部工具栏 -->
    <div class="top-toolbar">
      <div class="toolbar-left">
        <n-button @click="chooseEpub" type="primary" size="small"
          >选择EPUB</n-button
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
          placeholder="搜索书名..."
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
      <!-- 阅读历史与阅读器 -->
      <div class="image-container">
        <!-- <div
          v-if="readerVisible"
          class="epub-reader"
          tabindex="0"
          @keydown="onReaderKeydown"
        >
          <div class="page-wrap">
            <img
              v-if="currentPage && currentPage.dataUrl"
              :src="currentPage.dataUrl"
              class="page-img"
            />
            <div v-else class="page-placeholder">无页面</div>
          </div>
          <div class="reader-pagination">
            <n-button size="small" @click="prevPage">上一页</n-button>
            <span>{{ pageIndex + 1 }} / {{ totalPages }}</span>
            <n-button size="small" @click="nextPage">下一页</n-button>
          </div>
        </div> -->
        <div v-if="loading" class="loading-state">
          <n-spin size="large">
            <template #description>
              <span>加载中...</span>
            </template>
          </n-spin>
        </div>

        <div v-else-if="filteredHistories.length === 0" class="empty-state">
          <n-icon size="64" color="#ccc">
            <ImageOutline />
          </n-icon>
          <p>
            {{
              searchKeyword ? "没有找到匹配的记录" : "暂无记录，请选择本地EPUB"
            }}
          </p>
          <n-button @click="chooseEpub" type="primary">选择EPUB</n-button>
        </div>

        <div v-else-if="viewMode === 'table'" class="image-table-wrap">
          <n-data-table
            :columns="columns"
            :data="paginatedHistories"
            :bordered="true"
            :single-line="false"
            max-height="calc(100vh - 240px)"
            :row-key="(row) => row.book_id"
            :checked-row-keys="selectedRows"
            @update:checked-row-keys="onSelectionChange"
          />
          <div class="table-pagination flex items-center">
            <span
              v-if="selectedRows.length > 0"
              class="text-sm text-gray-500 pe-mr-sm"
              >已选择{{ selectedRows.length }} 条</span
            >
            <n-pagination
              v-model:page="page"
              :page-count="pageCount"
              :page-sizes="pageSizeOptions"
              v-model:page-size="pageSize"
              show-size-picker
              show-quick-jumper
              :page-slot="7"
              @update:page-size="onPageChange"
            />
          </div>
        </div>
        <div v-else class="row">
          <div class="col-12 image-grid">
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
                <n-button
                  size="tiny"
                  @click="continueLast(item)"
                  class="my-[4px]"
                  >继续上次</n-button
                >
                <n-button
                  size="tiny"
                  type="primary"
                  @click="reopen(item)"
                  class="my-[4px]"
                  >重新打开</n-button
                >
                <n-button
                  size="tiny"
                  type="error"
                  @click="removeHistory(item)"
                  class="my-[4px]"
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
    <!-- 阅读器 Modal -->
    <n-modal
      v-model:show="readerVisible"
      preset="card"
      title="阅读器"
      :mask-closable="true"
      :close-on-esc="true"
      style="width: 90vw; max-width: 1400px"
      @after-enter="onReaderEnter"
      @update:show="onReaderShowUpdate"
    >
      <div
        class="epub-reader"
        tabindex="0"
        @keydown="onReaderKeydown"
        @wheel="onReaderWheel"
      >
        <!-- 阅读器工具栏 -->
        <div class="reader-toolbar">
          <div class="toolbar-left">
            <span class="toolbar-label"
              >当前页: {{ pageIndex + 1 }} / {{ totalPages }}</span
            >
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

        <div class="page-wrap">
          <img
            v-if="currentPage && currentPage.dataUrl"
            :src="currentPage.dataUrl"
            class="page-img"
          />
          <div v-else class="page-placeholder">无页面</div>
        </div>

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
import { ref, computed, onMounted, watch, h } from "vue";
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
import { SearchOutline, ImageOutline } from "@vicons/ionicons5";

// 状态
const histories = ref([]);
const loading = ref(false);
const viewMode = ref("table");
const searchKeyword = ref("");
const page = ref(1);
const pageSize = ref(10);
const pageSizeOptions = [10, 20, 50, 999999];
// 排序
const sortKey = ref("book"); // 'book' | 'path'
const sortOrder = ref("asc"); // 'asc' | 'desc'
const sortKeyOptions = [
  { label: "按书名", value: "book" },
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
    align: "center",
    selectable: true,
    type: "selection",
  },
  {
    title: "书名",
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
    const res = await window.electronAPI.readerListProgress();
    histories.value =
      res && res.success && Array.isArray(res.items) ? res.items : [];
  } finally {
    loading.value = false;
  }
}

// 阅读器状态
const readerVisible = ref(false);
const epubPath = ref("");
const epubFileSize = ref(0);
const pageIndex = ref(0);
const totalPages = ref(0);
const pages = ref([]);
const desiredIndex = ref(0);
const jumpToPage = ref(1);
let rafId = 0;
const currentPage = computed(() => pages.value[pageIndex.value] || null);
const isFullscreen = ref(false);

function clampIndex(i) {
  return Math.min(Math.max(0, i), Math.max(0, totalPages.value - 1));
}
function getBaseName(fp) {
  const parts = (fp || "").split(/\\|\//);
  return parts[parts.length - 1];
}
function hashBookId() {
  return `book:${getBaseName(epubPath.value)}:${epubFileSize.value || 0}`;
}
function hashBookIdByPath(fp, size) {
  return `book:${getBaseName(fp)}:${size || 0}`;
}

async function openEpubFromPath(filePath, startAtIndex = 0) {
  if (!filePath) return;
  epubPath.value = filePath;
  const res = await window.electronAPI.epubReadImages(filePath);
  if (!res || !res.success) return;
  pages.value = res.items || [];
  totalPages.value = pages.value.length;
  epubFileSize.value = res.fileSize || 0;
  // 本地同步总页数
  upsertHistoryLocal({
    book_id: hashBookIdByPath(filePath, epubFileSize.value),
    file_path: filePath,
    total_pages: totalPages.value,
  });
  const stat = await window.electronAPI.readerLoadProgress(hashBookId());
  if (stat.success && stat.progress) {
    pageIndex.value = clampIndex(
      typeof startAtIndex === "number" ? startAtIndex : stat.progress.page_index
    );
  } else {
    pageIndex.value = clampIndex(startAtIndex);
  }
  desiredIndex.value = pageIndex.value;
  jumpToPage.value = pageIndex.value + 1;
  readerVisible.value = true;
  // 立即保存一次，包含文件名与大小
  await window.electronAPI.readerSaveProgress({
    bookId: hashBookId(),
    fileName: getBaseName(epubPath.value),
    filePath: epubPath.value,
    fileSize: epubFileSize.value,
    pageIndex: pageIndex.value,
    totalPages: totalPages.value,
    rtl: false,
    spreadMode: "single",
  });
}

async function chooseEpub() {
  const r = await window.electronAPI.openEpubDialog();
  if (!r || r.canceled || !r.filePaths || r.filePaths.length === 0) return;
  const files = r.filePaths.slice(0, 100);
  for (const file of files) {
    // 仅登记：读取元数据，写入数据库，不打开阅读器
    const stat = await window.electronAPI.epubStat(file);
    if (stat && stat.success) {
      const bookId = hashBookIdByPath(file, stat.fileSize);
      await window.electronAPI.readerSaveProgress({
        bookId,
        fileName: stat.fileName,
        filePath: stat.filePath,
        fileSize: stat.fileSize,
        pageIndex: 0,
        totalPages: stat.pageCount || 0,
        rtl: false,
        spreadMode: "single",
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
  }
  await loadHistories();
}

function toggleReader() {
  readerVisible.value = !readerVisible.value;
}

function scheduleRender(to) {
  desiredIndex.value = clampIndex(to);
  if (rafId) cancelAnimationFrame(rafId);
  rafId = requestAnimationFrame(() => {
    pageIndex.value = desiredIndex.value;
    jumpToPage.value = pageIndex.value + 1;
    window.electronAPI.readerSaveProgress({
      bookId: hashBookId(),
      fileName: getBaseName(epubPath.value),
      filePath: epubPath.value,
      fileSize: epubFileSize.value,
      pageIndex: pageIndex.value,
      totalPages: totalPages.value,
      rtl: false,
      spreadMode: "single",
    });
    // 同步更新内存中的历史记录，立即反映到表格/卡片
    upsertHistoryLocal({
      book_id: hashBookId(),
      file_path: epubPath.value,
      page_index: pageIndex.value,
      total_pages: totalPages.value,
      updated_at: Date.now(),
    });
  });
}
function nextPage() {
  scheduleRender(pageIndex.value + 1);
}
function prevPage() {
  scheduleRender(pageIndex.value - 1);
}
function onReaderKeydown(e) {
  if (e.key === "ArrowRight") nextPage();
  else if (e.key === "ArrowLeft") prevPage();
  else if (e.key === "Escape") {
    // 退出Modal或退出全屏
    if (isFullscreen.value) toggleFullscreen();
    else readerVisible.value = false;
  } else if (e.key === "F11") {
    e.preventDefault();
    toggleFullscreen();
  }
}

// 鼠标滚轮事件处理
function onReaderWheel(e) {
  e.preventDefault();
  if (e.deltaY > 0) {
    nextPage();
  } else {
    prevPage();
  }
}

// 跳转到指定页面
function jumpToSpecificPage() {
  const targetPage = Math.max(1, Math.min(jumpToPage.value, totalPages.value));
  scheduleRender(targetPage - 1);
  jumpToPage.value = targetPage;
}

// 刷新窗口（可选忽略缓存）
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
  // 聚焦键盘
  setTimeout(() => {
    try {
      const cont = document.querySelector(".epub-reader");
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
  const b = Number(bytes) || 0;
  if (b <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(b) / Math.log(1024));
  const v = (b / Math.pow(1024, i)).toFixed(2);
  return `${v} ${units[i]}`;
}
async function continueLast(item) {
  await openEpubFromPath(item.file_path, item.page_index);
}
async function reopen(item) {
  await window.electronAPI.readerSaveProgress({
    bookId: item.book_id,
    fileName: getBaseName(item.file_path),
    filePath: item.file_path,
    fileSize: item.file_size || 0,
    pageIndex: 0,
    totalPages: item.total_pages || 0,
    rtl: false,
    spreadMode: "single",
  });
  upsertHistoryLocal({
    book_id: item.book_id,
    file_path: item.file_path,
    page_index: 0,
    total_pages: item.total_pages || 0,
    updated_at: Date.now(),
  });
  await openEpubFromPath(item.file_path, 0);
}

async function removeHistory(item) {
  try {
    const res = await window.electronAPI.readerDeleteProgress(item.book_id);
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

// 在内存中更新/插入历史记录，保持响应式
function upsertHistoryLocal(partial) {
  const idx = histories.value.findIndex((h) => h.book_id === partial.book_id);
  if (idx >= 0) {
    // 替换为新对象以触发响应式
    histories.value[idx] = { ...histories.value[idx], ...partial };
  } else {
    histories.value.unshift({
      book_id: partial.book_id,
      file_path: partial.file_path || "",
      page_index:
        typeof partial.page_index === "number" ? partial.page_index : 0,
      total_pages: partial.total_pages || 0,
      rtl: 0,
      spread_mode: "single",
      updated_at: partial.updated_at || Date.now(),
    });
  }
}
const selectedRows = ref([]);
function onSelectionChange(kes, rows) {
  // console.log("onSelectionChange", sortedHistories.value);
  // console.log(kes);
  // console.log(rows);
  selectedRows.value = rows.map((row) => row.book_id);
}
function onPageChange(page) {
  selectedRows.value = [];
  console.log("onPageChange", page);
}
</script>

<style scoped>
.home-layout {
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

.image-container {
  padding: 24px;
  flex: 1;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.reader-toolbar {
  display: flex;
  gap: 8px;
  align-items: center;
  margin-bottom: 12px;
}
.epub-reader {
  border: 1px solid #e8e8e8;
  border-radius: 6px;
  padding: 12px;
  outline: none;
}

/* 阅读器工具栏样式 */
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
  font-size: 14px;
  color: #666;
  font-weight: 500;
}
.page-wrap {
  display: flex;
  justify-content: center;
  align-items: center;
  height: 80vh;
  background: #fafafa;
  border-radius: 4px;
}
.page-img {
  max-height: 100%;
  max-width: 100%;
  object-fit: contain;
}
.page-placeholder {
  color: #999;
}
.reader-pagination {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 12px;
  padding-top: 12px;
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

.image-grid {
  /* flex: 1; */
  padding: 6px;
  display: flex;
  flex-wrap: wrap;
  /* display: grid; */
  /* grid-template-columns: repeat(auto-fill, minmax(180px, 1fr)); */
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

/* 响应式设计 */
@media (max-width: 768px) {
  .image-grid {
    grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
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
  .image-grid {
    grid-template-columns: repeat(auto-fill, minmax(120px, 1fr));
    gap: 12px;
    padding: 12px;
  }
}
.table-pagination {
  margin-top: 16px;
  display: flex;
  justify-content: flex-end;
}
</style>
