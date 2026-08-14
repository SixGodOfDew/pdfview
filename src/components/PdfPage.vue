<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import type { PdfDocument } from '@/core/pdf/PdfDocument'
import { useMaskStore } from '@/stores/mask'
import { useAnnotationStore } from '@/stores/annotation'
import { useSettingsStore } from '@/stores/settings'
import type { InkStroke, MasterSide, TextBox } from '@/types'

const props = defineProps<{
  pageIndex: number
  doc: PdfDocument
  scale: number
  side: MasterSide
  path: string | null
}>()

const maskStore = useMaskStore()
const annotation = useAnnotationStore()
const settings = useSettingsStore()

const pdfCanvas = ref<HTMLCanvasElement | null>(null)
const maskCanvas = ref<HTMLCanvasElement | null>(null)
const inkCanvas = ref<HTMLCanvasElement | null>(null)
const boxInput = ref<HTMLTextAreaElement | null>(null)

const hoverPos = ref<{ x: number; y: number } | null>(null)
const erasing = ref(false)

// —— 画笔进行中的临时笔画 ——
const currentStroke = ref<InkStroke | null>(null)

// —— 文本框编辑 ——
const editingBox = ref<TextBox | null>(null)
const boxDraft = ref('')

const isAnswer = computed(() => props.side === 'answer')
const showMask = computed(() => isAnswer.value && maskStore.enabled && maskStore.mode !== 'off')

/** 当前页的文本框（touch textVersion 保持响应式） */
const boxes = computed<TextBox[]>(() => {
  void annotation.textVersion
  if (!props.path) return []
  return annotation.manager.getPage(props.path, props.pageIndex).boxes
})

let renderSeq = 0

async function render(): Promise<void> {
  const canvas = pdfCanvas.value
  if (!canvas) return
  const seq = ++renderSeq
  try {
    await props.doc.renderPage(props.pageIndex, canvas, props.scale)
  } catch {
    return // 渲染取消/竞态，忽略
  }
  if (seq !== renderSeq) return // 已有更新的渲染任务
  redrawMask()
  redrawInk()
}

function alignCanvas(target: HTMLCanvasElement | null): HTMLCanvasElement | null {
  const pc = pdfCanvas.value
  if (!target || !pc) return null
  if (target.width !== pc.width) target.width = pc.width
  if (target.height !== pc.height) target.height = pc.height
  target.style.width = pc.style.width
  target.style.height = pc.style.height
  return target
}

/** 重绘遮罩（含悬停形状） */
function redrawMask(): void {
  const mc = alignCanvas(maskCanvas.value)
  if (!mc) return
  const ctx = mc.getContext('2d')
  if (!ctx) return
  const dpr = window.devicePixelRatio || 1
  const scalePx = props.scale * dpr
  const hover =
    maskStore.mode === 'hover' && hoverPos.value
      ? { ...hoverPos.value, shape: settings.hoverShape }
      : null
  maskStore.manager.renderPage(ctx, props.pageIndex, scalePx, hover)
}

/** 重绘笔迹层（持久笔画 + 进行中的笔画） */
function redrawInk(): void {
  const ic = alignCanvas(inkCanvas.value)
  if (!ic) return
  const ctx = ic.getContext('2d')
  if (!ctx) return
  if (!props.path) {
    ctx.clearRect(0, 0, ic.width, ic.height)
    return
  }
  const dpr = window.devicePixelRatio || 1
  const scalePx = props.scale * dpr
  annotation.manager.renderStrokes(ctx, props.path, props.pageIndex, scalePx, currentStroke.value)
}

// ================= 坐标换算 =================

/** 鼠标位置 → 相对页面的基础坐标（uiScale=1 时的 CSS px） */
function evtPos(e: MouseEvent): { x: number; y: number } {
  const el = e.currentTarget as HTMLElement
  const rect = el.getBoundingClientRect()
  return {
    x: (e.clientX - rect.left) / props.scale,
    y: (e.clientY - rect.top) / props.scale
  }
}

// ================= 事件路由（遮罩优先于工具；进行中的笔画不可打断） =================

/** 遮罩是否应接管鼠标交互（解析侧 + 遮罩启用 + 模式非关） */
function isMaskInteractive(): boolean {
  return isAnswer.value && maskStore.enabled && maskStore.mode !== 'off'
}

/** 操作遮罩时自动切回浏览工具（工具栏高亮同步反馈） */
function switchToBrowse(): void {
  if (annotation.activeTool !== 'browse') annotation.setTool('browse')
}

function onMouseDown(e: MouseEvent): void {
  // 遮罩橡皮擦优先（任何工具下都可用，操作时自动切回浏览）
  if (isMaskInteractive() && maskStore.mode === 'eraser') {
    switchToBrowse()
    erasing.value = true
    const { x, y } = evtPos(e)
    maskStore.eraseCircle(props.pageIndex, x, y, 18)
    return
  }
  if (annotation.activeTool === 'pen') {
    startInk(e)
  }
}

