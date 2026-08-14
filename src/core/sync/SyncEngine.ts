import type { MasterSide } from '@/types'

export interface SyncStrategy {
  readonly kind: 'ratio' | 'pageScale' | 'anchor'
  /** 源页浮点 → 目标页浮点 */
  map(pf: number): number
}

/** 比例同步（P0 默认）：页浮点等比例映射 */
export class RatioStrategy implements SyncStrategy {
  readonly kind = 'ratio' as const
  map(pf: number): number {
    return pf
  }
}

/**
 * 同步引擎：主侧滚动 → 计算目标页浮点 → 应用到从侧。
 * P0 实现比例同步 + 主从单向监听；pageScale / anchor 策略为 P1 预留。
 *
 * 说明：不引入 rAF/setTimeout 节流——浏览器的 scroll 事件本身就按渲染帧派发
 * （每帧最多一次），同步应用既即时又不会更频繁；主从单向监听天然防回环
 * （从侧滚动不触发同步）。
 */
export class SyncEngine {
  master: MasterSide = 'question'
  enabled = true
  private strategy: SyncStrategy = new RatioStrategy()

  /** 由 App 注册：把目标页浮点应用到从侧 viewer */
  applyToSlave: ((pf: number) => void) | null = null

  setStrategy(s: SyncStrategy): void {
    this.strategy = s
  }

  get strategyKind(): SyncStrategy['kind'] {
    return this.strategy.kind
  }

  /** 主侧滚动事件入口（同步执行） */
  onMasterScroll(pf: number): void {
    if (!this.enabled || !this.applyToSlave) return
    this.applyToSlave(this.strategy.map(pf))
  }
}

/** 应用级单例 */
export const syncEngine = new SyncEngine()
