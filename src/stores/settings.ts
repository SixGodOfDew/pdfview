import { defineStore } from 'pinia'
import { ref } from 'vue'
import type {
  HoverShape,
  MasterSide,
  PaneLayout,
  StyleId,
  SyncableSettings,
  ThemeId
} from '@/types'
import { SPLIT_PCT_DEFAULT, SPLIT_PCT_MAX, SPLIT_PCT_MIN } from '@/types'
import { readJson, writeJson } from '@/storage/DataStore'
import {
  SHORTCUT_DEFAULTS,
  isValidBinding,
  type ShortcutAction
} from '@/core/shortcuts'

const DEFAULTS: SyncableSettings = {
  theme: 'day',
  style: 'brutal',
  zoomSync: true,
  syncEnabled: true,
  master: 'question',
  hoverShape: 'circle',
  splitPct: SPLIT_PCT_DEFAULT
}

/** 可同步设置：存数据目录 settings.json（随同步中心跨机同步） */
export const useSettingsStore = defineStore('settings', () => {
  const theme = ref<ThemeId>(DEFAULTS.theme)
  const style = ref<StyleId>(DEFAULTS.style)
  const zoomSync = ref(DEFAULTS.zoomSync)
  const syncEnabled = ref(DEFAULTS.syncEnabled)
  const master = ref<MasterSide>(DEFAULTS.master)
  const hoverShape = ref<HoverShape>(DEFAULTS.hoverShape)
  /** 分栏比例（左侧宽度百分比），拖动后记忆 */
  const splitPct = ref(SPLIT_PCT_DEFAULT)
  /** 专注模式布局：会话内状态，不落盘（避免下次启动只剩一栏让人以为坏了） */
  const paneLayout = ref<PaneLayout>('both')
  /** 快捷键绑定（可自定义，可跨机同步） */
  const shortcuts = ref<Record<ShortcutAction, string>>({ ...SHORTCUT_DEFAULTS })
  const loaded = ref(false)

  async function load(): Promise<void> {
    const data = await readJson<Partial<SyncableSettings>>('settings.json')
    theme.value = data?.theme ?? DEFAULTS.theme
    style.value = data?.style ?? DEFAULTS.style
    zoomSync.value = data?.zoomSync ?? DEFAULTS.zoomSync
    syncEnabled.value = data?.syncEnabled ?? DEFAULTS.syncEnabled
    master.value = data?.master ?? DEFAULTS.master
    hoverShape.value = data?.hoverShape ?? DEFAULTS.hoverShape
    splitPct.value = clampSplitPct(data?.splitPct ?? SPLIT_PCT_DEFAULT)
    // 逐键合并：新增动作/缺失键位回退默认
    shortcuts.value = { ...SHORTCUT_DEFAULTS, ...(data?.shortcuts ?? {}) }
    loaded.value = true
  }

  async function persist(): Promise<void> {
    const data: SyncableSettings = {
      theme: theme.value,
      style: style.value,
      zoomSync: zoomSync.value,
      syncEnabled: syncEnabled.value,
      master: master.value,
      hoverShape: hoverShape.value,
      splitPct: splitPct.value,
      shortcuts: shortcuts.value
    }
    await writeJson('settings.json', data)
  }

  function clampSplitPct(p: number): number {
    if (!Number.isFinite(p)) return SPLIT_PCT_DEFAULT
    return Math.min(SPLIT_PCT_MAX, Math.max(SPLIT_PCT_MIN, p))
  }

  /** 设置分栏比例（limit 内），persist 由调用方在拖动结束时触发一次 */
  function setSplitPct(p: number): void {
    splitPct.value = clampSplitPct(p)
  }

  function saveSplitPct(): void {
    void persist()
  }

  function setPaneLayout(l: PaneLayout): void {
    paneLayout.value = l
  }

  /** 专注模式循环：双栏 → 仅题本 → 仅解析 → 双栏 */
  function cyclePaneLayout(): PaneLayout {
    const order: PaneLayout[] = ['both', 'question', 'answer']
    const next = order[(order.indexOf(paneLayout.value) + 1) % order.length]
    paneLayout.value = next
    return next
  }

  function setTheme(t: ThemeId): void {
    theme.value = t
    void persist()
  }

  function setStyle(s: StyleId): void {
    style.value = s
    void persist()
  }

  function toggleZoomSync(): void {
    zoomSync.value = !zoomSync.value
    void persist()
  }

  function toggleSync(): void {
    syncEnabled.value = !syncEnabled.value
    void persist()
  }

  function setMaster(m: MasterSide): void {
    master.value = m
    void persist()
  }

  function setHoverShape(s: HoverShape): void {
    hoverShape.value = s
    void persist()
  }

  /**
   * 重绑定快捷键：若新键位已被其他动作占用，则两者交换（常见桌面应用行为）。
   * @returns 被交换的动作名（无冲突时返回 null）；非法绑定返回 undefined 表示未生效
   */
  function setShortcut(action: ShortcutAction, binding: string): string | null | undefined {
    if (!isValidBinding(binding)) return undefined
    const other = (Object.entries(shortcuts.value) as [ShortcutAction, string][]).find(
      ([a, b]) => a !== action && b === binding
    )
    if (other) {
      const old = shortcuts.value[action]
      shortcuts.value[action] = binding
      shortcuts.value[other[0]] = old
      void persist()
      return other[0]
    }
    shortcuts.value[action] = binding
    void persist()
    return null
  }

  function resetShortcuts(): void {
    shortcuts.value = { ...SHORTCUT_DEFAULTS }
    void persist()
  }

  return {
    theme,
    style,
    zoomSync,
    syncEnabled,
    master,
    hoverShape,
    splitPct,
    paneLayout,
    shortcuts,
    loaded,
    load,
    setSplitPct,
    saveSplitPct,
    setPaneLayout,
    cyclePaneLayout,
    setTheme,
    setStyle,
    toggleZoomSync,
    toggleSync,
    setMaster,
    setHoverShape,
    setShortcut,
    resetShortcuts
  }
})
