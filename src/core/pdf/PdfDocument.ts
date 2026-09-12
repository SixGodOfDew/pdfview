import { getDocument, GlobalWorkerOptions, type PDFDocumentProxy } from 'pdfjs-dist'
// 本地 worker 文件（离线可用，不打 CDN）
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'

GlobalWorkerOptions.workerSrc = workerUrl

export function isPasswordError(e: unknown): boolean {
  return e instanceof Error && e.name === 'PasswordException'
}

export interface PageCssSize {
  cssWidth: number
  cssHeight: number
}

/** pdf.js 的加载任务（用 ReturnType 取得，免去依赖内部导出名） */
type PdfLoadingTask = ReturnType<typeof getDocument>

/** PDF.js 封装：加载 / 尺寸 / 渲染 */
export class PdfDocument {
  readonly pdf: PDFDocumentProxy
  private readonly loadingTask: PdfLoadingTask

  private constructor(pdf: PDFDocumentProxy, loadingTask: PdfLoadingTask) {
    this.pdf = pdf
    this.loadingTask = loadingTask
  }

  static async load(data: Uint8Array, password?: string): Promise<PdfDocument> {
    // 复制一份：pdfjs 会把 data transfer 给 worker（detach），密码重试需要原始数据
    const copy = new Uint8Array(data)
    const task = getDocument({ data: copy, password })
    const pdf = await task.promise
    return new PdfDocument(pdf, task)
  }

  get numPages(): number {
    return this.pdf.numPages
  }

  /** 某页在 cssScale 下的 CSS 尺寸（不渲染） */
  async getPageCssSize(pageIndex: number, cssScale: number): Promise<PageCssSize> {
    const page = await this.pdf.getPage(pageIndex + 1)
    const vp = page.getViewport({ scale: cssScale })
    return { cssWidth: vp.width, cssHeight: vp.height }
  }

  /**
   * 渲染某页到 canvas。
   * @param cssScale CSS 像素缩放（内部自动乘 devicePixelRatio，高清无锯齿）
   */
  async renderPage(
    pageIndex: number,
    canvas: HTMLCanvasElement,
    cssScale: number
  ): Promise<PageCssSize> {
    const page = await this.pdf.getPage(pageIndex + 1)
    const dpr = window.devicePixelRatio || 1
    const viewport = page.getViewport({ scale: cssScale * dpr })
    const w = Math.floor(viewport.width)
    const h = Math.floor(viewport.height)
    if (canvas.width !== w) canvas.width = w
    if (canvas.height !== h) canvas.height = h
    canvas.style.width = `${Math.floor(w / dpr)}px`
    canvas.style.height = `${Math.floor(h / dpr)}px`
    const ctx = canvas.getContext('2d', { alpha: false })
    if (!ctx) throw new Error('无法获取 canvas 2d 上下文')
    await page.render({ canvas, viewport }).promise
    return { cssWidth: w / dpr, cssHeight: h / dpr }
  }

  /**
   * 彻底释放文档。
   *
   * 注意：`PDFDocumentProxy` **只有 `cleanup()`**（清缓存），没有 `destroy()`；
   * 真正终止 worker 的是 `loadingTask.destroy()`（类型注释原文：
   * "Abort all network requests and destroy the worker"）。
   * 只调 cleanup 会每打开一个文件就漏一个 worker，反复换文件时内存持续上涨。
   *
   * 渲染中的页面会因 worker 终止而 reject —— PdfPage.render 已忽略该错误。
   */
  destroy(): void {
    void this.loadingTask.destroy().catch(() => {
      /* 已在销毁中或加载失败：忽略 */
    })
  }
}
