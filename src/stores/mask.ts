import { defineStore } from 'pinia'
import { ref } from 'vue'
import { MaskManager } from '@/core/mask/MaskManager'
import { useAnnotationStore } from '@/stores/annotation'
import type { MaskMode, MaskStroke } from '@/types'

/** 遮罩操作即进入浏览语义：标注工具自动切回浏览 */
function switchToolToBrowse(): void {
  const ann = useAnnotationStore()
  if (ann.activeTool !== 'browse') ann.setTool('browse')
}

export const useMaskStore = defineStore('mask', () => {
  /** 核心遮罩逻辑（非响应式） */
  const manager = new MaskManager()
  const mode = ref<MaskMode>('click')
  /** 整页遮罩显隐开关（一键显示/隐藏解析） */
  const enabled = ref(true)
  /** 笔画数据版本号：变化时通知页面重绘遮罩 */
  const version = ref(0)

  function addStroke(page: number, stroke: MaskStroke): void {
    manager.addStroke(page, stroke)
    version.value++
  }

  function eraseCircle(page: number, x: number, y: number, radius = 70): void {
    manager.eraseCircle(page, x, y, radius)
    version.value++
  }

  function clearPage(page: number): void {
    manager.clearPage(page)
    version.value++
  }

  function clearAll(): void {
    manager.clearAll()
    version.value++
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

  return { manager, mode, enabled, version, addStroke, eraseCircle, clearPage, clearAll, setMode, toggleEnabled }
})
