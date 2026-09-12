export type ThemeId = 'day' | 'night' | 'warm' | 'print'
export type MaskMode = 'off' | 'click' | 'hover' | 'eraser'
export type MasterSide = 'question' | 'answer'
export type BookmarkTag = '错题' | '重点' | '存疑'

/**
 * 视觉风格：
 * 结构派（靠线条/边框分割）
 *   ① swiss     瑞士国际主义：直角 · 粗黑结构线 · 黑白反转 · 硬阴影
 *   ② ink       中国水墨：大圆角 · 衬线宋体 · 细墨线 · 晕染阴影 · 朱砂点缀
 *   ③ brutal    新粗野主义：粗黑边 · 高饱和撞色 · 硬阴影按压 · 纯色块
 *   ④ editorial 杂志编排：衬线标题 · 无衬线正文 · 发丝细线 · 大留白 · 强调色小面积
 * 材质派（靠光影/透明度塑形）
 *   ⑤ glass     玻璃态：半透明面板 · 背景模糊 · 高光边 · 柔和多层投影
 *   ⑥ soft      柔光：无边框 · 双向柔和阴影 · 同色系塑形
 */
export type StyleId = 'swiss' | 'ink' | 'brutal' | 'editorial' | 'glass' | 'soft'

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

/**
 * 同步方式：
 * - ratio    比例同步（默认）：按「滚动高度百分比」映射，天然兼容解析比题本长
 * - pageScale 倍率 + 起始偏移：目标页浮点 = 源页浮点 × ratio + offset
 * - anchor   锚点校准：把若干「题本页 ↔ 解析页」对应点连成分段线性映射
 */
export type SyncMode = 'ratio' | 'pageScale' | 'anchor'

/** 锚点：一次「一键对齐」记录下的双侧页浮点对应关系 */
export interface SyncAnchor {
  /** 源侧（题本）页浮点 */
  qPage: number
  /** 目标侧（解析）页浮点 */
  aPage: number
}

/** 可同步的应用设置（存数据目录 settings.json） */
export interface SyncableSettings {
  theme: ThemeId
  style: StyleId
  zoomSync: boolean
  syncEnabled: boolean
  master: MasterSide
  hoverShape: HoverShape
  /** 同步方式 */
  syncMode?: SyncMode
  /** pageScale 模式倍率 */
  syncRatio?: number
  /** pageScale 模式起始偏移（页浮点） */
  syncOffset?: number
  /** 分栏比例（左侧宽度百分比，20~80），拖动后记忆 */
  splitPct?: number
  /** 快捷键绑定（动作 → 键位字符串），可自定义 */
  shortcuts?: Record<string, string>
}

export const THEME_IDS: ThemeId[] = ['day', 'night', 'warm', 'print']
/** 顺序即工具栏下拉的展示顺序：先结构派，后材质派 */
export const STYLE_IDS: StyleId[] = [
  'swiss',
  'ink',
  'brutal',
  'editorial',
  'glass',
  'soft'
]
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
  brutal: '新粗野',
  editorial: '杂志编排',
  glass: '玻璃态',
  soft: '柔光'
}
/** 风格一句话说明：用于 ⋮ 菜单/帮助里的风格说明，避免用户只能靠名字猜 */
export const STYLE_HINTS: Record<StyleId, string> = {
  swiss: '直角 · 粗黑结构线 · 黑白反转 · 硬阴影',
  ink: '大圆角 · 衬线宋体 · 细墨线 · 晕染阴影 · 朱砂点缀',
  brutal: '粗黑边 · 高饱和撞色 · 硬阴影按压 · 纯色块',
  editorial: '衬线标题 · 发丝细线 · 大留白 · 强调色小面积',
  glass: '半透明面板 · 背景模糊 · 高光边 · 柔和投影',
  soft: '无边框 · 双向柔和阴影 · 同色系塑形'
}
export const SYNC_MODES: SyncMode[] = ['ratio', 'pageScale', 'anchor']
export const SYNC_MODE_LABELS: Record<SyncMode, string> = {
  ratio: '比例同步',
  pageScale: '倍率 + 偏移',
  anchor: '锚点校准'
}
export const SYNC_MODE_HINTS: Record<SyncMode, string> = {
  ratio: '按滚动高度百分比映射：解析侧自动按自身总高换算，页数不同也不会累积错位',
  pageScale: '按「目标页 = 源页 × 倍率 + 偏移」映射：适合两侧有固定页码倍数关系的资料',
  anchor: '滚到对应位置后按「对齐」（Ctrl+Alt+A）记录锚点；锚点越多越准，适合题本与解析页码无规律对应'
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
