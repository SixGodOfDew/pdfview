<script setup lang="ts">
import { nextTick, onMounted, ref, watchEffect } from 'vue'
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
import { useBossModeStore } from '@/stores/bossMode'
import { syncEngine } from '@/core/sync/SyncEngine'
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
const boss = useBossModeStore()

const showBookmarks = ref(false)
const showHelp = ref(false)

// —— 同步引擎 ↔ 设置联动 ——
watchEffect(() => {
  syncEngine.master = settings.master
  syncEngine.enabled = settings.syncEnabled
})
syncEngine.applyToSlave = (pf: number) => {
  const slave: MasterSide = settings.master === 'question' ? 'answer' : 'question'
  viewer.apis[slave]?.applyPageFloat(pf)
}

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

// —— 全局快捷键（绑定可自定义，来自 settings.shortcuts） ——
function cycleMask(): void {
  const order: MaskMode[] = ['off', 'click', 'hover', 'eraser']
  const i = order.indexOf(mask.mode)
  mask.setMode(order[(i + 1) % order.length])
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

onMounted(() => {
  void settings.load()
  void bookmark.load()
  void annotation.load()
  window.addEventListener('keydown', onKeydown)
})

// dev 冒烟测试钩子：暴露 store 供主进程 executeJavaScript 驱动
if (import.meta.env.DEV) {
  ;(window as unknown as Record<string, unknown>).__viewerStore = viewer
  ;(window as unknown as Record<string, unknown>).__maskStore = mask
  ;(window as unknown as Record<string, unknown>).__settingsStore = settings
  ;(window as unknown as Record<string, unknown>).__bookmarkStore = bookmark
  ;(window as unknown as Record<string, unknown>).__annotationStore = annotation
  ;(window as unknown as Record<string, unknown>).__syncEngine = syncEngine
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
  </div>
</template>
