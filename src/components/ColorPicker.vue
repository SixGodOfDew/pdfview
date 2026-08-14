<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue'

const props = withDefaults(
  defineProps<{
    modelValue: string
    title?: string
  }>(),
  { title: '' }
)

const emit = defineEmits<{ (e: 'update:modelValue', v: string): void }>()

/** 预设色板：标注常用色（含三风格的标志色） */
const PRESET_COLORS = [
  '#e3262e', // 红
  '#e8590c', // 橙
  '#f5a623', // 琥珀
  '#2fb344', // 绿
  '#12a5a5', // 青
  '#2f6fed', // 蓝
  '#7a5cf0', // 紫
  '#e055a5', // 粉
  '#a63a2a', // 朱砂
  '#8a5a1c', // 赭石
  '#111111', // 黑
  '#ffffff' // 白
]

const show = ref(false)
const btnEl = ref<HTMLElement | null>(null)
const rootEl = ref<HTMLElement | null>(null)
const pos = ref({ top: 0, left: 0 })

function toggle(): void {
  if (!show.value && btnEl.value) {
    const r = btnEl.value.getBoundingClientRect()
    const left = Math.min(r.left, window.innerWidth - 220)
    pos.value = { top: r.bottom + 6, left: Math.max(8, left) }
  }
  show.value = !show.value
}

function pick(c: string): void {
  emit('update:modelValue', c)
  show.value = false
}

function onDocDown(e: MouseEvent): void {
  if (show.value && rootEl.value && !rootEl.value.contains(e.target as Node)) {
    show.value = false
  }
}

function onResize(): void {
  show.value = false
}

onMounted(() => {
  document.addEventListener('mousedown', onDocDown)
  window.addEventListener('resize', onResize)
})
onBeforeUnmount(() => {
  document.removeEventListener('mousedown', onDocDown)
  window.removeEventListener('resize', onResize)
})
</script>

<template>
  <div ref="rootEl" class="cp">
    <button ref="btnEl" class="btn cp-trigger" :title="title || '画笔颜色'" @click.stop="toggle">
      <span class="cp-swatch" :style="{ background: modelValue }" />
      <span class="cp-caret" :class="{ open: show }">▾</span>
    </button>
    <div
      v-if="show"
      class="cp-menu"
      :style="{ top: pos.top + 'px', left: pos.left + 'px' }"
    >
      <div class="cp-grid">
        <button
          v-for="c in PRESET_COLORS"
          :key="c"
          class="cp-swatch-btn"
          :class="{ active: c.toLowerCase() === modelValue.toLowerCase() }"
          :style="{ background: c }"
          :title="c"
          @click="pick(c)"
        />
      </div>
      <label class="cp-custom">
        <span>自定义</span>
        <input
          type="color"
          :value="modelValue"
          title="打开系统取色器"
          @input="emit('update:modelValue', ($event.target as HTMLInputElement).value)"
        />
      </label>
    </div>
  </div>
</template>
