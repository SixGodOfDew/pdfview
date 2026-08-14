/**
 * 业务数据 JSON 读写（渲染进程侧封装）。
 * 实际写入由主进程完成（原子写：先 *.tmp 再 rename），保证文件任何时刻完整，
 * 可安全地被网盘/手动拷贝用于跨机同步。
 */
export async function readJson<T>(name: string): Promise<T | null> {
  const raw = await window.api.readData(name)
  if (raw == null || raw === '') return null
  try {
    return JSON.parse(raw) as T
  } catch {
    return null
  }
}

export async function writeJson(name: string, data: unknown): Promise<void> {
  await window.api.writeData(name, JSON.stringify(data, null, 2))
}
