export type ThemeId = 'day' | 'night' | 'warm' | 'print'
export type MaskMode = 'off' | 'click' | 'hover' | 'eraser'
export type MasterSide = 'question' | 'answer'
export type BookmarkTag = '错题' | '重点' | '存疑'

/** 视觉风格：瑞士国际主义 / 中国水墨 / 新粗野主义 */
export type StyleId = 'swiss' | 'ink' | 'brutal'

/** 当前激活工具：浏览（遮罩交互/滚动）/ 画笔 / 文字 */
export type ToolId = 'browse' | 'pen' | 'text'

/** 专注模式下的分栏布局：双栏 / 仅题本 / 仅解析 */
export type PaneLayout = 'both' | 'question' | 'answer'

/** 悬停遮罩形状 */
export type HoverShape = 'circle' | 'square' | 'wide' | 'tall'

/** 遮罩擦除笔画（坐标：相对页面的基础坐标，uiScale=1 时的 CSS px） */
export interface MaskStroke {
  type: 'circle' | 'polyline'
  points: { x: number; y: number }[]
  radius?: number
}

/** 单页遮罩擦除记录 */
export interface PageMask {
  page: number
  strokes: MaskStroke[]
}

/** 单个文件的全部遮罩擦除记录（masks.json 持久化格式） */
export interface DocMasks {
  path: string
  fileName: string
  pages: PageMask[]
}

/** 单文件的阅读进度（progress.json 持久化格式） */
export interface ReadingProgress {
  path: string
  fileName: string
  /** 0-based 页浮点：恢复滚动位置的依据 */
  pageFloat: number
  updatedAt: number
}

/** 画笔笔迹（坐标：相对页面的基础坐标，缩放无关） */
export interface InkStroke {
  id: string
  color: string
  /** 基础坐标线宽（scale=1 CSS px） */
  width: number
  points: { x: number; y: number }[]
}

/** 文本框标注 */
export interface TextBox {
  id: string
  /** 左上角基础坐标 */
  x: number
  y: number
  text: string
  color: string
  /** 基础字号（scale=1 CSS px） */
  fontSize: number
  updatedAt: number
}

/** 单页标注 */
export interface PageAnnotations {
  page: number
  strokes: InkStroke[]
  boxes: TextBox[]
}

/** 单个文件的全部标注（annotations.json 持久化格式） */
export interface DocAnnotations {
  path: string
  fileName: string
  pages: PageAnnotations[]
}

export interface Bookmark {
  id: string
  /** 关联文件：题本（跨机路径失效时用文件名重定位） */
  questionPath: string
  questionName: string
  /** 关联文件：解析 */
  answerPath: string
  answerName: string
  /** 0-based 页浮点：题本位置 */
  questionPage: number
  /** 0-based 页浮点：解析位置 */
  answerPage: number
  tag?: BookmarkTag
  note?: string
  createdAt: number
  updatedAt: number
}

/** 可同步的应用设置（存数据目录 settings.json） */
export interface SyncableSettings {
  theme: ThemeId
  style: StyleId
  zoomSync: boolean
  syncEnabled: boolean
  master: MasterSide
  hoverShape: HoverShape
  /** 分栏比例（左侧宽度百分比，20~80），拖动后记忆 */
  splitPct?: number
  /** 快捷键绑定（动作 → 键位字符串），可自定义 */
  shortcuts?: Record<string, string>
}

export const THEME_IDS: ThemeId[] = ['day', 'night', 'warm', 'print']
export const STYLE_IDS: StyleId[] = ['swiss', 'ink', 'brutal']
export const SPLIT_PCT_MIN = 20
export const SPLIT_PCT_MAX = 80
export const SPLIT_PCT_DEFAULT = 50
export const PANE_LAYOUTS: PaneLayout[] = ['both', 'question', 'answer']
export const PANE_LAYOUT_LABELS: Record<PaneLayout, string> = {
  both: '双栏',
  question: '仅题本',
  answer: '仅解析'
}
export const STYLE_LABELS: Record<StyleId, string> = {
  swiss: '瑞士国际',
  ink: '中国水墨',
  brutal: '新粗野'
}
export const MASK_MODES: MaskMode[] = ['off', 'click', 'hover', 'eraser']
export const BOOKMARK_TAGS: BookmarkTag[] = ['错题', '重点', '存疑']
export const HOVER_SHAPES: HoverShape[] = ['circle', 'square', 'wide', 'tall']
export const HOVER_SHAPE_LABELS: Record<HoverShape, string> = {
  circle: '圆形',
  square: '方形',
  wide: '横条',
  tall: '竖条'
}
