import { defineStore } from 'pinia'
import { ref } from 'vue'
import { MaskManager, ERASER_RADIUS } from '@/core/mask/MaskManager'
import { readJson, writeJsonDebounced } from '@/storage/DataStore'
import { useAnnotationStore } from '@/stores/annotation'
import type { DocMasks, MaskMode, MaskStroke } from '@/types'

const MASKS_FILE = 'masks.json'

/** 遮罩操作即进入浏览语义：标注工具自动切回浏览 */
function switchToolToBrowse(): void {
  const ann = useAnnotationStore()
  if (ann.activeTool !== 'browse') ann.setTool('browse')
}

export const useMaskStore = defineStore('mask', () => {
  /** 核心遮罩逻辑（非响应式）：按「文件 + 页」隔离，可持久化 */
  const manager = new MaskManager()
  const mode = ref<MaskMode>('click')
  /** 整页遮罩显隐开关（一键显示/隐藏解析） */
  const enabled = ref(true)
  /** 笔画数据版本号：变化时通知页面重绘遮罩 */
  const version = ref(0)
  const loaded = ref(false)

  async function load(): Promise<void> {
    const data = await readJson<DocMasks[]>(MASKS_FILE)
    if (data) manager.loadFrom(data)
    loaded.value = true
    version.value++
  }

  /** 高频写入（擦除拖动落笔）走去抖，避免每次 mousemove 打磁盘 */
  function persist(): void {
    writeJsonDebounced(MASKS_FILE, manager.toJSON())
  }

  function touch(): void {
    version.value++
    persist()
  }

  function addStroke(path: string, page: number, stroke: MaskStroke): void {
    manager.addStroke(path, page, stroke)
    touch()
  }

  function eraseCircle(path: string, page: number, x: number, y: number, radius = 70): void {
    manager.eraseCircle(path, page, x, y, radius)
    touch()
  }

  // —— 橡皮擦拖动：一次拖动 = 一条折线笔画（避免每个采样点都存一个圆） ——

  function beginErase(
    path: string,
    page: number,
    x: number,
    y: number,
    radius = ERASER_RADIUS
  ): void {
    manager.beginErase(path, page, x, y, radius)
    version.value++
  }

  /** @returns 是否有新顶点追加（true 才需要重绘） */
  function extendErase(x: number, y: number): boolean {
    if (!manager.extendErase(x, y)) return false
    version.value++
    return true
  }

  function endErase(): void {
    if (manager.endErase()) touch()
    else version.value++
  }

  function cancelErase(): void {
    manager.cancelErase()
    version.value++
  }

  function clearPage(path: string, page: number): void {
    manager.clearPage(path, page)
    touch()
  }

  function clearAll(): void {
    manager.clearAll()
    touch()
    switchToolToBrowse()
  }

  /** 重置某本解析的全部遮罩 */
  function clearDoc(path: string): void {
    manager.clearDoc(path)
    touch()
    switchToolToBrowse()
  }

  function setMode(m: MaskMode): void {
    mode.value = m
    switchToolToBrowse()
  }

  function toggleEnabled(): void {
    enabled.value = !enabled.value
    switchToolToBrowse()
  }

  return {
    manager,
    mode,
    enabled,
    version,
    loaded,
    load,
    persist,
    addStroke,
    eraseCircle,
    beginErase,
    extendErase,
    endErase,
    cancelErase,
    clearPage,
    clearDoc,
    clearAll,
    setMode,
    toggleEnabled
  }
})
