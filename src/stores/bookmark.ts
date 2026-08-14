import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import type { Bookmark, BookmarkTag } from '@/types'
import { readJson, writeJson } from '@/storage/DataStore'

export type BookmarkFilter = '全部' | BookmarkTag

/** 书签：存数据目录 bookmarks.json（原子写 + 可跨机同步合并） */
export const useBookmarkStore = defineStore('bookmark', () => {
  const bookmarks = ref<Bookmark[]>([])
  const filter = ref<BookmarkFilter>('全部')
  const loaded = ref(false)

  async function load(): Promise<void> {
    const data = await readJson<Bookmark[]>('bookmarks.json')
    // 兼容旧格式：丢弃缺少文件关联字段的记录（只有页数的书签无意义）
    bookmarks.value = (data ?? []).filter((b) => !!b.questionPath && !!b.answerPath)
    loaded.value = true
  }

  async function persist(): Promise<void> {
    await writeJson('bookmarks.json', bookmarks.value)
  }

  function add(b: Bookmark): void {
    bookmarks.value.unshift(b)
    void persist()
  }

  function remove(id: string): void {
    bookmarks.value = bookmarks.value.filter((x) => x.id !== id)
    void persist()
  }

  function setTag(id: string, tag?: BookmarkTag): void {
    const b = bookmarks.value.find((x) => x.id === id)
    if (b) {
      b.tag = tag
      b.updatedAt = Date.now()
      void persist()
    }
  }

  const filtered = computed(() =>
    filter.value === '全部'
      ? bookmarks.value
      : bookmarks.value.filter((b) => b.tag === filter.value)
  )

  return { bookmarks, filter, loaded, load, add, remove, setTag, filtered }
})
