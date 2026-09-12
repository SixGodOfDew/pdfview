<script setup lang="ts">
import { nextTick, onBeforeUnmount, onMounted, ref, watch, watchEffect } from 'vue'
import Toolbar from '@/components/Toolbar.vue'
import SplitPane from '@/components/SplitPane.vue'
import PdfViewer from '@/components/PdfViewer.vue'
import BookmarkPanel from '@/components/BookmarkPanel.vue'
import PasswordDialog from '@/components/PasswordDialog.vue'
import ConfirmDialog from '@/components/ConfirmDialog.vue'
import HelpDialog from '@/components/HelpDialog.vue'
import { useSettingsStore } from '@/stores/settings'
import { useViewerStore } from '@/stores/viewer'
import { useBookmarkStore } from '@/stores/bookmark'
import { useMaskStore } from '@/stores/mask'
import { useAnnotationStore } from '@/stores/annotation'
import { useProgressStore } from '@/stores/progress'
import { useBossModeStore } from '@/stores/bossMode'
import { syncEngine } from '@/core/sync/SyncEngine'
import { flushAll } from '@/storage/DataStore'
import {
  SHORTCUT_ACTIONS,
  eventToBinding,
  type ShortcutAction
} from '@/core/shortcuts'
import type { Bookmark, MaskMode, MasterSide } from '@/types'

const settings = useSettingsStore()
const viewer = useViewerStore()
const bookmark = useBookmarkStore()
const mask = useMaskStore()
const annotation = useAnnotationStore()
const progress = useProgressStore()
const boss = useBossModeStore()

const showBookmarks = ref(false)
const showHelp = ref(false)

// —— 同步引擎 ↔ 设置联动 ——
watchEffect(() => {
  syncEngine.master = settings.master
  syncEngine.enabled = settings.syncEnabled
  syncEngine.setMode(settings.syncMode)
  syncEngine.setPageScale(settings.syncRatio, settings.syncOffset)
})
syncEngine.applyToSlave = (pf: number) => {
  const slave: MasterSide = settings.master === 'question' ? 'answer' : 'question'
  viewer.apis[slave]?.applyPageFloat(pf)
}
syncEngine.getSide = (side: MasterSide) => viewer.apis[side]?.syncSide() ?? null

/** 立即按当前设置把从侧拉齐（幂等） */
function resyncNow(): void {
  if (!settings.syncEnabled) return
  const master = settings.master
  if (!viewer.summary(master).loaded) return
  syncEngine.onMasterScroll(viewer.summary(master).pageFloat)
}

// 切换同步方式 / 重新开启同步 / 改动倍率偏移后，立即把从侧拉齐
// （flush: 'post' 保证上面的 watchEffect 已把新设置推给引擎。
//   倍率与偏移必须一并监听：只监听 mode 的话，改完输入框画面纹丝不动，
//   用户得先滚一下才生效，像是坏了。）
watch(
  [
    () => settings.syncMode,
    () => settings.syncEnabled,
    () => settings.syncRatio,
    () => settings.syncOffset
  ],
  () => resyncNow(),
  { flush: 'post' }
)

// —— 专注模式：从单栏切回双栏时，把主侧位置重新同步给另一侧 ——
watch(
  () => settings.paneLayout,
  (layout, prev) => {
    if (layout !== 'both' || prev === 'both') return
    const master = settings.master
    const slave: MasterSide = master === 'question' ? 'answer' : 'question'
    const pf = viewer.summary(master).pageFloat
    // 被隐藏的一侧在 display:none 时无法设置 scrollTop，等恢复布局后再定位
    void nextTick(() => {
      requestAnimationFrame(() => viewer.apis[slave]?.applyPageFloat(pf))
    })
  }
)

// —— 主题与风格应用 ——
watchEffect(() => {
  document.documentElement.dataset.theme = settings.theme
  document.documentElement.dataset.style = settings.style
})

// —— 老板键：窗口标题（任务栏程序名）随伪装模式切换 ——
watchEffect(() => {
  document.title = boss.appTitle
  void window.api.setWindowTitle(boss.appTitle)
})

// —— 通用提示 ——
const notice = ref<{ title: string; message: string } | null>(null)

// —— 轻量吐司：用于「对齐」这类高频动作的非阻塞反馈（不打断刷题节奏） ——
const toast = ref<string | null>(null)
let toastTimer: number | null = null
function showToast(msg: string): void {
  toast.value = msg
  if (toastTimer != null) window.clearTimeout(toastTimer)
  toastTimer = window.setTimeout(() => {
    toast.value = null
    toastTimer = null
  }, 2600)
}

// —— 加密 PDF 密码流程 ——
interface PasswordRequest {
  side: MasterSide
  path: string
  /** 打开成功后的续接操作（如书签跳转） */
  after?: () => Promise<void> | void
}
const pendingPassword = ref<PasswordRequest | null>(null)

async function tryOpen(side: MasterSide, path: string, password?: string): Promise<void> {
  const result = await viewer.open(side, path, password)
  if (result === 'need-password') {
    pendingPassword.value = { side, path }
  }
}

