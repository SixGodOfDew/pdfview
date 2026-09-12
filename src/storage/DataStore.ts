/**
 * 业务数据 JSON 读写（渲染进程侧封装）。
 * 实际写入由主进程完成（原子写：先 *.tmp 再 rename），保证文件任何时刻完整，
 * 可安全地被网盘/手动拷贝用于跨机同步。
 *
 * 写入策略：按文件名串行化（重要）+ 可选去抖（高频场景）。
 * - 串行化：同一文件的多路写入排队执行，杜绝「两个写共用同一个 .tmp 文件」导致的
 *   rename 竞态（ENOENT / EPERM）与内容错乱；
 * - 去抖（writeJsonDebounced）：滚动上报进度、拖拽擦除遮罩这类高频场景，
 *   合并成一次落盘，避免每次 mousemove / scroll 都打磁盘 IO；
 * - 失败只记录日志、不抛未处理异常（调用方普遍是 `void persist()`）。
 */

/** 每个文件一条串行链，保证同一文件写入不交叉 */
const chains = new Map<string, Promise<void>>()

/** 去抖待写数据（同一文件后写覆盖先写） */
const pending = new Map<string, unknown>()
const timers = new Map<string, ReturnType<typeof setTimeout>>()

async function writeNow(name: string, data: unknown): Promise<void> {
  try {
    await window.api.writeData(name, JSON.stringify(data, null, 2))
  } catch (e) {
    console.error('[DataStore] 写入失败：', name, e)
  }
}

/** 把一次写入追加到该文件的串行链尾 */
function enqueue(name: string, task: () => Promise<void>): Promise<void> {
  const prev = chains.get(name) ?? Promise.resolve()
  const next = prev.then(task, task)
  chains.set(name, next)
  return next
}

export async function readJson<T>(name: string): Promise<T | null> {
  const raw = await window.api.readData(name)
  if (raw == null || raw === '') return null
  try {
    return JSON.parse(raw) as T
  } catch {
    return null
  }
}

/** 立即写入（仍在串行链中排队，不丢序） */
export function writeJson(name: string, data: unknown): Promise<void> {
  void flush(name) // 先落盘待写的去抖数据，避免被旧数据覆盖
  return enqueue(name, () => writeNow(name, data))
}

/** 去抖写入：delay 内的多次调用只会落盘最后一次 */
export function writeJsonDebounced(name: string, data: unknown, delay = 400): void {
  pending.set(name, data)
  const t = timers.get(name)
  if (t) clearTimeout(t)
  timers.set(
    name,
    setTimeout(() => {
      timers.delete(name)
      void flush(name)
    }, delay)
  )
}

/** 立刻落盘某文件待写的去抖数据（无待写则空操作） */
export function flush(name: string): Promise<void> {
  const t = timers.get(name)
  if (t) {
    clearTimeout(t)
    timers.delete(name)
  }
  if (!pending.has(name)) return chains.get(name) ?? Promise.resolve()
  const data = pending.get(name)
  pending.delete(name)
  return enqueue(name, () => writeNow(name, data))
}

/** 落盘全部待写数据（退出前调用，尽量不丢最后一段进度/遮罩） */
export function flushAll(): Promise<void> {
  const names = [...new Set([...pending.keys(), ...timers.keys()])]
  return Promise.all(names.map((n) => flush(n))).then(() => undefined)
}
