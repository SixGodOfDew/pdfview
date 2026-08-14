import { computed, ref } from 'vue'
import { defineStore } from 'pinia'
import type { MasterSide } from '@/types'

/** 正常模式：窗口标题 / 工具栏品牌 */
const NORMAL_APP_TITLE = 'PDF双栏刷题阅读器'
const NORMAL_BRAND = 'PDF双栏刷题'

/** 伪装模式（老板键）：窗口标题 / 工具栏品牌 */
const BOSS_APP_TITLE = 'PDF对比器'
const BOSS_BRAND = 'PDF对比器'

/** 正常模式栏名 */
const NORMAL_SIDE_LABELS: Record<MasterSide, string> = { question: '题本', answer: '解析' }

/** 伪装模式栏名：伪装成「PDF对比器」的两份对比文档 */
const BOSS_SIDE_LABELS: Record<MasterSide, string> = { question: '文档A', answer: '文档B' }

/**
 * 老板键 / 伪装模式：一键把界面伪装成「PDF对比器」（窗口标题 + 两侧栏名）。
 * 仅本次运行内有效——不写入设置、不随同步中心跨机同步，重启后自动恢复正常。
 */
export const useBossModeStore = defineStore('bossMode', () => {
  const enabled = ref(false)

  /** 当前应用名（窗口标题 / 任务栏） */
  const appTitle = computed(() => (enabled.value ? BOSS_APP_TITLE : NORMAL_APP_TITLE))
  /** 工具栏品牌名 */
  const brand = computed(() => (enabled.value ? BOSS_BRAND : NORMAL_BRAND))
  /** 当前栏名（题本/解析 ↔ 文档A/文档B） */
  function sideLabel(side: MasterSide): string {
    return (enabled.value ? BOSS_SIDE_LABELS : NORMAL_SIDE_LABELS)[side]
  }

  function toggle(): void {
    enabled.value = !enabled.value
  }

  return { enabled, appTitle, brand, sideLabel, toggle }
})
