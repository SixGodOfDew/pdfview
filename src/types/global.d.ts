export {}

declare global {
  interface Window {
    api: {
      /** 设置窗口标题（老板键伪装模式切换程序名） */
      setWindowTitle(title: string): Promise<void>
      /** 打开 PDF 文件对话框，返回路径或 null */
      openPdfDialog(): Promise<string | null>
      /** 读取 PDF 文件内容 */
      readPdf(path: string): Promise<Uint8Array>
      fileStat(path: string): Promise<{ size: number; mtime: number }>

      // —— 本机偏好 ——
      getConfig(): Promise<Record<string, unknown>>
      setConfig(patch: Record<string, unknown>): Promise<Record<string, unknown>>

      // —— 数据目录 ——
      getDataDir(): Promise<string>
      setDataDir(dir: string): Promise<string>

      // —— 业务数据 JSON（主进程原子写） ——
      readData(name: string): Promise<string | null>
      writeData(name: string, content: string): Promise<void>
    }
  }
}
