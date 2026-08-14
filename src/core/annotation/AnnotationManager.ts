import type { DocAnnotations, InkStroke, PageAnnotations, TextBox } from '@/types'

/** 点到线段的最短距离 */
function distToSegment(
  px: number,
  py: number,
  x1: number,
  y1: number,
  x2: number,
  y2: number
): number {
  const dx = x2 - x1
  const dy = y2 - y1
  const len2 = dx * dx + dy * dy
  if (len2 === 0) return Math.hypot(px - x1, py - y1)
  let t = ((px - x1) * dx + (py - y1) * dy) / len2
  t = Math.max(0, Math.min(1, t))
  return Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy))
}

/** 笔画是否与圆形擦除区域相交（考虑线宽） */
function strokeIntersectsCircle(
  s: InkStroke,
  cx: number,
  cy: number,
  r: number
): boolean {
  const reach = r + s.width / 2
  if (s.points.length === 0) return false
  if (s.points.length === 1) {
    return Math.hypot(s.points[0].x - cx, s.points[0].y - cy) <= reach
  }
  for (let i = 1; i < s.points.length; i++) {
    const a = s.points[i - 1]
    const b = s.points[i]
    if (distToSegment(cx, cy, a.x, a.y, b.x, b.y) <= reach) return true
  }
  return false
}

/** 被擦除的笔画及其原始索引（供撤销恢复原位） */
export interface RemovedStroke {
  index: number
  stroke: InkStroke
}

/**
 * 标注管理（画笔笔迹 + 文本框）。
 * 结构：文件路径 → 页 → { strokes, boxes }。
 * 坐标均为「相对页面的基础坐标」（uiScale=1 时的 CSS px），渲染时乘 scalePx。
 * 本类为纯逻辑（非响应式），变更由 store 的 version 信号驱动 UI 重绘。
 */
export class AnnotationManager {
  private docs = new Map<string, Map<number, PageAnnotations>>()

  private pageOf(path: string, page: number): PageAnnotations {
    let doc = this.docs.get(path)
    if (!doc) {
      doc = new Map()
      this.docs.set(path, doc)
    }
    let p = doc.get(page)
    if (!p) {
      p = { page, strokes: [], boxes: [] }
      doc.set(page, p)
    }
    return p
  }

  getPage(path: string, page: number): PageAnnotations {
    return this.pageOf(path, page)
  }

  hasPage(path: string, page: number): boolean {
    return !!this.docs.get(path)?.has(page)
  }

  addStroke(path: string, page: number, stroke: InkStroke): void {
    this.pageOf(path, page).strokes.push(stroke)
  }

  removeStroke(path: string, page: number, id: string): void {
    const p = this.docs.get(path)?.get(page)
    if (!p) return
    p.strokes = p.strokes.filter((s) => s.id !== id)
  }

  /**
   * 画笔橡皮擦：删除与圆形区域相交的整条笔迹（笔画级擦除）。
   * @returns 被删除的笔画及其原始索引（供撤销恢复）
   */
  eraseStrokesAt(
    path: string,
    page: number,
    x: number,
    y: number,
    radius: number
  ): RemovedStroke[] {
    const p = this.docs.get(path)?.get(page)
    if (!p) return []
    const removed: RemovedStroke[] = []
    p.strokes = p.strokes.filter((s, i) => {
      if (strokeIntersectsCircle(s, x, y, radius)) {
        removed.push({ index: i, stroke: s })
        return false
      }
      return true
    })
    return removed
  }

  /** 撤销擦除：按原始索引恢复笔画 */
  insertStrokes(path: string, page: number, items: RemovedStroke[]): void {
    if (items.length === 0) return
    const p = this.pageOf(path, page)
    const sorted = [...items].sort((a, b) => a.index - b.index)
    for (const it of sorted) {
      p.strokes.splice(Math.min(it.index, p.strokes.length), 0, it.stroke)
    }
  }

  addBox(path: string, page: number, box: TextBox): void {
    this.pageOf(path, page).boxes.push(box)
  }

  updateBox(path: string, page: number, box: TextBox): void {
    const p = this.pageOf(path, page)
    const i = p.boxes.findIndex((b) => b.id === box.id)
    if (i >= 0) p.boxes[i] = box
  }

  removeBox(path: string, page: number, id: string): void {
    const p = this.docs.get(path)?.get(page)
    if (!p) return
    p.boxes = p.boxes.filter((b) => b.id !== id)
  }

  clearPage(path: string, page: number): void {
    this.docs.get(path)?.delete(page)
  }

  clearDoc(path: string): void {
    this.docs.delete(path)
  }

  /**
   * 渲染一页全部笔迹（canvas 需已按设备像素设置宽高）。
   * @param scalePx 基础坐标 → 设备像素的倍数（uiScale × dpr）
   * @param extra 附加临时笔迹（正在绘制中的笔画，未持久化）
   */
  renderStrokes(
    ctx: CanvasRenderingContext2D,
    path: string,
    page: number,
    scalePx: number,
    extra?: InkStroke | null
  ): void {
    const { width, height } = ctx.canvas
    ctx.clearRect(0, 0, width, height)
    const p = this.docs.get(path)?.get(page)
    const strokes = p ? p.strokes : []
    const all = extra ? [...strokes, extra] : strokes
    if (all.length === 0) return

    ctx.save()
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    for (const s of all) {
      ctx.strokeStyle = s.color
      ctx.fillStyle = s.color
      const w = s.width * scalePx
      if (s.points.length === 1) {
        // 单点：画圆点
        const pt = s.points[0]
        ctx.beginPath()
        ctx.arc(pt.x * scalePx, pt.y * scalePx, w / 2, 0, Math.PI * 2)
        ctx.fill()
      } else {
        ctx.lineWidth = w
        ctx.beginPath()
        ctx.moveTo(s.points[0].x * scalePx, s.points[0].y * scalePx)
        for (let i = 1; i < s.points.length; i++) {
          ctx.lineTo(s.points[i].x * scalePx, s.points[i].y * scalePx)
        }
        ctx.stroke()
      }
    }
    ctx.restore()
  }

  toJSON(): DocAnnotations[] {
    const out: DocAnnotations[] = []
    for (const [path, pagesMap] of this.docs) {
      const pages: PageAnnotations[] = []
      for (const p of pagesMap.values()) {
        // 数据兜底：空文本框（未输入内容）永不落盘，杜绝空白框残留
        const boxes = p.boxes.filter((b) => b.text.trim() !== '')
        if (p.strokes.length > 0 || boxes.length > 0) {
          pages.push({ page: p.page, strokes: p.strokes, boxes })
        }
      }
      if (pages.length > 0) {
        const fileName = path.split(/[\\/]/).pop() ?? path
        out.push({ path, fileName, pages })
      }
    }
    return out
  }

  loadFrom(data: DocAnnotations[]): void {
    this.docs.clear()
    for (const doc of data) {
      const m = new Map<number, PageAnnotations>()
      for (const p of doc.pages) m.set(p.page, p)
      this.docs.set(doc.path, m)
    }
  }
}
