<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useBookmarkStore } from '@/stores/bookmark'
import { useViewerStore } from '@/stores/viewer'
import { BOOKMARK_TAGS } from '@/types'
import type { Bookmark, BookmarkTag } from '@/types'

const emit = defineEmits<{
  /** 请求 App 打开书签关联的文件并跳转（自动切换） */
  (e: 'open-pair', b: Bookmark): void
  /** 收起书签面板 */
  (e: 'close'): void
}>()

const bookmark = useBookmarkStore()
const viewer = useViewerStore()

/** 标签功能色（卡片色条）：错题=红 / 重点=橙 / 存疑=蓝 */
const TAG_CLASS: Record<BookmarkTag, string> = {
  错题: 'tag-wrong',
  重点: 'tag-important',
  存疑: 'tag-doubt'
}

/** 标签按钮色类（独立类名，避免与卡片色条冲突） */
const TAG_BTN_CLASS: Record<BookmarkTag, string> = {
  错题: 'btw-wrong',
  重点: 'btw-important',
  存疑: 'btw-doubt'
}

function tagClass(t?: BookmarkTag): string {
  return t ? TAG_CLASS[t] : ''
}

function chipClass(f: string): string {
  if (f === '全部') return 'chip-all'
  return f === '错题' ? 'chip-wrong' : f === '重点' ? 'chip-important' : 'chip-doubt'
}

/** 点击标签按钮：切换（再点当前标签取消） */
function toggleTag(b: Bookmark, t: BookmarkTag): void {
  bookmark.setTag(b.id, b.tag === t ? undefined : t)
}

/** 书签是否属于当前打开的文件配对 */
function isCurrent(b: Bookmark): boolean {
  return (
    viewer.left.loaded &&
    viewer.left.path === b.questionPath &&
    viewer.right.loaded &&
    viewer.right.path === b.answerPath
  )
}

/** 点击书签：同文件直接双侧跳转；不同文件自动切换打开关联的题本/解析 */
function onGoto(b: Bookmark): void {
  if (isCurrent(b)) {
    viewer.apis['question']?.applyPageFloat(b.questionPage)
    viewer.apis['answer']?.applyPageFloat(b.answerPage)
    return
  }
  emit('open-pair', b)
}

function pageLabel(pf: number): string {
  return `第 ${Math.floor(pf) + 1} 页`
}

function fmtTime(t: number): string {
  const d = new Date(t)
  const pad = (n: number): string => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

// —— 面板宽度拖拽（本机偏好持久化到 config） ——
const panelWidth = ref(300)
const resizer = ref<HTMLElement | null>(null)
let dragState: { startX: number; startW: number } | null = null

function clampWidth(w: number): number {
  return Math.min(560, Math.max(240, w))
}

function onResizerDown(e: PointerEvent): void {
  e.preventDefault()
  dragState = { startX: e.clientX, startW: panelWidth.value }
  const el = resizer.value
  if (!el) return
  el.setPointerCapture?.(e.pointerId)
  el.addEventListener('pointermove', onResizerMove)
  el.addEventListener('pointerup', onResizerUp)
  el.addEventListener('pointercancel', onResizerUp)
}

function onResizerMove(e: PointerEvent): void {
  if (!dragState) return
  // 拖拽条在面板左缘：向右拖变窄
  panelWidth.value = clampWidth(dragState.startW - (e.clientX - dragState.startX))
}

function onResizerUp(): void {
  const el = resizer.value
  if (el) {
    el.removeEventListener('pointermove', onResizerMove)
    el.removeEventListener('pointerup', onResizerUp)
    el.removeEventListener('pointercancel', onResizerUp)
  }
  dragState = null
  void window.api.setConfig({ bookmarkWidth: panelWidth.value })
}

onMounted(async () => {
  try {
    const cfg = await window.api.getConfig()
    const w = cfg.bookmarkWidth
    if (typeof w === 'number') panelWidth.value = clampWidth(w)
  } catch {
    // 忽略配置读取失败，用默认宽度
  }
})
</script>

<template>
  <aside class="bookmark-panel" :style="{ width: panelWidth + 'px' }">
    <div
      ref="resizer"
      class="bm-resizer"
      title="拖动调整面板宽度"
      @pointerdown="onResizerDown"
    />
    <header class="bm-header">
      <span>书签</span>
      <div class="bm-header-right">
        <span class="bm-count">{{ bookmark.filtered.length }}</span>
        <button class="btn bm-close" title="收起书签面板" @click="emit('close')">✕</button>
      </div>
    </header>
    <div class="bm-filters">
      <button
        v-for="f in ['全部', ...BOOKMARK_TAGS]"
        :key="f"
        class="chip"
        :class="[chipClass(f), { active: bookmark.filter === f }]"
        @click="bookmark.filter = f"
      >
        {{ f }}
      </button>
    </div>
    <ul class="bm-list">
      <li v-for="b in bookmark.filtered" :key="b.id" class="bm-item" :class="tagClass(b.tag)">
        <div
          class="bm-main"
          :title="isCurrent(b) ? '点击双侧跳转' : '点击自动打开书签关联的题本与解析并跳转'"
          @click="onGoto(b)"
        >
          <div class="bm-row">
            <div class="bm-files" :title="b.questionName + ' ↔ ' + b.answerName">
              {{ b.questionName }} <span class="bm-arrow">↔</span> {{ b.answerName }}
            </div>
            <span v-if="isCurrent(b)" class="bm-current">当前</span>
          </div>
          <div class="bm-pages">
            题 {{ pageLabel(b.questionPage) }} · 解 {{ pageLabel(b.answerPage) }}
          </div>
          <div class="bm-time">{{ fmtTime(b.createdAt) }}</div>
        </div>
        <div class="bm-actions">
          <div class="bm-tagbtns">
            <button
              v-for="t in BOOKMARK_TAGS"
              :key="t"
              class="bm-tagbtn"
              :class="[TAG_BTN_CLASS[t], { active: b.tag === t }]"
              :title="b.tag === t ? '点击取消「' + t + '」标签' : '标记为「' + t + '」'"
              @click="toggleTag(b, t)"
            >
              {{ t }}
            </button>
          </div>
          <button class="btn danger" title="删除" @click="bookmark.remove(b.id)">删</button>
        </div>
      </li>
    </ul>
    <div v-if="bookmark.filtered.length === 0" class="bm-empty">
      暂无书签<br />
      打开题本和解析后，点击工具栏「＋书签」记录
    </div>
  </aside>
</template>
