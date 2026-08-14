<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue'
import { useSettingsStore } from '@/stores/settings'
import { useViewerStore } from '@/stores/viewer'
import { useMaskStore } from '@/stores/mask'
import { useAnnotationStore } from '@/stores/annotation'
import SelectMenu from '@/components/SelectMenu.vue'
import ColorPicker from '@/components/ColorPicker.vue'
import {
  HOVER_SHAPES,
  HOVER_SHAPE_LABELS,
  MASK_MODES,
  STYLE_IDS,
  STYLE_LABELS,
  THEME_IDS
} from '@/types'
import type { HoverShape, MaskMode, MasterSide, StyleId, ThemeId, ToolId } from '@/types'

const emit = defineEmits<{
  (e: 'open', side: MasterSide): void
  (e: 'toggle-bookmarks'): void
  (e: 'add-bookmark'): void
  (e: 'toggle-help'): void
}>()

const settings = useSettingsStore()
const viewer = useViewerStore()
const mask = useMaskStore()
const annotation = useAnnotationStore()

const themeLabels: Record<ThemeId, string> = {
  day: '日间',
  night: '夜间',
  warm: '米黄',
  print: '印刷'
}
const maskLabels: Record<MaskMode, string> = {
  off: '遮罩关',
  click: '点击',
  hover: '悬停',
  eraser: '橡皮擦'
}
const toolLabels: Record<ToolId, string> = {
  browse: '浏览',
  pen: '画笔',
  text: '文字'
}
const TOOLS: ToolId[] = ['browse', 'pen', 'text']

function zoom(delta: number): void {
  const side = settings.master
  viewer.requestScale(side, viewer.summary(side).scale + delta)
}

function onPenWidthChange(v: string | number): void {
  annotation.setPenWidth(Number(v))
}

function onHoverShapeChange(v: string | number): void {
  settings.setHoverShape(v as HoverShape)
}

function onStyleChange(v: string | number): void {
  settings.setStyle(v as StyleId)
}

function onThemeChange(v: string | number): void {
  settings.setTheme(v as ThemeId)
}

// —— 「⋮」更多菜单（fixed 定位，避免被工具栏横向滚动裁剪） ——
const showMore = ref(false)
const moreBtn = ref<HTMLElement | null>(null)
const morePos = ref({ top: 0, right: 0 })
const moreRoot = ref<HTMLElement | null>(null)

function toggleMore(): void {
  if (!showMore.value && moreBtn.value) {
    const r = moreBtn.value.getBoundingClientRect()
    morePos.value = { top: r.bottom + 10, right: Math.max(8, window.innerWidth - r.right) }
  }
  showMore.value = !showMore.value
}

function closeMore(): void {
  showMore.value = false
}

function onDocClick(e: MouseEvent): void {
  if (showMore.value && moreRoot.value && !moreRoot.value.contains(e.target as Node)) {
    closeMore()
  }
}

function onResize(): void {
  closeMore()
}

onMounted(() => {
  document.addEventListener('mousedown', onDocClick)
  window.addEventListener('resize', onResize)
})
onBeforeUnmount(() => {
  document.removeEventListener('mousedown', onDocClick)
  window.removeEventListener('resize', onResize)
})
</script>

