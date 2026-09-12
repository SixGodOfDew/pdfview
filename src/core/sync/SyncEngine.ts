import type { MasterSide, SyncAnchor, SyncMode } from '@/types'
import type { PageMapper } from './PageMapper'

/**
 * 一侧的同步几何：内容总高 + 视口高（均为 CSS px）。
 * 比例同步需要它来算「滚动高度百分比」——只拿页浮点是不够的，
 * 因为两侧页数 / 页高都不同。
 */
export interface SyncSide {
  mapper: PageMapper
  viewportHeight: number
}

/** 可滚动余量（内容总高 − 视口高），至少 1 避免除零 */
function scrollExtent(side: SyncSide): number {
  return Math.max(1, side.mapper.totalHeight - side.viewportHeight)
}

/**
 * 页浮点 → 滚动高度百分比（0~1）= scrollTop / (总高 − 视口高)。
 * 这是「比例同步」的统一中间量：两侧各按自身总高换算，天然兼容页数不同。
 */
export function scrollProgress(side: SyncSide, pf: number): number {
  const top = side.mapper.pageFloatToScrollTop(pf)
  return Math.min(1, Math.max(0, top / scrollExtent(side)))
}

/** 滚动高度百分比 → 页浮点（scrollProgress 的逆运算） */
export function progressToPageFloat(side: SyncSide, p: number): number {
  return side.mapper.scrollTopToPageFloat(p * scrollExtent(side))
}

export interface SyncStrategy {
  readonly kind: SyncMode
  /** 源侧页浮点 → 目标侧页浮点 */
  map(pf: number, src: SyncSide, dst: SyncSide): number
}

/**
 * 比例同步（默认）：在「滚动高度百分比」空间里恒等映射。
 *
 * 注意——这里**不能**对页浮点做恒等映射。页浮点恒等等于「按页码同步」，
 * 题本 186 页 / 解析 240 页时，滚到题本第 93 页解析也停在 93 页，
 * 而正确位置约在第 120 页，误差随进度线性累积。
 */
export class RatioStrategy implements SyncStrategy {
  readonly kind = 'ratio' as const
  map(pf: number, src: SyncSide, dst: SyncSide): number {
    return progressToPageFloat(dst, scrollProgress(src, pf))
  }
}

/** 倍率 + 起始偏移：目标页浮点 = 源页浮点 × ratio + offset */
export class PageScaleStrategy implements SyncStrategy {
  readonly kind = 'pageScale' as const
  ratio = 1
  offset = 0

  constructor(ratio = 1, offset = 0) {
    this.ratio = ratio
    this.offset = offset
  }

  map(pf: number): number {
    return pf * this.ratio + this.offset
  }

  /** 由两点（首尾页对齐）反推倍率与偏移 */
  static fromPoints(
    q1: number,
    a1: number,
    q2: number,
    a2: number
  ): { ratio: number; offset: number } {
    const dq = q2 - q1
    if (Math.abs(dq) < 1e-6) return { ratio: 1, offset: a1 - q1 }
    const ratio = (a2 - a1) / dq
    return { ratio, offset: a1 - q1 * ratio }
  }
}

/** addAnchor 的结果：新增 / 覆盖同位置的旧锚点 / 因破坏单调性被拒绝 */
export type AnchorAddStatus = 'added' | 'replaced' | 'rejected'

export interface AnchorAddResult {
  status: AnchorAddStatus
  /** 该锚点在升序表中的下标（rejected 时为 -1） */
  index: number
}

/**
 * 锚点校准：把「一键对齐」记录下的对应点连成分段线性映射。
 * - 0 个锚点：退化为比例同步（保证刚切到该模式时行为可预期）
 * - 1 个锚点：整体平移（把这一处对上的同时，其余按同一偏移跟随）
 * - ≥2 个锚点：区间内线性插值，两端按最近一段斜率外推
 *
 * 锚点按 qPage 升序维护，并要求 aPage 同步单调递增——否则会出现
 * 「题本往下滚、解析往上跑」的反向滚动，属于用户误对齐，直接拒绝。
 */
export class AnchorStrategy implements SyncStrategy {
  readonly kind = 'anchor' as const
  anchors: SyncAnchor[] = []

  /**
   * 记录一个锚点。
   * 同一位置（0.5 页内）会**覆盖**旧锚点——调用方必须据此如实反馈，
   * 否则用户在页内连按两次「对齐」会以为记了两个锚点（实际只有一个）。
   */
  add(qPage: number, aPage: number): AnchorAddResult {
    const backup = this.anchors.slice()
    const entry: SyncAnchor = { qPage, aPage }
    const i = this.anchors.findIndex((a) => Math.abs(a.qPage - qPage) < 0.5)
    if (i >= 0) this.anchors[i] = entry
    else this.anchors.push(entry)
    this.anchors.sort((x, y) => x.qPage - y.qPage)

    const monotonic = this.anchors.every((a, k, arr) => k === 0 || a.aPage > arr[k - 1].aPage)
    if (!monotonic) {
      this.anchors = backup
      return { status: 'rejected', index: -1 }
    }
    return { status: i >= 0 ? 'replaced' : 'added', index: this.anchors.indexOf(entry) }
  }