function onMouseMove(e: MouseEvent): void {
  // 正在绘制的笔画优先（不可被打断）
  if (currentStroke.value && annotation.activeTool === 'pen') {
    const { x, y } = evtPos(e)
    currentStroke.value.points.push({ x, y })
    redrawInk()
    return
  }
  // 遮罩橡皮擦拖动
  if (isMaskInteractive() && maskStore.mode === 'eraser' && erasing.value) {
    switchToBrowse()
    const { x, y } = evtPos(e)
    maskStore.eraseCircle(props.pageIndex, x, y, 18)
    return
  }
  // 遮罩悬停露出（任何工具下，操作时自动切回浏览）
  if (isMaskInteractive() && maskStore.mode === 'hover') {
    switchToBrowse()
    const { x, y } = evtPos(e)
    hoverPos.value = { x, y }
    redrawMask()
  }
}

function onMouseUp(): void {
  if (currentStroke.value && annotation.activeTool === 'pen') {
    const stroke = currentStroke.value
    currentStroke.value = null
    if (props.path) {
      annotation.addStroke(props.path, props.pageIndex, stroke)
    }
    redrawInk()
  }
  erasing.value = false
}

function onLeave(): void {
  if (hoverPos.value) {
    hoverPos.value = null
    redrawMask()
  }
  erasing.value = false
}

function onClick(e: MouseEvent): void {
  // 遮罩点击露出优先（任何工具下，操作时自动切回浏览）
  if (isMaskInteractive() && maskStore.mode === 'click') {
    switchToBrowse()
    const { x, y } = evtPos(e)
    maskStore.eraseCircle(props.pageIndex, x, y, 70)
    return
  }
  if (annotation.activeTool === 'text') {
    addTextBoxAt(e)
  }
}

// ================= 画笔 =================

function startInk(e: MouseEvent): void {
  if (!props.path) return
  const { x, y } = evtPos(e)
  currentStroke.value = {
    id: crypto.randomUUID(),
    color: annotation.penColor,
    width: annotation.penWidth,
    points: [{ x, y }]
  }
  redrawInk()
}

// ================= 文本框 =================

function addTextBoxAt(e: MouseEvent): void {
  if (!props.path) return
  // 先结算上一个未完成的编辑框（连续点击会泄漏空框）
  settleEditing()
  const { x, y } = evtPos(e)
  const box: TextBox = {
    id: crypto.randomUUID(),
    x,
    y,
    text: '',
    color: '#c62828',
    fontSize: 16,
    updatedAt: Date.now()
  }
  annotation.addBox(props.path, props.pageIndex, box)
  startEdit(box)
}

/** 提交或删除当前编辑框（幂等，供新框创建/切页前结算） */
function settleEditing(): void {
  if (!props.path || !editingBox.value) return
  const box = editingBox.value
  const text = boxDraft.value.trim()
  if (text === '') {
    annotation.removeBox(props.path, props.pageIndex, box.id)
  } else {
    annotation.updateBox(props.path, props.pageIndex, {
      ...box,
      text,
      updatedAt: Date.now()
    })
  }
  editingBox.value = null
}

function startEdit(box: TextBox): void {
  editingBox.value = box
  boxDraft.value = box.text
  void nextTick(() => {
    boxInput.value?.focus()
  })
}

function commitBox(box: TextBox): void {
  if (!props.path) return
  const text = boxDraft.value.trim()
  if (text === '') {
    // 空文本：移除（幂等，重复调用无害）
    annotation.removeBox(props.path, props.pageIndex, box.id)
  } else {
    annotation.updateBox(props.path, props.pageIndex, {
      ...box,
      text,
      updatedAt: Date.now()
    })
  }
  if (editingBox.value?.id === box.id) {
    editingBox.value = null
  }
}

function cancelBox(): void {
  if (!props.path || !editingBox.value) return
  const box = editingBox.value
  // 若为新空框则移除；否则保留原文本
  if (box.text === '') {
    annotation.removeBox(props.path, props.pageIndex, box.id)
  }
  editingBox.value = null
}

function deleteBox(box: TextBox): void {
  if (!props.path) return
  annotation.removeBox(props.path, props.pageIndex, box.id)
  if (editingBox.value?.id === box.id) editingBox.value = null
}

// —— 文本框拖动（Pointer Events + setPointerCapture：保证 pointerup 可靠触发，
//    杜绝原生文本选择/拖拽吞掉 mouseup 导致文本框持续跟随鼠标的 bug） ——
let dragBox: TextBox | null = null
let dragStart: { mx: number; my: number; bx: number; by: number } | null = null
let dragTarget: HTMLElement | null = null

