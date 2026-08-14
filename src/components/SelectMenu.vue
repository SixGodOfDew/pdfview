<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'

export interface SelectOption {
  value: string | number
  label: string
}

const props = withDefaults(
  defineProps<{
    modelValue: string | number
    options: SelectOption[]
    title?: string
    minWidth?: number
  }>(),
  { title: '', minWidth: 110 }
)

const emit = defineEmits<{ (e: 'update:modelValue', v: string | number): void }>()

const show = ref(false)
const btnEl = ref<HTMLElement | null>(null)
const rootEl = ref<HTMLElement | null>(null)
const pos = ref({ top: 0, left: 0 })

const currentLabel = computed(() => {
  const o = props.options.find((x) => x.value === props.modelValue)
  return o ? o.label : String(props.modelValue)
})

function toggle(): void {
  if (!show.value && btnEl.value) {
    const r = btnEl.value.getBoundingClientRect()
    // 左对齐，防止右侧溢出视口
    const left = Math.min(r.left, window.innerWidth - props.minWidth - 12)
    pos.value = { top: r.bottom + 6, left: Math.max(8, left) }
  }
  show.value = !show.value
}

function pick(o: SelectOption): void {
  emit('update:modelValue', o.value)
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
  <div ref="rootEl" class="sel">
    <button ref="btnEl" class="btn sel-trigger" :title="title" @click.stop="toggle">
      <span class="sel-label">{{ currentLabel }}</span>
      <span class="sel-caret" :class="{ open: show }">▾</span>
    </button>
    <div
      v-if="show"
      class="sel-menu"
      :style="{ top: pos.top + 'px', left: pos.left + 'px', minWidth: minWidth + 'px' }"
    >
      <button
        v-for="o in options"
        :key="String(o.value)"
        class="sel-opt"
        :class="{ active: o.value === modelValue }"
        @click="pick(o)"
      >
        {{ o.label }}
      </button>
    </div>
  </div>
</template>
