import { defineStore } from 'pinia'
import { reactive, ref } from 'vue'
import type { MasterSide } from '@/types'
import { PdfDocument, isPasswordError } from '@/core/pdf/PdfDocument'

export interface ViewerSummary {
  path: string | null
  name: string | null
  loaded: boolean
  loading: boolean
  error: string | null
  numPages: number
  scale: number
  pageFloat: number
}

/** 由 PdfViewer 组件注册的实例 API（非响应式） */
export interface ViewerApi {
  applyPageFloat(pf: number): void
  applyScale(scale: number): void
  gotoPage(pageIndex: number): void
}

export type OpenResult = 'ok' | 'need-password' | 'error'

function emptySummary(): ViewerSummary {
  return {
    path: null,
    name: null,
    loaded: false,
    loading: false,
    error: null,
    numPages: 0,
    scale: 1.25,
    pageFloat: 0
  }
}

export const useViewerStore = defineStore('viewer', () => {
  const left = reactive<ViewerSummary>(emptySummary())
  const right = reactive<ViewerSummary>(emptySummary())

  // —— 非响应式内部状态 ——
  const docs: Record<MasterSide, PdfDocument | null> = { question: null, answer: null }
  const baseSizes: Record<MasterSide, { heights: number[]; widths: number[] }> = {
    question: { heights: [], widths: [] },
    answer: { heights: [], widths: [] }
  }
  /** 尺寸数据变更信号（触发组件重建 PageMapper） */
  const sizeVersion = ref(0)
  /** 文档实例变更信号（触发组件 doc computed 重算：再次打开时重渲染） */
  const docVersion = ref(0)

  const apis: Record<MasterSide, ViewerApi | null> = { question: null, answer: null }

  function summary(side: MasterSide): ViewerSummary {
    return side === 'question' ? left : right
  }

  function register(side: MasterSide, api: ViewerApi | null): void {
    apis[side] = api
  }

  function getDoc(side: MasterSide): PdfDocument | null {
    void docVersion.value
    return docs[side]
  }

  /** 组件 computed 中使用：touch sizeVersion 以响应尺寸变化 */
  function getBaseSizes(side: MasterSide): { heights: number[]; widths: number[] } {
    void sizeVersion.value
    return baseSizes[side]
  }

  function setScale(side: MasterSide, scale: number): void {
    summary(side).scale = Math.min(4, Math.max(0.5, scale))
  }

  /**
   * 请求缩放（组件 Ctrl+滚轮 / 工具栏按钮）。
   * 通过实例 API 应用（组件内部保持当前页浮点），zoomSync 时联动另一侧。
   */
  function requestScale(side: MasterSide, scale: number): void {
    const clamped = Math.min(4, Math.max(0.5, scale))
    const settings = useSettingsStore()
    apis[side]?.applyScale(clamped)
    if (settings.zoomSync) {
      const other: MasterSide = side === 'question' ? 'answer' : 'question'
      apis[other]?.applyScale(clamped)
    }
  }

  async function open(side: MasterSide, path: string, password?: string): Promise<OpenResult> {
    const s = summary(side)
    s.loading = true
    s.error = null
    try {
      const data = await window.api.readPdf(path)
      const doc = await PdfDocument.load(data, password)
      docs[side]?.destroy()
      docs[side] = doc

      // 计算 base 尺寸（scale=1 的 CSS px），供 PageMapper 使用
      const heights: number[] = new Array(doc.numPages)
      const widths: number[] = new Array(doc.numPages)
      for (let i = 0; i < doc.numPages; i++) {
        const size = await doc.getPageCssSize(i, 1)
        heights[i] = size.cssHeight
        widths[i] = size.cssWidth
      }
      baseSizes[side] = { heights, widths }
      sizeVersion.value++
      docVersion.value++

      s.path = path
      s.name = path.split(/[\\/]/).pop() ?? path
      s.numPages = doc.numPages
      s.pageFloat = 0
      s.loaded = true
      return 'ok'
    } catch (e) {
      if (isPasswordError(e)) return 'need-password'
      s.error = e instanceof Error ? e.message : String(e)
      return 'error'
    } finally {
      s.loading = false
    }
  }

  function close(side: MasterSide): void {
    const s = summary(side)
    docs[side]?.destroy()
    docs[side] = null
    baseSizes[side] = { heights: [], widths: [] }
    sizeVersion.value++
    docVersion.value++
    Object.assign(s, emptySummary())
  }

  return { left, right, apis, summary, register, getDoc, getBaseSizes, setScale, requestScale, open, close }
})

// 延迟引入避免循环初始化问题
import { useSettingsStore } from '@/stores/settings'