async function openSide(side: MasterSide): Promise<void> {
  const path = await window.api.openPdfDialog()
  if (!path) return
  await tryOpen(side, path)
}

async function onPasswordSubmit(pwd: string): Promise<void> {
  const p = pendingPassword.value
  if (!p) return
  pendingPassword.value = null
  const result = await viewer.open(p.side, p.path, pwd)
  if (result === 'need-password') {
    pendingPassword.value = p
    return
  }
  if (result === 'error') {
    notice.value = { title: '打开失败', message: `无法打开文件：${p.path}` }
    return
  }
  if (p.after) await p.after()
}

// —— 书签 ——
function addBookmark(): void {
  if (!viewer.left.loaded || !viewer.right.loaded) {
    notice.value = { title: '无法添加书签', message: '请先打开题本和解析两个 PDF。' }
    return
  }
  bookmark.add({
    id: crypto.randomUUID(),
    questionPath: viewer.left.path as string,
    questionName: viewer.left.name as string,
    answerPath: viewer.right.path as string,
    answerName: viewer.right.name as string,
    questionPage: viewer.left.pageFloat,
    answerPage: viewer.right.pageFloat,
    createdAt: Date.now(),
    updatedAt: Date.now()
  })
}

/** 双侧跳转到书签位置（等 viewer 渲染后再应用） */
async function jumpToBookmark(b: Bookmark): Promise<void> {
  await nextTick()
  await nextTick()
  viewer.apis['question']?.applyPageFloat(b.questionPage)
  viewer.apis['answer']?.applyPageFloat(b.answerPage)
}

/** 打开书签关联的文件配对并跳转（含加密 PDF 续接） */
async function openBookmarkPair(b: Bookmark): Promise<void> {
  let r = await viewer.open('question', b.questionPath)
  if (r === 'need-password') {
    pendingPassword.value = {
      side: 'question',
      path: b.questionPath,
      after: () => openBookmarkPair(b)
    }
    return
  }
  if (r === 'error') {
    notice.value = { title: '打开失败', message: `题本文件无法打开：${b.questionPath}` }
    return
  }
  r = await viewer.open('answer', b.answerPath)
  if (r === 'need-password') {
    pendingPassword.value = {
      side: 'answer',
      path: b.answerPath,
      after: () => jumpToBookmark(b)
    }
    return
  }
  if (r === 'error') {
    notice.value = { title: '打开失败', message: `解析文件无法打开：${b.answerPath}` }
    return
  }
  await jumpToBookmark(b)
}

// —— 一键对齐（锚点校准） ——
/**
 * 把当前两侧页浮点记为一个锚点。
 * 首次对齐会自动切到「锚点校准」方式——用户按下对齐就是想要精确对应，
 * 不切模式的话记了锚点也不生效，反而像坏了。
 */
function alignSides(): void {
  if (!viewer.left.loaded || !viewer.right.loaded) {
    notice.value = { title: '无法对齐', message: '请先打开题本和解析两个 PDF。' }
    return
  }
  const q = viewer.left.pageFloat
  const a = viewer.right.pageFloat
  const outcome = syncEngine.addAnchor(q, a)
  if (outcome.status === 'rejected') {
    notice.value = {
      title: '锚点顺序冲突',
      message:
        '这个位置与已有锚点冲突：解析页码必须随题本页码递增。请换个位置对齐，或先清除已有锚点。'
    }
    return
  }
  const switched = settings.syncMode !== 'anchor'
  if (switched) settings.setSyncMode('anchor')
  settings.bumpSyncVersion()
  // 同一位置（0.5 页内）是覆盖而非新增——如实告知，否则用户以为记上了新锚点
  showToast(
    `已对齐 题本 P${Math.floor(q) + 1} ↔ 解析 P${Math.floor(a) + 1}` +
      (outcome.status === 'replaced'
        ? `（同位置，已更新第 ${outcome.index + 1} 个锚点）`
        : `（第 ${outcome.index + 1} 个锚点）`) +
      (switched ? ' · 已切到锚点同步' : '')
  )
}

/** 把锚点估算出的倍率/偏移写入设置（锚点是会话级，倍率可持久化） */
function lockPageScale(): void {
  const est = syncEngine.estimatePageScale()
  if (!est) {
    notice.value = { title: '锚点不足', message: '至少需要 2 个锚点才能估算倍率，请先多对齐几处。' }
    return
  }
  settings.setPageScale(est.ratio, est.offset)
  settings.setSyncMode('pageScale')
  showToast(`已按锚点估算倍率 ${est.ratio.toFixed(3)}、偏移 ${est.offset.toFixed(2)} 并持久化`)
  // 已是 pageScale 模式时 setSyncMode 值未变、上面的 watch 不会触发，这里显式拉齐一次
  resyncNow()
}

function clearAnchors(): void {
  syncEngine.clearAnchors()
  settings.bumpSyncVersion()
  showToast('已清除全部锚点')
}

