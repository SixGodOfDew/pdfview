import { defineStore } from 'pinia'
import { ref } from 'vue'
import { AnnotationManager, type RemovedStroke } from '@/core/annotation/AnnotationManager'
import { readJson, writeJson } from '@/storage/DataStore'
import type { DocAnnotations, InkStroke, TextBox, ToolId } from '@/types'

/** 操作历史条目（会话内，不持久化） */
type HistoryEntry =
  | { kind: 'add-stroke'; path: string; page: number; stroke: InkStroke }
  | { kind: 'erase-strokes'; path: string; page: number; items: RemovedStroke[] }
  | { kind: 'add-box'; path: string; page: number; box: TextBox }
  | { kind: 'update-box'; path: string; page: number; prev: TextBox }
  | { kind: 'remove-box'; path: string; page: number; box: TextBox }

const HISTORY_LIMIT = 100

/** 标注：按文件+页持久化（annotations.json，原子写，可随同步中心跨机同步） */
export const useAnnotationStore = defineStore('annotation', () => {
  const manager = new AnnotationManager()

  /** 当前激活工具：browse（滚动/遮罩）/ pen（画笔）/ text（文字） */
  const activeTool = ref<ToolId>('browse')
  /** 画笔子模式：draw（绘制）/ erase（橡皮擦擦除笔迹） */
  const penMode = ref<'draw' | 'erase'>('draw')
  const penColor = ref('#e53935')
  const penWidth = ref(4)
  /** 笔迹变更信号（驱动 ink canvas 重绘） */
  const version = ref(0)
  /** 文本框变更信号（驱动文本框 DOM 重算） */
  const textVersion = ref(0)
  const loaded = ref(false)

  // ============ 撤销历史 ============
  const history = ref<HistoryEntry[]>([])

  function pushHistory(e: HistoryEntry): void {
    history.value.push(e)
    if (history.value.length > HISTORY_LIMIT) history.value.shift()
  }

  /** 一次拖动擦除合并为一条历史（显式会话：mouseup 时 endEraseSession） */
  let eraseSession: Extract<HistoryEntry, { kind: 'erase-strokes' }> | null = null

  /** 结束一次擦除会话（一次按下拖动 = 一条撤回记录；结束时统一持久化一次） */
  function endEraseSession(): void {
    if (eraseSession) {
      eraseSession = null
      void persist()
    }
  }

  function undo(): boolean {
    const e = history.value.pop()
    if (!e) return false
    // 撤销用 manager 直调，避免二次记录历史
    switch (e.kind) {
      case 'add-stroke':
        manager.removeStroke(e.path, e.page, e.stroke.id)
        version.value++
        break
      case 'erase-strokes':
        manager.insertStrokes(e.path, e.page, e.items)
        version.value++
        break
      case 'add-box':
        manager.removeBox(e.path, e.page, e.box.id)
        textVersion.value++
        break
      case 'update-box':
        manager.updateBox(e.path, e.page, e.prev)
        textVersion.value++
        break
      case 'remove-box':
        manager.addBox(e.path, e.page, e.box)
        textVersion.value++
        break
    }
    void persist()
    return true
  }

  async function load(): Promise<void> {
    const data = await readJson<DocAnnotations[]>('annotations.json')
    if (data) manager.loadFrom(data)
    loaded.value = true
  }

  async function persist(): Promise<void> {
    await writeJson('annotations.json', manager.toJSON())
  }

  function setTool(t: ToolId): void {
    activeTool.value = t
  }

  function setPenMode(m: 'draw' | 'erase'): void {
    penMode.value = m
  }

  function setPenColor(c: string): void {
    penColor.value = c
  }

  function setPenWidth(w: number): void {
    penWidth.value = w
  }

  function addStroke(path: string, page: number, stroke: InkStroke): void {
    manager.addStroke(path, page, stroke)
    pushHistory({ kind: 'add-stroke', path, page, stroke })
    version.value++
    void persist()
  }

  /** 画笔橡皮擦：删除经过的整条笔迹，返回是否擦除了内容（一次拖动合并为一条历史）。
   *  注意：拖动过程中不写盘（每次 move 写盘会因磁盘 IO 卡顿），
   *  由 endEraseSession 在 mouseup 时统一持久化一次。 */
  function eraseStrokesAt(path: string, page: number, x: number, y: number, radius = 22): boolean {
    const removed = manager.eraseStrokesAt(path, page, x, y, radius)
    if (removed.length === 0) return false
    if (eraseSession) {
      eraseSession.items.push(...removed)
    } else {
      eraseSession = { kind: 'erase-strokes', path, page, items: removed }
      pushHistory(eraseSession)
    }
    version.value++
    return true
  }

  function addBox(path: string, page: number, box: TextBox): void {
    manager.addBox(path, page, box)
    // 空框（未输入）不算操作，不记录历史
    if (box.text.trim() !== '') pushHistory({ kind: 'add-box', path, page, box })
    textVersion.value++
    void persist()
  }

  function updateBox(path: string, page: number, box: TextBox): void {
    const prev = manager.getPage(path, page).boxes.find((b) => b.id === box.id)
    manager.updateBox(path, page, box)
    if (prev && prev.text.trim() !== '' && prev.text !== box.text) {
      pushHistory({ kind: 'update-box', path, page, prev })
    }
    textVersion.value++
    void persist()
  }

  function removeBox(path: string, page: number, id: string): void {
    const box = manager.getPage(path, page).boxes.find((b) => b.id === id)
    if (box) {
      manager.removeBox(path, page, id)
      // 空框删除不记录历史（空框本不该存在）
      if (box.text.trim() !== '') pushHistory({ kind: 'remove-box', path, page, box })
      textVersion.value++
      void persist()
    }
  }

  function clearPage(path: string, page: number): void {
    manager.clearPage(path, page)
    version.value++
    textVersion.value++
    void persist()
  }

  return {
    manager,
    activeTool,
    penMode,
    penColor,
    penWidth,
    version,
    textVersion,
    history,
    loaded,
    load,
    persist,
    setTool,
    setPenMode,
    setPenColor,
    setPenWidth,
    addStroke,
    eraseStrokesAt,
    endEraseSession,
    undo,
    addBox,
    updateBox,
    removeBox,
    clearPage
  }
})
