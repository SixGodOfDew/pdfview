import { defineStore } from 'pinia'
import { ref } from 'vue'
import { readJson, writeJson, writeJsonDebounced } from '@/storage/DataStore'
import type { ReadingProgress } from '@/types'

const PROGRESS_FILE = 'progress.json'
/** 最多保留多少本文件的进度（按时间淘汰） */
const MAX_ENTRIES = 500
/** 滚动上报的聚合窗口：窗口内只更新内存，落盘合并为一次 */
const SAVE_DEBOUNCE = 600

/**
 * 阅读进度记忆：按文件路径记最后一次的页浮点位置，下次打开自动恢复。
 * 滚动会高频调用 set()，因此这里只更新内存并聚合落盘（避免每次 scroll 都序列化）。
 */
export const useProgressStore = defineStore('progress', () => {
  let map: Record<string, ReadingProgress> = {}
  const loaded = ref(false)
  let timer: ReturnType<typeof setTimeout> | null = null

  async function load(): Promise<void> {
    const data = await readJson<ReadingProgress[]>(PROGRESS_FILE)
    if (data) {
      map = {}
      for (const p of data) map[p.path] = p
    }
    loaded.value = true
  }

  function serialize(): ReadingProgress[] {
    const all = Object.values(map)
    if (all.length <= MAX_ENTRIES) return all
    // 超出上限时按更新时间淘汰最旧的一批
    return all.sort((a, b) => b.updatedAt - a.updatedAt).slice(0, MAX_ENTRIES)
  }

  /** 把当前内存状态刷到磁盘（退出前调用，避免丢最后一段进度） */
  function persistNow(): void {
    if (timer) {
      clearTimeout(timer)
      timer = null
    }
    void writeJson(PROGRESS_FILE, serialize())
  }

  function scheduleSave(): void {
    if (timer) return
    timer = setTimeout(() => {
      timer = null
      writeJsonDebounced(PROGRESS_FILE, serialize())
    }, SAVE_DEBOUNCE)
  }

  /** 读取某文件的记录位置（无记录返回 0） */
  function get(path: string | null | undefined): number {
    if (!path) return 0
    return map[path]?.pageFloat ?? 0
  }

  /** 是否有该文件的进度记录 */
  function has(path: string | null | undefined): boolean {
    return !!path && map[path] != null
  }

  /** 记录某文件当前页浮点（高频，内部聚合落盘） */
  function set(path: string | null | undefined, pageFloat: number, name?: string | null): void {
    if (!path || !Number.isFinite(pageFloat)) return
    map[path] = {
      path,
      fileName: name ?? path.split(/[\\/]/).pop() ?? path,
      pageFloat,
      updatedAt: Date.now()
    }
    scheduleSave()
  }

  return { loaded, load, get, has, set, persistNow, serialize }
})