<template>
  <header class="toolbar" @scroll="closeMore">
    <div class="tb-group">
      <span class="tb-title">PDF双栏刷题</span>
      <button class="btn primary" @click="emit('open', 'question')">打开题本</button>
      <button class="btn primary" @click="emit('open', 'answer')">打开解析</button>
    </div>

    <div class="tb-group">
      <span class="tb-label">同步</span>
      <button
        class="btn"
        :class="{ active: settings.syncEnabled }"
        :title="'比例同步（' + (settings.syncEnabled ? '开' : '关') + '）'"
        @click="settings.toggleSync()"
      >
        同步
      </button>
      <button
        class="btn"
        :class="{ active: settings.master === 'question' }"
        title="只有题本滚动时解析才跟随"
        @click="settings.setMaster('question')"
      >
        题本主
      </button>
      <button
        class="btn"
        :class="{ active: settings.master === 'answer' }"
        title="只有解析滚动时题本才跟随"
        @click="settings.setMaster('answer')"
      >
        解析主
      </button>
    </div>

    <div class="tb-group">
      <button class="btn" title="缩小（Ctrl+滚轮）" @click="zoom(-0.1)">−</button>
      <span class="tb-scale">{{ Math.round(viewer.summary(settings.master).scale * 100) }}%</span>
      <button class="btn" title="放大（Ctrl+滚轮）" @click="zoom(0.1)">＋</button>
      <button
        class="btn"
        :class="{ active: settings.zoomSync }"
        title="缩放时双侧同步（可关闭独立缩放）"
        @click="settings.toggleZoomSync()"
      >
        联动
      </button>
    </div>

    <div class="tb-group">
      <span class="tb-label">标注</span>
      <button
        v-for="t in TOOLS"
        :key="t"
        class="btn"
        :class="{ active: annotation.activeTool === t }"
        :title="t === 'browse' ? '浏览模式：滚动与遮罩交互' : t === 'pen' ? '画笔：在 PDF 上自由绘制' : '文字：点击页面添加备注框'"
        @click="annotation.setTool(t)"
      >
        {{ toolLabels[t] }}
      </button>
      <button
        class="btn"
        title="撤回上一步标注操作（Ctrl+Z）"
        :disabled="annotation.history.length === 0"
        @click="annotation.undo()"
      >
        撤回
      </button>
      <template v-if="annotation.activeTool === 'pen'">
        <ColorPicker
          :model-value="annotation.penColor"
          title="画笔颜色"
          @update:model-value="annotation.setPenColor($event)"
        />
        <SelectMenu
          :model-value="annotation.penWidth"
          :options="[
            { value: 2, label: '细' },
            { value: 4, label: '中' },
            { value: 7, label: '粗' }
          ]"
          title="画笔粗细"
          :min-width="76"
          @update:model-value="onPenWidthChange"
        />
      </template>
    </div>

    <div class="tb-group mask-accent">
      <span class="tb-label">遮罩</span>
      <button
        v-for="m in MASK_MODES"
        :key="m"
        class="btn"
        :class="{ active: mask.mode === m }"
        @click="mask.setMode(m)"
      >
        {{ maskLabels[m] }}
      </button>
      <SelectMenu
        v-if="mask.mode === 'hover'"
        :model-value="settings.hoverShape"
        :options="HOVER_SHAPES.map((s) => ({ value: s, label: HOVER_SHAPE_LABELS[s] }))"
        title="悬停露出形状"
        :min-width="84"
        @update:model-value="onHoverShapeChange"
      />
      <button
        class="btn"
        :class="{ active: mask.enabled }"
        title="一键显示/隐藏整页解析"
        @click="mask.toggleEnabled()"
      >
        {{ mask.enabled ? '显' : '隐' }}
      </button>
      <button class="btn" title="恢复全部遮罩" @click="mask.clearAll()">重置</button>
    </div>

    <div class="tb-group">
      <button class="btn" title="记录双侧当前位置" @click="emit('add-bookmark')">＋书签</button>
      <button class="btn" @click="emit('toggle-bookmarks')">书签</button>
      <div ref="moreRoot" class="tb-more">
        <button
          ref="moreBtn"
          class="btn"
          :class="{ active: showMore }"
          title="更多：风格 / 主题 / 帮助"
          @click.stop="toggleMore"
        >
          ⋮
        </button>
        <div
          v-if="showMore"
          class="more-menu"
          :style="{ top: morePos.top + 'px', right: morePos.right + 'px' }"
        >
          <div class="more-section">
            <div class="more-title">风格</div>
            <SelectMenu
              :model-value="settings.style"
              :options="STYLE_IDS.map((s) => ({ value: s, label: STYLE_LABELS[s] }))"
              title="界面风格"
              :min-width="130"
              @update:model-value="onStyleChange"
            />
          </div>
          <div class="more-section">
            <div class="more-title">主题</div>
            <SelectMenu
              :model-value="settings.theme"
              :options="THEME_IDS.map((t) => ({ value: t, label: themeLabels[t] }))"
              title="主题"
              :min-width="130"
              @update:model-value="onThemeChange"
            />
          </div>
          <div class="more-section more-actions">
            <button class="btn" @click="emit('toggle-help')">帮助（F1）</button>
          </div>
        </div>
      </div>
    </div>
  </header>
</template>
