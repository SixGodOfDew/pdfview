<script setup lang="ts">
import { computed, onBeforeUnmount, ref } from 'vue'
import { useSettingsStore } from '@/stores/settings'

const settings = useSettingsStore()

const dragging = ref(false)
const hostEl = ref<HTMLElement | null>(null)

/** 专注模式：both 双栏 / question 仅题本 / answer 仅解析 */
const layout = computed(() => settings.paneLayout)
/** 分栏比例持久化在 settings（拖动结束时落盘一次） */
const leftPct = computed(() => settings.splitPct)

function startDrag(e: MouseEvent): void {
  dragging.value = true
  e.preventDefault()
  document.addEventListener('mousemove', onDrag)
  document.addEventListener('mouseup', stopDrag)
}

function onDrag(e: MouseEvent): void {
  const host = hostEl.value
  if (!host) return
  const rect = host.getBoundingClientRect()
  if (rect.width === 0) return
  settings.setSplitPct(((e.clientX - rect.left) / rect.width) * 100)
}

function stopDrag(): void {
  if (!dragging.value) return
  dragging.value = false
  document.removeEventListener('mousemove', onDrag)
  document.removeEventListener('mouseup', stopDrag)
  settings.saveSplitPct()
}

function reset(): void {
  settings.setSplitPct(50)
  settings.saveSplitPct()
}

onBeforeUnmount(() => {
  document.removeEventListener('mousemove', onDrag)
  document.removeEventListener('mouseup', stopDrag)
})
</script>

<template>
  <div ref="hostEl" class="split-pane" :class="{ dragging, focused: layout !== 'both' }">
    <div
      v-show="layout !== 'answer'"
      class="pane"
      :style="{ width: layout === 'question' ? '100%' : leftPct + '%' }"
    >
      <slot name="left" />
    </div>
    <div
      v-show="layout === 'both'"
      class="divider"
      title="拖动调整宽度，双击均分"
      @mousedown="startDrag"
      @dblclick="reset"
    />
    <div
      v-show="layout !== 'question'"
      class="pane"
      :style="{ width: layout === 'answer' ? '100%' : 100 - leftPct + '%' }"
    >
      <slot name="right" />
    </div>
  </div>
</template>