function onBoxDown(box: TextBox, e: PointerEvent): void {
  if (editingBox.value?.id === box.id) return
  // 点击删除按钮/编辑框不启动拖拽，也不拦截事件（保证 click/dblclick 正常派发）
  const target = e.target as HTMLElement
  if (target.closest('.tb-del') || target.closest('.tb-input')) return
  // 注意：不调用 preventDefault——它会抑制后续 click/dblclick 派生事件，
  // 导致删除按钮与双击编辑失效；防文本选择由 user-select:none 承担，
  // 拖拽可靠性由 Pointer Capture 承担
  e.stopPropagation()
  dragBox = box
  dragStart = { mx: e.clientX, my: e.clientY, bx: box.x, by: box.y }
  dragTarget = e.currentTarget as HTMLElement
  dragTarget.setPointerCapture?.(e.pointerId)
  dragTarget.addEventListener('pointermove', onBoxDrag)
  dragTarget.addEventListener('pointerup', onBoxDragEnd)
  dragTarget.addEventListener('pointercancel', onBoxDragEnd)
}

function onBoxDrag(e: PointerEvent): void {
  if (!dragBox || !dragStart) return
  const dx = (e.clientX - dragStart.mx) / props.scale
  const dy = (e.clientY - dragStart.my) / props.scale
  dragBox.x = dragStart.bx + dx
  dragBox.y = dragStart.by + dy
  annotation.textVersion++
}

function onBoxDragEnd(): void {
  if (dragBox && props.path) {
    dragBox.updatedAt = Date.now()
    void annotation.persist()
  }
  const t = dragTarget
  dragBox = null
  dragStart = null
  dragTarget = null
  if (t) {
    t.removeEventListener('pointermove', onBoxDrag)
    t.removeEventListener('pointerup', onBoxDragEnd)
    t.removeEventListener('pointercancel', onBoxDragEnd)
  }
}

function boxStyle(box: TextBox): Record<string, string> {
  return {
    left: box.x * props.scale + 'px',
    top: box.y * props.scale + 'px',
    fontSize: box.fontSize * props.scale + 'px',
    color: box.color
  }
}

// ================= 生命周期 =================

watch(() => props.scale, () => void render())
watch(
  [() => maskStore.version, () => maskStore.enabled, () => settings.hoverShape],
  () => redrawMask()
)
watch([() => annotation.version, () => props.path], () => redrawInk())
// 工具切换时结算编辑框：空文本自动删除（blur 不可靠的兜底）
watch(() => annotation.activeTool, () => settleEditing())

onMounted(() => void render())
onBeforeUnmount(() => {
  renderSeq++
  // 组件卸载前结算编辑框（聚焦的 textarea 随虚拟滚动卸载时 blur 不会触发）
  settleEditing()
  // 释放位图内存（虚拟滚动滚出可视区时回收）
  for (const c of [pdfCanvas.value, maskCanvas.value, inkCanvas.value]) {
    if (c) {
      c.width = 0
      c.height = 0
    }
  }
  // 清理可能残留的拖拽监听
  if (dragTarget) onBoxDragEnd()
})
</script>

<template>
  <div class="pdf-page">
    <canvas ref="pdfCanvas" class="pdf-canvas" />
    <canvas
      ref="maskCanvas"
      class="mask-canvas"
      :style="{ display: showMask ? 'block' : 'none' }"
    />
    <canvas
      ref="inkCanvas"
      class="ink-canvas"
      :class="{
        'ink-pen': annotation.activeTool === 'pen' && !isMaskInteractive(),
        'ink-text': annotation.activeTool === 'text' && !isMaskInteractive(),
        'ink-mask-eraser': isMaskInteractive() && maskStore.mode === 'eraser'
      }"
      @mousedown="onMouseDown"
      @mousemove="onMouseMove"
      @mouseup="onMouseUp"
      @mouseleave="onLeave"
      @click="onClick"
    />
    <div
      v-for="box in boxes"
      :key="box.id"
      class="text-box"
      :style="boxStyle(box)"
      @pointerdown.stop="onBoxDown(box, $event)"
      @dblclick.stop="startEdit(box)"
    >
      <template v-if="editingBox?.id === box.id">
        <textarea
          ref="boxInput"
          v-model="boxDraft"
          class="tb-input"
          :style="{ fontSize: box.fontSize * scale + 'px', color: box.color }"
          @keydown.enter.prevent="commitBox(box)"
          @keydown.esc.prevent="cancelBox()"
          @blur="commitBox(box)"
        />
      </template>
      <template v-else>
        <span class="tb-text">{{ box.text }}</span>
        <button class="tb-del" title="删除" @click.stop="deleteBox(box)">×</button>
      </template>
    </div>
    <span v-if="isAnswer" class="page-no">{{ pageIndex + 1 }}</span>
  </div>
</template>
