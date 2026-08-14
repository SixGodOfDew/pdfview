import { defineStore } from 'pinia'
import { ref } from 'vue'
import type { HoverShape, MasterSide, StyleId, SyncableSettings, ThemeId } from '@/types'
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
  hoverShape: 'circle'
}

/** 可同步设置：存数据目录 settings.json（随同步中心跨机同步） */
export const useSettingsStore = defineStore('settings', () => {
  const theme = ref<ThemeId>(DEFAULTS.theme)
  const style = ref<StyleId>(DEFAULTS.style)
  const zoomSync = ref(DEFAULTS.zoomSync)
  const syncEnabled = ref(DEFAULTS.syncEnabled)
  const master = ref<MasterSide>(DEFAULTS.master)
  const hoverShape = ref<HoverShape>(DEFAULTS.hoverShape)
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
      shortcuts: shortcuts.value
    }
    await writeJson('settings.json', data)
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
    shortcuts,
    loaded,
    load,
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
