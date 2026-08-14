/** 快捷键系统：动作定义、默认绑定、按键解析与显示格式化 */

export type ShortcutAction =
  | 'undo'
  | 'help'
  | 'openQuestion'
  | 'openAnswer'
  | 'toolPen'
  | 'toolText'
  | 'toolBrowse'
  | 'maskCycle'
  | 'maskToggle'
  | 'addBookmark'
  | 'toggleBookmarks'
  | 'syncToggle'

export const SHORTCUT_DEFAULTS: Record<ShortcutAction, string> = {
  undo: 'ctrl+z',
  help: 'f1',
  openQuestion: 'ctrl+o',
  openAnswer: 'ctrl+shift+o',
  toolPen: 'p',
  toolText: 't',
  toolBrowse: 'v',
  maskCycle: 'm',
  maskToggle: 'h',
  addBookmark: 'd',
  toggleBookmarks: 'k',
  syncToggle: 's'
}

export const SHORTCUT_LABELS: Record<ShortcutAction, string> = {
  undo: '撤回标注',
  help: '打开帮助',
  openQuestion: '打开题本',
  openAnswer: '打开解析',
  toolPen: '画笔工具',
  toolText: '文字工具',
  toolBrowse: '浏览工具',
  maskCycle: '切换遮罩模式',
  maskToggle: '显示/隐藏解析',
  addBookmark: '添加书签',
  toggleBookmarks: '书签面板',
  syncToggle: '开关同步'
}

export const SHORTCUT_ACTIONS = Object.keys(SHORTCUT_LABELS) as ShortcutAction[]

/** 键盘事件 → 绑定字符串（如 'ctrl+shift+k'） */
export function eventToBinding(e: KeyboardEvent): string {
  const parts: string[] = []
  if (e.ctrlKey) parts.push('ctrl')
  if (e.metaKey) parts.push('meta')
  if (e.altKey) parts.push('alt')
  if (e.shiftKey) parts.push('shift')
  const key = e.key.toLowerCase()
  if (key === 'control' || key === 'shift' || key === 'alt' || key === 'meta') return ''
  parts.push(key)
  return parts.join('+')
}

/** 绑定字符串 → 显示文本（如 'ctrl+z' → 'Ctrl + Z'） */
export function fmtBinding(b: string): string {
  return b
    .split('+')
    .map((p) => {
      switch (p) {
        case 'ctrl':
          return 'Ctrl'
        case 'shift':
          return 'Shift'
        case 'alt':
          return 'Alt'
        case 'meta':
          return 'Win'
        default:
          return p.toUpperCase()
      }
    })
    .join(' + ')
}

/** 绑定是否合法（非空、非纯修饰键） */
export function isValidBinding(b: string): boolean {
  return b !== '' && !['ctrl', 'shift', 'alt', 'meta'].includes(b)
}
