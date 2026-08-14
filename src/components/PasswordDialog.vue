<script setup lang="ts">
import { ref } from 'vue'

const emit = defineEmits<{
  (e: 'submit', password: string): void
  (e: 'cancel'): void
}>()

const pwd = ref('')
</script>

<template>
  <div class="modal-mask">
    <div class="modal">
      <h3>该 PDF 已加密</h3>
      <p>请输入打开密码：</p>
      <input
        v-model="pwd"
        type="password"
        class="modal-input"
        placeholder="PDF 密码"
        autofocus
        @keyup.enter="emit('submit', pwd)"
      />
      <div class="modal-actions">
        <button class="btn" @click="emit('cancel')">取消</button>
        <button class="btn primary" @click="emit('submit', pwd)">确定</button>
      </div>
    </div>
  </div>
</template>
