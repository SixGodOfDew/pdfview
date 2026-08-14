<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue'
import { useSettingsStore } from '@/stores/settings'
import {
  SHORTCUT_ACTIONS,
  SHORTCUT_LABELS,
  eventToBinding,
  fmtBinding,
  isValidBinding,
  type ShortcutAction
} from '@/core/shortcuts'

const emit = defineEmits<{ (e: 'close'): void }>()

const settings = useSettingsStore()

/** 正在捕获新键位的动作（null = 无捕获） */
const capturing = ref<ShortcutAction | null>(null)
const swapInfo = ref<string | null>(null)

function startCapture(a: ShortcutAction): void {
  capturing.value = a
  swapInfo.value = null
}

function onKeydown(e: KeyboardEvent): void {
  if (!capturing.value) return
  e.preventDefault()
  e.stopPropagation() // 阻止应用快捷键响应（捕获阶段先执行）
  if (e.key === 'Escape') {
    capturing.value = null
    swapInfo.value = null
    return
  }
  const binding = eventToBinding(e)
  if (!isValidBinding(binding)) return
  const action = capturing.value
  capturing.value = null
  const swapped = settings.setShortcut(action, binding)
  if (swapped) {
    swapInfo.value = `与「${SHORTCUT_LABELS[swapped as ShortcutAction]}」交换了键位`
    setTimeout(() => (swapInfo.value = null), 3000)
  }
}

onMounted(() => {
  // 捕获阶段监听：优先于 App 的快捷键处理
  window.addEventListener('keydown', onKeydown, true)
})
onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKeydown, true)
})
</script>

<template>
  <div class="modal-mask" @click.self="emit('close')">
    <div class="modal modal-help">
      <h3>帮助</h3>

      <section>
        <h4>快捷键（点击「改」自定义，Esc 取消）</h4>
        <table class="help-table">
          <tbody>
            <tr v-for="a in SHORTCUT_ACTIONS" :key="a">
              <td class="kbd-cell">
                <template v-if="capturing === a">
                  <span class="kbd capturing">按下新键…</span>
                </template>
                <template v-else>
                  <span class="kbd">{{ fmtBinding(settings.shortcuts[a]) }}</span>
                </template>
              </td>
              <td>{{ SHORTCUT_LABELS[a] }}</td>
              <td class="rebind-cell">
                <button
                  v-if="capturing !== a"
                  class="btn rebind-btn"
                  title="点击后按下新快捷键"
                  @click="startCapture(a)"
                >
                  改
                </button>
              </td>
            </tr>
          </tbody>
        </table>
        <p v-if="swapInfo" class="help-swap">{{ swapInfo }}</p>
        <p class="help-note">
          提示：<b>Ctrl + 滚轮</b> 缩放（固定）；文本框编辑时快捷键不生效；
          键位冲突时自动与占用者交换。
        </p>
        <div class="help-rebind-actions">
          <button class="btn" @click="settings.resetShortcuts()">恢复默认键位</button>
        </div>
      </section>

      <section>
        <h4>页面操作</h4>
        <ul class="help-list">
          <li><b>画笔</b>：按住拖动绘制，可选颜色与粗细；画错用撤回</li>
          <li><b>文字</b>：点击页面添加备注，双击编辑，拖动移动，悬停 × 删除</li>
          <li>
            <b>解析遮罩</b>：点击露出 / 悬停露出（可选圆形·方形·横条·竖条）/ 橡皮擦擦除；
            「显示/隐藏」一键显示或隐藏整页解析；操作遮罩时标注自动切回浏览
          </li>
          <li><b>同步</b>：「题本主 / 解析主」设定主窗口，滚动主窗口时另一侧按比例跟随</li>
          <li><b>书签</b>：「＋书签」记录双侧位置；点击书签自动打开对应的题本与解析并跳转</li>
          <li><b>分栏</b>：拖动中间分隔条调整宽度，双击均分；书签面板左缘可拖宽</li>
        </ul>
      </section>

      <section>
        <h4>数据</h4>
        <p class="help-note">
          书签、标注、设置保存在「文档\PDF刷题阅读器\data\」目录，均为 JSON 文件，
          可通过同步中心导出/导入实现双机同步。
        </p>
      </section>

      <div class="modal-actions">
        <button class="btn primary" @click="emit('close')">关闭</button>
      </div>
    </div>
  </div>
</template>
