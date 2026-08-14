import type { HoverShape, MaskStroke } from '@/types'

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

/**
 * 解析遮罩管理。
 * 笔画坐标存「相对页面的基础坐标」（uiScale=1 时的 CSS px），缩放后位置依然正确；
 * 渲染时乘以 scalePx（= uiScale × devicePixelRatio）换算为画布设备像素。
 * 遮罩 = 半透明底 + destination-out 擦除。
 */
export class MaskManager {
  private pages = new Map<number, MaskStroke[]>()

  addStroke(page: number, stroke: MaskStroke): void {
    const list = this.pages.get(page)
    if (list) list.push(stroke)
    else this.pages.set(page, [stroke])
  }

  /** 点击模式：固定半径圆形擦除 */
  eraseCircle(page: number, x: number, y: number, radius = 70): void {
    this.addStroke(page, { type: 'circle', points: [{ x, y }], radius })
  }

  /** 橡皮擦：连续折线擦除（单点为圆） */
  erasePolyline(page: number, points: { x: number; y: number }[], radius = 18): void {
    if (points.length === 0) return
    this.addStroke(page, { type: 'polyline', points, radius })
  }

  clearPage(page: number): void {
    this.pages.delete(page)
  }

  clearAll(): void {
    this.pages.clear()
  }

  hasStrokes(page: number): boolean {
    const l = this.pages.get(page)
    return !!l && l.length > 0
  }

  /**
   * 绘制一页遮罩（canvas 需已按设备像素设置宽高）。
   * @param scalePx 基础坐标 → 设备像素的倍数（uiScale × dpr）
   * @param hover 悬停临时擦除（不持久化），支持自定义形状
   */
  renderPage(
    ctx: CanvasRenderingContext2D,
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

    for (const s of this.pages.get(page) ?? []) {
      if (s.type === 'circle') {
        for (const p of s.points) {
          ctx.beginPath()
          ctx.arc(p.x * scalePx, p.y * scalePx, (s.radius ?? 70) * scalePx, 0, Math.PI * 2)
          ctx.fill()
        }
      } else {
        const r = (s.radius ?? 18) * scalePx
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
}
