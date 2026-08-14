<script setup lang="ts">
withDefaults(
  defineProps<{
    title: string
    message: string
    confirmText?: string
    cancelText?: string
    /** 仅提示（只有一个按钮） */
    single?: boolean
  }>(),
  { confirmText: '确定', cancelText: '取消', single: false }
)

const emit = defineEmits<{
  (e: 'confirm'): void
  (e: 'cancel'): void
}>()
</script>

<template>
  <div class="modal-mask">
    <div class="modal">
      <h3>{{ title }}</h3>
      <p>{{ message }}</p>
      <div class="modal-actions">
        <button v-if="!single" class="btn" @click="emit('cancel')">{{ cancelText }}</button>
        <button class="btn primary" @click="emit('confirm')">{{ confirmText }}</button>
      </div>
    </div>
  </div>
</template>
