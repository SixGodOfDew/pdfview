<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { PageMapper } from '@/core/sync/PageMapper'
import { syncEngine } from '@/core/sync/SyncEngine'
import { useViewerStore } from '@/stores/viewer'
import { useSettingsStore } from '@/stores/settings'
import PdfPage from './PdfPage.vue'
import type { MasterSide } from '@/types'

const props = defineProps<{ side: MasterSide }>()
const emit = defineEmits<{ (e: 'request-open', side: MasterSide): void }>()

const viewerStore = useViewerStore()
const settings = useSettingsStore()

const scrollEl = ref<HTMLElement | null>(null)
const mapper = new PageMapper()

const summary = computed(() => (props.side === 'question' ? viewerStore.left : viewerStore.right))
const doc = computed(() => viewerStore.getDoc(props.side))
const sizes = computed(() => viewerStore.getBaseSizes(props.side))
const scale = computed(() => summary.value.scale)

const heights = computed(() => sizes.value.heights.map((h) => h * scale.value))

// —— mapper 重建：缩放时保持当前页浮点（视觉停在当前页） ——
let pendingPf: number | null = null
watch(heights, () => {
  mapper.rebuild(heights.value)
  if (pendingPf != null) {
    const el = scrollEl.value
    if (el) el.scrollTop = mapper.pageFloatToScrollTop(pendingPf)
    pendingPf = null
  }
})

// —— 虚拟滚动：只渲染可视页 ±2 ——
const scrollTop = ref(0)
const viewportH = ref(0)
const pages = computed(() => {
  const n = heights.value.length
  if (n === 0) return []
  const start = Math.max(0, Math.floor(mapper.scrollTopToPageFloat(scrollTop.value) - 2))
  const end = Math.min(
    n - 1,
    Math.ceil(mapper.scrollTopToPageFloat(scrollTop.value + viewportH.value)) + 2
  )
  const list: number[] = []
  for (let i = start; i <= end; i++) list.push(i)
  return list
})

// —— 同步：主侧滚动 → SyncEngine ——
function onScroll(): void {
  const el = scrollEl.value
  if (!el) return
  scrollTop.value = el.scrollTop
  const pf = mapper.scrollTopToPageFloat(el.scrollTop)
  summary.value.pageFloat = pf
  if (settings.syncEnabled && props.side === settings.master) {
    syncEngine.onMasterScroll(pf)
  }
}

// —— 缩放：Ctrl+滚轮 ——
function onWheel(e: WheelEvent): void {
  if (!e.ctrlKey) return
  e.preventDefault()
  const delta = e.deltaY < 0 ? 0.1 : -0.1
  viewerStore.requestScale(props.side, summary.value.scale + delta)
}

// —— 注册到 store 的实例 API（供 SyncEngine / 书签 / 缩放联动调用） ——
// 注意：程序性设置 scrollTop 可能不触发原生 scroll 事件，
// 因此显式同步 scrollTop ref（驱动虚拟滚动重算）与 pageFloat。
function applyPageFloat(pf: number): void {
  const el = scrollEl.value
  if (!el) return
  const top = mapper.pageFloatToScrollTop(pf)
  el.scrollTop = top
  scrollTop.value = top
  summary.value.pageFloat = pf
}

function applyScale(newScale: number): void {
  pendingPf = mapper.scrollTopToPageFloat(scrollEl.value?.scrollTop ?? 0)
  viewerStore.setScale(props.side, newScale)
}

function gotoPage(pageIndex: number): void {
  const el = scrollEl.value
  if (!el) return
  const top = mapper.pageFloatToScrollTop(pageIndex)
  el.scrollTop = top
  scrollTop.value = top
  summary.value.pageFloat = pageIndex
}

let ro: ResizeObserver | null = null
watch(scrollEl, (el) => {
  ro?.disconnect()
  ro = null
  if (el) {
    viewportH.value = el.clientHeight
    ro = new ResizeObserver(() => {
      if (scrollEl.value) viewportH.value = scrollEl.value.clientHeight
    })
    ro.observe(el)
  }
})

onMounted(() => {
  viewerStore.register(props.side, { applyPageFloat, applyScale, gotoPage })
})
onBeforeUnmount(() => {
  viewerStore.register(props.side, null)
  ro?.disconnect()
})

const pageLabel = computed(() => {
  const n = summary.value.numPages
  if (n === 0) return ''
  return `${Math.floor(summary.value.pageFloat) + 1} / ${n}`
})

// 渲染期调用：touch heights 保证 mapper 重建先于渲染
function totalHeight(): number {
  void heights.value
  return mapper.totalHeight
}
</script>

<template>
  <div class="pdf-viewer">
    <div class="viewer-header">
      <span class="vh-side">{{ side === 'question' ? '题本' : '解析' }}</span>
      <span class="vh-name" :title="summary.path ?? ''">{{ summary.name ?? '未打开' }}</span>
      <span v-if="pageLabel" class="vh-page">{{ pageLabel }}</span>
    </div>
    <div v-if="!summary.loaded" class="viewer-placeholder">
      <template v-if="summary.loading">
        <div class="spinner" />
        <div class="placeholder-text">正在加载 PDF…</div>
      </template>
      <template v-else>
        <div class="placeholder-title">{{ side === 'question' ? '题本' : '解析' }}</div>
        <button class="btn primary" @click="emit('request-open', side)">打开 PDF</button>
        <div v-if="summary.error" class="placeholder-error">{{ summary.error }}</div>
      </template>
    </div>
    <div v-else class="viewer-body">
      <div ref="scrollEl" class="viewer-scroll" @scroll="onScroll" @wheel="onWheel">
        <div class="viewer-inner" :style="{ height: totalHeight() + 'px' }">
          <div
            v-for="p in pages"
            :key="p"
            class="page-slot"
            :style="{ top: mapper.pageTop(p) + 'px', height: heights[p] + 'px' }"
          >
            <PdfPage
              v-if="doc"
              :page-index="p"
              :doc="doc"
              :scale="scale"
              :side="side"
              :path="summary.path"
            />
          </div>
        </div>
      </div>
      <div v-if="pageLabel" class="page-indicator">{{ pageLabel }}</div>
    </div>
  </div>
</template>
