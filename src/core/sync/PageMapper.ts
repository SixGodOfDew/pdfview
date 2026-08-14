/**
 * 滚动像素 ↔ 页浮点坐标 双向换算。
 * 页浮点 = 0-based 页索引 + 页内比例（0~1），是同步引擎的统一中间坐标。
 */
export class PageMapper {
  private pageTops: number[] = []
  private pageHeights: number[] = []
  /** 页间距（CSS px） */
  readonly gap = 16

  rebuild(heights: number[]): void {
    this.pageHeights = heights
    const tops: number[] = new Array(heights.length)
    let acc = 0
    for (let i = 0; i < heights.length; i++) {
      tops[i] = acc
      acc += heights[i] + this.gap
    }
    this.pageTops = tops
  }

  get totalHeight(): number {
    const n = this.pageHeights.length
    return n === 0 ? 0 : this.pageTops[n - 1] + this.pageHeights[n - 1]
  }

  /** 第 i 页顶部在容器内的 y 偏移 */
  pageTop(i: number): number {
    return this.pageTops[i] ?? 0
  }

  pageHeight(i: number): number {
    return this.pageHeights[i] ?? 0
  }

  /** 滚动像素 → 页浮点 */
  scrollTopToPageFloat(scrollTop: number): number {
    const n = this.pageTops.length
    if (n === 0) return 0
    let lo = 0
    let hi = n - 1
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1
      if (this.pageTops[mid] <= scrollTop) lo = mid
      else hi = mid - 1
    }
    const top = this.pageTops[lo]
    const h = this.pageHeights[lo]
    const frac = h > 0 ? Math.min(1, Math.max(0, (scrollTop - top) / h)) : 0
    return lo + frac
  }

  /** 页浮点 → 滚动像素 */
  pageFloatToScrollTop(pf: number): number {
    const n = this.pageTops.length
    if (n === 0) return 0
    const i = Math.min(n - 1, Math.max(0, Math.floor(pf)))
    const frac = Math.min(1, Math.max(0, pf - i))
    return this.pageTops[i] + frac * this.pageHeights[i]
  }
}
