import type { DocMasks, HoverShape, MaskStroke, PageMask } from '@/types'

/** 悬停临时擦除的位置与形状（可自定义形状） */
export interface HoverSpec {
  x: number
  y: number
  shape: HoverShape
}

/** 各形状的尺寸（基础坐标 CSS px）：宽/高/圆角半径；圆形取半径 */
const HOVER_SHAPE_SIZE: Record<HoverShape, { w: number; h: number; r: number }> = {
  circle: { w: 160, h: 160, r: 80 },
  square: { w: 132, h: 132, r: 14 },
  wide: { w: 240, h: 92, r: 20 },
  tall: { w: 92, h: 240, r: 20 }
}

/** 橡皮擦默认半径（基础坐标） */
export const ERASER_RADIUS = 18
/** 拖动中相邻顶点的最小间距：过近的采样点直接丢弃，控制折线顶点数量 */
const ERASER_MIN_STEP = 3

/**
 * 解析遮罩管理。
 * 笔画坐标存「相对页面的基础坐标」（uiScale=1 时的 CSS px），缩放后位置依然正确；
 * 渲染时乘以 scalePx（= uiScale × devicePixelRatio）换算为画布设备像素。
 * 遮罩 = 半透明底 + destination-out 擦除。
 *
 * 存储键是「文件路径 + 页号」：换一本解析时旧擦除不会串到新文件上。
 */
export class MaskManager {
  /** 文件路径 → 页号 → 擦除笔画 */
  private docs = new Map<string, Map<number, MaskStroke[]>>()
  /** 拖动中的临时折线（未提交、不落盘） */
  private transient: { path: string; page: number; stroke: MaskStroke } | null = null

  private pageOf(path: string, page: number): MaskStroke[] {
    let doc = this.docs.get(path)
    if (!doc) {
      doc = new Map()
      this.docs.set(path, doc)
    }
    let list = doc.get(page)
    if (!list) {
      list = []
      doc.set(page, list)
    }
    return list
  }

  addStroke(path: string, page: number, stroke: MaskStroke): void {
    this.pageOf(path, page).push(stroke)
  }

  /** 点击模式：固定半径圆形擦除 */
  eraseCircle(path: string, page: number, x: number, y: number, radius = 70): void {
    this.addStroke(path, page, { type: 'circle', points: [{ x, y }], radius })
  }

  /**
   * 橡皮擦拖动开始：建立一条临时折线，拖动中不断追加顶点。
   * 「一次拖动 = 一条笔画」，避免每个 mousemove 都新增一个圆（旧实现会让笔画数量
   * 随采样点数爆炸，渲染开销与落盘体积同步增长）。
   */
  beginErase(path: string, page: number, x: number, y: number, radius = ERASER_RADIUS): void {
    this.transient = { path, page, stroke: { type: 'polyline', points: [{ x, y }], radius } }
  }

  /** 拖动中追加顶点；返回是否真的追加（过近的采样点被丢弃） */
  extendErase(x: number, y: number): boolean {
    const t = this.transient
    if (!t) return false
    const pts = t.stroke.points
    const last = pts[pts.length - 1]
    if (Math.abs(x - last.x) < ERASER_MIN_STEP && Math.abs(y - last.y) < ERASER_MIN_STEP) {
      return false
    }
    pts.push({ x, y })
    return true
  }

  /** 拖动结束：提交为持久笔画；返回是否产生了一次实际擦除 */
  endErase(): boolean {
    const t = this.transient
    this.transient = null
    if (!t) return false
    this.pageOf(t.path, t.page).push(t.stroke)
    return true
  }

  /** 丢弃未提交的拖动（开关切换、页卸载等） */
  cancelErase(): void {
    this.transient = null
  }

  clearPage(path: string, page: number): void {
    this.transient = null
    this.docs.get(path)?.delete(page)
  }

