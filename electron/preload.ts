import { contextBridge, ipcRenderer } from 'electron'

export interface PdfFileInfo {
  path: string
  name: string
  size: number
  mtime: number
}

const api = {
  /** 设置窗口标题（老板键伪装模式切换程序名） */
  setWindowTitle: (title: string): Promise<void> => ipcRenderer.invoke('window:setTitle', title),

  /** 打开 PDF 文件对话框，返回路径或 null */
  openPdfDialog: (): Promise<string | null> => ipcRenderer.invoke('dialog:openPdf'),

  /** 读取 PDF 文件内容 */
  readPdf: (path: string): Promise<Uint8Array> => ipcRenderer.invoke('file:readPdf', path),

  fileStat: (path: string): Promise<{ size: number; mtime: number }> =>
    ipcRenderer.invoke('file:stat', path),

  // —— 本机偏好 ——
  getConfig: (): Promise<Record<string, unknown>> => ipcRenderer.invoke('config:get'),
  setConfig: (patch: Record<string, unknown>): Promise<Record<string, unknown>> =>
    ipcRenderer.invoke('config:set', patch),

  // —— 数据目录 ——
  getDataDir: (): Promise<string> => ipcRenderer.invoke('data:getDir'),
  setDataDir: (dir: string): Promise<string> => ipcRenderer.invoke('data:setDir', dir),

  // —— 业务数据 JSON（原子写） ——
  readData: (name: string): Promise<string | null> => ipcRenderer.invoke('data:read', name),
  writeData: (name: string, content: string): Promise<void> =>
    ipcRenderer.invoke('data:write', name, content)
}

export type Api = typeof api

contextBridge.exposeInMainWorld('api', api)