  clear(): void {
    this.anchors = []
  }

  map(pf: number, src: SyncSide, dst: SyncSide): number {
    const a = this.anchors
    if (a.length === 0) return progressToPageFloat(dst, scrollProgress(src, pf))
    if (a.length === 1) return pf + (a[0].aPage - a[0].qPage)

    // 找到 pf 所在区间：a[i].qPage ≤ pf < a[i+1].qPage
    let i = 0
    while (i < a.length - 1 && pf > a[i + 1].qPage) i++

    // 越过最后一个锚点：用最后一段的斜率外推
    if (i === a.length - 1) {
      const p = a[a.length - 2]
      const q = a[a.length - 1]
      const dq = q.qPage - p.qPage
      const slope = Math.abs(dq) < 1e-6 ? 1 : (q.aPage - p.aPage) / dq
      return q.aPage + (pf - q.qPage) * slope
    }

    const left = a[i]
    const right = a[i + 1]
    const dq = right.qPage - left.qPage
    if (Math.abs(dq) < 1e-6) return left.aPage
    // pf 在首锚点之前时 t < 0，即按首段斜率向前外推
    return left.aPage + ((pf - left.qPage) / dq) * (right.aPage - left.aPage)
  }
}

/**
 * 同步引擎：主侧滚动 → 计算目标页浮点 → 应用到从侧。
 *
 * 说明：不引入 rAF/setTimeout 节流——浏览器的 scroll 事件本身就按渲染帧派发
 * （每帧最多一次），同步应用既即时又不会更频繁；主从单向监听天然防回环
 * （从侧滚动不触发同步，不需要标志位）。
 */
export class SyncEngine {
  master: MasterSide = 'question'
  enabled = true

  /** 由 App 注册：读取指定侧的同步几何（PageMapper + 视口高） */
  getSide: ((side: MasterSide) => SyncSide | null) | null = null
  /** 由 App 注册：把目标页浮点应用到从侧 viewer */
  applyToSlave: ((pf: number) => void) | null = null

  private mode: SyncMode = 'ratio'
  private ratio = new RatioStrategy()
  private pageScale = new PageScaleStrategy()
  private anchor = new AnchorStrategy()

  setMode(mode: SyncMode): void {
    this.mode = mode
  }

  setPageScale(ratio: number, offset: number): void {
    this.pageScale.ratio = Number.isFinite(ratio) ? ratio : 1
    this.pageScale.offset = Number.isFinite(offset) ? offset : 0
  }

  /** 锚点表（升序）：供 UI 显示与清除 */
  get anchors(): readonly SyncAnchor[] {
    return this.anchor.anchors
  }

  /**
   * 一键对齐：把当前双侧页浮点记为锚点。
   * 返回结果需如实反馈给用户（同位置会覆盖旧锚点，不是新增）。
   */
  addAnchor(qPage: number, aPage: number): AnchorAddResult {
    return this.anchor.add(qPage, aPage)
  }

  clearAnchors(): void {
    this.anchor.clear()
  }

  /**
   * 用首尾锚点估算倍率/偏移（对应设计文档 6.2.1 ②）。
   * 锚点为会话级、倍率可持久化，所以这条路径让用户「先用锚点对齐几处，
   * 满意后锁定为倍率写进 settings.json」。
   * @returns 锚点不足 2 个时返回 null
   */
  estimatePageScale(): { ratio: number; offset: number } | null {
    const a = this.anchor.anchors
    if (a.length < 2) return null
    const first = a[0]
    const last = a[a.length - 1]
    return PageScaleStrategy.fromPoints(first.qPage, first.aPage, last.qPage, last.aPage)
  }

  get strategy(): SyncStrategy {
    switch (this.mode) {
      case 'pageScale':
        return this.pageScale
      case 'anchor':
        return this.anchor
      default:
        return this.ratio
    }
  }

  get strategyKind(): SyncMode {
    return this.mode
  }

  /** 主侧滚动事件入口（同步执行） */
  onMasterScroll(pf: number): void {
    if (!this.enabled || !this.applyToSlave || !this.getSide) return
    const slave: MasterSide = this.master === 'question' ? 'answer' : 'question'
    const src = this.getSide(this.master)
    const dst = this.getSide(slave)
    if (!src || !dst) return
    this.applyToSlave(this.strategy.map(pf, src, dst))
  }
}

/** 应用级单例 */
export const syncEngine = new SyncEngine()