  /** 清空全部文件的遮罩 */
  clearAll(): void {
    this.transient = null
    this.docs.clear()
  }

  /** 清空单个文件的遮罩 */
  clearDoc(path: string): void {
    this.transient = null
    this.docs.delete(path)
  }

  hasStrokes(path: string, page: number): boolean {
    const l = this.docs.get(path)?.get(page)
    return !!l && l.length > 0
  }

  /**
   * 绘制一页遮罩（canvas 需已按设备像素设置宽高）。
   * @param scalePx 基础坐标 → 设备像素的倍数（uiScale × dpr）
   * @param hover 悬停临时擦除（不持久化），支持自定义形状
   */
  renderPage(
    ctx: CanvasRenderingContext2D,
    path: string,
    page: number,
    scalePx: number,
    hover?: HoverSpec | null
  ): void {
    const { width, height } = ctx.canvas
    ctx.clearRect(0, 0, width, height)
    ctx.fillStyle = 'rgba(18, 20, 26, 0.94)'
    ctx.fillRect(0, 0, width, height)

    ctx.save()
    ctx.globalCompositeOperation = 'destination-out'
    ctx.fillStyle = '#000'
    ctx.strokeStyle = '#000'

    const strokes = this.docs.get(path)?.get(page) ?? []
    // 拖动中的临时折线一并绘制，保证擦除过程有实时反馈
    const t = this.transient
    const all = t && t.path === path && t.page === page ? [...strokes, t.stroke] : strokes

    for (const s of all) {
      if (s.type === 'circle') {
        for (const p of s.points) {
          ctx.beginPath()
          ctx.arc(p.x * scalePx, p.y * scalePx, (s.radius ?? 70) * scalePx, 0, Math.PI * 2)
          ctx.fill()
        }
      } else {
        const r = (s.radius ?? ERASER_RADIUS) * scalePx
        const pts = s.points
        if (pts.length === 1) {
          ctx.beginPath()
          ctx.arc(pts[0].x * scalePx, pts[0].y * scalePx, r, 0, Math.PI * 2)
          ctx.fill()
        } else {
          ctx.lineCap = 'round'
          ctx.lineJoin = 'round'
          ctx.lineWidth = r * 2
          ctx.beginPath()
          ctx.moveTo(pts[0].x * scalePx, pts[0].y * scalePx)
          for (let i = 1; i < pts.length; i++) {
            ctx.lineTo(pts[i].x * scalePx, pts[i].y * scalePx)
          }
          ctx.stroke()
        }
      }
    }

    if (hover) {
      const size = HOVER_SHAPE_SIZE[hover.shape]
      ctx.beginPath()
      if (hover.shape === 'circle') {
        ctx.arc(hover.x * scalePx, hover.y * scalePx, size.r * scalePx, 0, Math.PI * 2)
      } else {
        const w = size.w * scalePx
        const h = size.h * scalePx
        const rr = Math.min(size.r * scalePx, w / 2, h / 2)
        ctx.roundRect(hover.x * scalePx - w / 2, hover.y * scalePx - h / 2, w, h, rr)
      }
      ctx.fill()
    }
    ctx.restore()
  }

  /** 序列化（masks.json）：空页不落盘 */
  toJSON(): DocMasks[] {
    const out: DocMasks[] = []
    for (const [path, pagesMap] of this.docs) {
      const pages: PageMask[] = []
      for (const [page, strokes] of pagesMap) {
        if (strokes.length > 0) pages.push({ page, strokes })
      }
      if (pages.length > 0) {
        out.push({ path, fileName: path.split(/[\\/]/).pop() ?? path, pages })
      }
    }
    return out
  }

  loadFrom(data: DocMasks[]): void {
    this.docs.clear()
    this.transient = null
    for (const doc of data) {
      const m = new Map<number, MaskStroke[]>()
      for (const p of doc.pages) m.set(p.page, [...p.strokes])
      this.docs.set(doc.path, m)
    }
  }
}