// —— 全局快捷键（绑定可自定义，来自 settings.shortcuts） ——
function cycleMask(): void {
  const order: MaskMode[] = ['off', 'click', 'hover', 'eraser']
  const i = order.indexOf(mask.mode)
  mask.setMode(order[(i + 1) % order.length])
}

/** 主侧翻页（整页对齐到页首） */
function stepPage(delta: number): void {
  const side = settings.master
  const s = viewer.summary(side)
  if (!s.loaded || s.numPages === 0) return
  const target = Math.floor(s.pageFloat) + delta
  viewer.apis[side]?.gotoPage(Math.min(s.numPages - 1, Math.max(0, target)))
}

function executeShortcut(action: ShortcutAction): void {
  switch (action) {
    case 'undo':
      annotation.undo()
      break
    case 'help':
      showHelp.value = !showHelp.value
      break
    case 'bossKey':
      boss.toggle()
      break
    case 'openQuestion':
      void openSide('question')
      break
    case 'openAnswer':
      void openSide('answer')
      break
    case 'toolPen':
      annotation.setTool('pen')
      break
    case 'toolText':
      annotation.setTool('text')
      break
    case 'toolBrowse':
      annotation.setTool('browse')
      break
    case 'maskCycle':
      cycleMask()
      break
    case 'maskToggle':
      mask.toggleEnabled()
      break
    case 'addBookmark':
      addBookmark()
      break
    case 'toggleBookmarks':
      showBookmarks.value = !showBookmarks.value
      break
    case 'syncToggle':
      settings.toggleSync()
      break
    case 'syncAlign':
      alignSides()
      break
    case 'pageNext':
      stepPage(1)
      break
    case 'pagePrev':
      stepPage(-1)
      break
    case 'fitWidth':
      viewer.apis[settings.master]?.fitWidth()
      break
    case 'focusToggle':
      settings.cyclePaneLayout()
      break
  }
}

function onKeydown(e: KeyboardEvent): void {
  // 文本编辑中禁用应用快捷键（避免输入冲突）
  const el = document.activeElement
  const editingText = !!el && (el.tagName === 'TEXTAREA' || el.tagName === 'INPUT')
  if (editingText) return
  const binding = eventToBinding(e)
  if (!binding) return
  for (const action of SHORTCUT_ACTIONS) {
    if (settings.shortcuts[action] === binding) {
      e.preventDefault()
      executeShortcut(action)
      return
    }
  }
}

/** 退出前把聚合中的阅读进度与各 JSON 待写数据落盘，避免丢最后一段 */
function persistAll(): void {
  progress.persistNow()
  void flushAll()
}

onMounted(() => {
  void settings.load()
  void bookmark.load()
  void annotation.load()
  void mask.load()
  void progress.load()
  window.addEventListener('keydown', onKeydown)
  window.addEventListener('beforeunload', persistAll)
})

onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKeydown)
  window.removeEventListener('beforeunload', persistAll)
  persistAll()
})

// dev 冒烟测试钩子：暴露 store 供主进程 executeJavaScript 驱动
if (import.meta.env.DEV) {
  ;(window as unknown as Record<string, unknown>).__viewerStore = viewer
  ;(window as unknown as Record<string, unknown>).__maskStore = mask
  ;(window as unknown as Record<string, unknown>).__settingsStore = settings
  ;(window as unknown as Record<string, unknown>).__bookmarkStore = bookmark
  ;(window as unknown as Record<string, unknown>).__annotationStore = annotation
  ;(window as unknown as Record<string, unknown>).__syncEngine = syncEngine
  ;(window as unknown as Record<string, unknown>).__alignSides = alignSides
  ;(window as unknown as Record<string, unknown>).__clearAnchors = clearAnchors
  ;(window as unknown as Record<string, unknown>).__lockPageScale = lockPageScale
  ;(window as unknown as Record<string, unknown>).__openBookmarkPair = openBookmarkPair
}
</script>

<template>
  <div class="app">
    <Toolbar
      @open="openSide"
      @toggle-bookmarks="showBookmarks = !showBookmarks"
      @add-bookmark="addBookmark"
      @toggle-help="showHelp = !showHelp"
      @align-sync="alignSides"
      @lock-page-scale="lockPageScale"
      @clear-anchors="clearAnchors"
    />
    <div class="app-body">
      <SplitPane>
        <template #left>
          <PdfViewer side="question" @request-open="openSide" />
        </template>
        <template #right>
          <PdfViewer side="answer" @request-open="openSide" />
        </template>
      </SplitPane>
      <BookmarkPanel v-if="showBookmarks" @open-pair="openBookmarkPair" @close="showBookmarks = false" />
    </div>
    <PasswordDialog
      v-if="pendingPassword"
      @submit="onPasswordSubmit"
      @cancel="pendingPassword = null"
    />
    <ConfirmDialog
      v-if="notice"
      :title="notice.title"
      :message="notice.message"
      single
      confirm-text="知道了"
      @confirm="notice = null"
    />
    <HelpDialog v-if="showHelp" @close="showHelp = false" />
    <Transition name="toast">
      <div v-if="toast" class="toast" role="status">{{ toast }}</div>
    </Transition>
  </div>
</template>
