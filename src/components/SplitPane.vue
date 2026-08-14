<script setup lang="ts">
import { ref } from 'vue'

const leftPct = ref(50)
const dragging = ref(false)
const hostEl = ref<HTMLElement | null>(null)

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
  const pct = ((e.clientX - rect.left) / rect.width) * 100
  leftPct.value = Math.min(70, Math.max(30, pct))
}

function stopDrag(): void {
  dragging.value = false
  document.removeEventListener('mousemove', onDrag)
  document.removeEventListener('mouseup', stopDrag)
}

function reset(): void {
  leftPct.value = 50
}
</script>

<template>
  <div ref="hostEl" class="split-pane" :class="{ dragging }">
    <div class="pane" :style="{ width: leftPct + '%' }">
      <slot name="left" />
    </div>
    <div
      class="divider"
      title="拖动调整宽度，双击均分"
      @mousedown="startDrag"
      @dblclick="reset"
    />
    <div class="pane" :style="{ width: 100 - leftPct + '%' }">
      <slot name="right" />
    </div>
  </div>
</template>
