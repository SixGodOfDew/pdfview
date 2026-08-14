import { app, BrowserWindow, ipcMain, dialog } from 'electron'
import { join, dirname } from 'path'
import { readFile, writeFile, mkdir, rename, stat } from 'fs/promises'
import { existsSync } from 'fs'

// ============ 本机偏好 config.json（userData 目录，每机独立，不随数据同步） ============

interface AppConfig {
  dataDir?: string // 用户自定义数据目录（未设置时用默认）
  lastExportDir?: string
  windowBounds?: { x: number; y: number; width: number; height: number }
}

let configCache: AppConfig | null = null
let configLoaded = false

function configPath(): string {
  return join(app.getPath('userData'), 'config.json')
}

async function loadConfig(): Promise<AppConfig> {
  if (configLoaded && configCache) return configCache
  try {
    const raw = await readFile(configPath(), 'utf-8')
    configCache = JSON.parse(raw) as AppConfig
  } catch {
    configCache = {}
  }
  configLoaded = true
  return configCache as AppConfig
}

async function atomicWrite(file: string, content: string): Promise<void> {
  await mkdir(dirname(file), { recursive: true })
  const tmp = file + '.tmp'
  await writeFile(tmp, content, 'utf-8')
  await rename(tmp, file)
}

// ============ 数据目录（业务数据 JSON，可自定义用于跨机同步） ============

function defaultDataDir(): string {
  return join(app.getPath('documents'), 'PDF刷题阅读器', 'data')
}

async function getDataDir(): Promise<string> {
  // 冒烟测试数据目录隔离（避免污染真实用户数据）
  if (process.env['PDFVIEW_SMOKE_DATA_DIR']) return process.env['PDFVIEW_SMOKE_DATA_DIR']
  const cfg = await loadConfig()
  return cfg.dataDir || defaultDataDir()
}

// ============ IPC ============

function registerIpc(): void {
  // 打开 PDF 文件对话框
  ipcMain.handle('dialog:openPdf', async () => {
    const options: Electron.OpenDialogOptions = {
      title: '选择 PDF 文件',
      properties: ['openFile'],
      filters: [{ name: 'PDF 文件', extensions: ['pdf'] }]
    }
    const win = BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0]
    const result = win
      ? await dialog.showOpenDialog(win, options)
      : await dialog.showOpenDialog(options)
    if (result.canceled || result.filePaths.length === 0) return null
    return result.filePaths[0]
  })

  // 读取 PDF 文件内容（返回 Buffer，经 IPC 结构化克隆为 Uint8Array）
  ipcMain.handle('file:readPdf', async (_e, path: string) => {
    if (!existsSync(path)) throw new Error('文件不存在: ' + path)
    const buf = await readFile(path)
    return buf
  })

  ipcMain.handle('file:stat', async (_e, path: string) => {
    const s = await stat(path)
    return { size: s.size, mtime: s.mtimeMs }
  })

  // 本机偏好
  ipcMain.handle('config:get', async () => loadConfig())
  ipcMain.handle('config:set', async (_e, patch: Partial<AppConfig>) => {
    const cfg = { ...(await loadConfig()), ...patch }
    configCache = cfg
    await atomicWrite(configPath(), JSON.stringify(cfg, null, 2))
    return cfg
  })

  // 数据目录
  ipcMain.handle('data:getDir', async () => getDataDir())
  ipcMain.handle('data:setDir', async (_e, dir: string) => {
    const cfg = { ...(await loadConfig()), dataDir: dir }
    configCache = cfg
    await atomicWrite(configPath(), JSON.stringify(cfg, null, 2))
    return dir
  })

  // 业务数据 JSON 读写（原子写）
  ipcMain.handle('data:read', async (_e, name: string) => {
    const p = join(await getDataDir(), name)
    if (!existsSync(p)) return null
    return readFile(p, 'utf-8')
  })
  ipcMain.handle('data:write', async (_e, name: string, content: string) => {
    const dir = await getDataDir()
    await atomicWrite(join(dir, name), content)
  })
}

// ============ 窗口 ============

async function createWindow(): Promise<void> {
  const cfg = await loadConfig()
  const bounds = cfg.windowBounds

  const win = new BrowserWindow({
    width: bounds?.width ?? 1440,
    height: bounds?.height ?? 900,
    x: bounds?.x,
    y: bounds?.y,
    minWidth: 960,
    minHeight: 600,
    title: 'PDF双栏刷题阅读器',
    backgroundColor: '#1e1e1e',
    autoHideMenuBar: true,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  })

  win.on('close', () => {
    const b = win.getBounds()
    void loadConfig().then((cfg) => {
      void atomicWrite(configPath(), JSON.stringify({ ...cfg, windowBounds: b }, null, 2))
    })
  })

  // —— 渲染进程错误/日志转发（便于无界面调试）——
  win.webContents.on('console-message', (details) => {
    if (details.level === 'error' || details.level === 'warning') {
      console.log(`[renderer:${details.level}]`, details.message)
    }
  })
  win.webContents.on('render-process-gone', (_e, d) => {
    console.error('[renderer] gone:', d.reason)
  })

  // —— 冒烟测试（PDFVIEW_SMOKE=1 时自动打开测试 PDF、滚动、遮罩、截图）——
  if (process.env['PDFVIEW_SMOKE'] === '1' && !app.isPackaged) {
    const outDir = process.env['PDFVIEW_SMOKE_OUT'] || process.cwd()
    const outImage = join(outDir, '.smoke.png')
    const outReport = join(outDir, '.smoke-report.json')
    // 必须在 loadURL 之前注册，否则错过 did-finish-load
    win.webContents.once('did-finish-load', () => {
      void runSmoke(win, outImage, outReport)
    })
  }

  // dev 模式加载 vite dev server，生产加载打包产物
  if (process.env['ELECTRON_RENDERER_URL']) {
    await win.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    await win.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

async function runSmoke(win: BrowserWindow, outImage: string, outReport: string): Promise<void> {
  const q = process.env['PDFVIEW_SMOKE_Q']
  const a = process.env['PDFVIEW_SMOKE_A']
  const q2 = process.env['PDFVIEW_SMOKE_Q2']
  const a2 = process.env['PDFVIEW_SMOKE_A2']
  const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms))
  const js = (code: string): Promise<unknown> => win.webContents.executeJavaScript(code, true)
  const report: Record<string, unknown> = {}

  try {
    await sleep(1500) // 等 Vue 挂载

    // 生产构建无 dev 测试钩子：走轻量验证（渲染 DOM 完整 = JS/CSS/资源加载成功）
    const hasHooks = await js(`!!window.__viewerStore`)
    if (!hasHooks) {
      report.liteMode = true
      report.hasToolbar = await js(`!!document.querySelector('.toolbar')`)
      report.viewerHeaderCount = await js(`document.querySelectorAll('.viewer-header').length`)
      report.toolbarText = await js(
        `(document.querySelector('.toolbar')?.textContent ?? '').slice(0, 60)`
      )
      report.appHtmlLen = await js(`document.getElementById('app')?.innerHTML.length ?? -1`)
      console.log('[smoke] REPORT ' + JSON.stringify(report))
      await writeFile(outReport, JSON.stringify(report, null, 2))
      console.log('[smoke] DONE')
      return
    }

    if (q) {
      report.openQuestion = await js(`window.__viewerStore.open('question', ${JSON.stringify(q)})`)
      await sleep(2500) // 等 PDF 解析 + 首屏渲染
    }
    if (a) {
      report.openAnswer = await js(`window.__viewerStore.open('answer', ${JSON.stringify(a)})`)
      await sleep(2500)
    }

    report.state1 = await js(
      `[window.__viewerStore.left.pageFloat, window.__viewerStore.right.pageFloat, window.__viewerStore.left.loaded, window.__viewerStore.right.loaded]`
    )

    // 遮罩：解析侧擦除一个圆（验证 MaskManager 渲染链路）
    if (a) {
      report.maskVersionBefore = await js(`window.__maskStore.version`)
      await js(`window.__maskStore.eraseCircle(0, 200, 200, 90)`)
      await sleep(400)
      report.maskVersionAfter = await js(`window.__maskStore.version`)
    }

    // 遮罩优先验证：画笔工具激活时，解析侧遮罩点击仍生效；
    // 且点击遮罩模式按钮（store 层）自动把标注工具切回浏览
    if (a) {
      report.maskPriorityDiag = await js(`(() => {
        // store 层：画笔工具下点击遮罩模式按钮 → 自动切浏览
        window.__annotationStore.setTool('pen')
        window.__maskStore.setMode('click')
        const toolAfterSetMode = window.__annotationStore.activeTool
        // 事件层：再次强制画笔后，点击遮罩仍生效
        window.__annotationStore.setTool('pen')
        const vBefore = window.__maskStore.version
        const panes = document.querySelectorAll('.split-pane .pane')
        const rightPane = panes[1]
        const ic = rightPane ? rightPane.querySelector('.ink-canvas') : null
        if (!ic) return { hasInkCanvas: false, toolAfterSetMode }
        const rect = ic.getBoundingClientRect()
        ic.dispatchEvent(new MouseEvent('click', {
          clientX: rect.left + 100, clientY: rect.top + 100, bubbles: true
        }))
        const vAfter = window.__maskStore.version
        const toolAfterClick = window.__annotationStore.activeTool
        return {
          hasInkCanvas: true,
          toolAfterSetMode,
          vBefore,
          vAfter,
          maskClicked: vAfter > vBefore,
          toolAfterClick,
          bothBrowse: toolAfterSetMode === 'browse' && toolAfterClick === 'browse'
        }
      })()`)
    }

    // 主侧（题本）滚动 → 比例同步应带动解析侧
    if (q) {
      report.scrollDiag = await js(`(() => {
        const els = document.querySelectorAll('.viewer-scroll')
        if (!els[0]) return { err: 'no scroll el' }
        const el = els[0]
        const before = el.scrollTop
        el.scrollTop = 400
        el.dispatchEvent(new Event('scroll'))
        return {
          n: els.length,
          scrollHeight: el.scrollHeight,
          clientHeight: el.clientHeight,
          before,
          after: el.scrollTop,
          pageFloat: window.__viewerStore.left.pageFloat
        }
      })()`)

      report.syncDiag = await js(`(() => {
        const els = document.querySelectorAll('.viewer-scroll')
        els[0].scrollTop = 500
        els[0].dispatchEvent(new Event('scroll'))
        return {
          left: els[0].scrollTop,
          right: els[1].scrollTop,
          leftPf: window.__viewerStore.left.pageFloat,
          rightPf: window.__viewerStore.right.pageFloat,
          engineEnabled: window.__syncEngine.enabled,
          applyToSlaveSet: !!window.__syncEngine.applyToSlave
        }
      })()`)

      // 真实滚轮输入事件（走完整输入管线，等价用户滚动）
      win.webContents.focus()
      win.webContents.sendInputEvent({
        type: 'mouseWheel',
        x: 500,
        y: 400,
        deltaX: 0,
        deltaY: 240,
        canScroll: true
      })
      await sleep(800)
      report.wheelDiag = await js(`(() => {
        const els = document.querySelectorAll('.viewer-scroll')
        return {
          left: els[0].scrollTop,
          right: els[1].scrollTop,
          leftPf: window.__viewerStore.left.pageFloat,
          rightPf: window.__viewerStore.right.pageFloat
        }
      })()`)

      // 主从验证：滚动从侧（解析），题本应保持不动
      report.masterSlaveDiag = await js(`(() => {
        const els = document.querySelectorAll('.viewer-scroll')
        const leftBefore = els[0].scrollTop
        els[1].scrollTop = 300
        els[1].dispatchEvent(new Event('scroll'))
        return { leftBefore, leftAfter: els[0].scrollTop, right: els[1].scrollTop }
      })()`)
      await sleep(400)

      // 栏头文件名验证
      report.headerNames = await js(
        `Array.from(document.querySelectorAll('.vh-name')).map(el => el.textContent)`
      )

      // 书签验证：记录双侧文件名，写入 bookmarks.json
      report.bookmarkDiag = await js(`(() => {
        window.__bookmarkStore.add({
          id: 'smoke-' + Date.now(),
          questionPath: window.__viewerStore.left.path,
          questionName: window.__viewerStore.left.name,
          answerPath: window.__viewerStore.right.path,
          answerName: window.__viewerStore.right.name,
          questionPage: 2.2,
          answerPage: 3.3,
          createdAt: Date.now(),
          updatedAt: Date.now()
        })
        const b = window.__bookmarkStore.bookmarks[0]
        return {
          count: window.__bookmarkStore.bookmarks.length,
          qName: b.questionName,
          aName: b.answerName
        }
      })()`)

      // 标注验证：画笔 + 文本框 + 悬停形状
      if (q && a) {
        report.encodingDiag = await js(`(() => {
          const lit = '中文测试备注'
          const built = String.fromCharCode(20013, 25991, 27979, 35797, 22791, 27880)
          return { lit, built, litOk: lit === built }
        })()`)
        report.annotationDiag = await js(`(() => new Promise((resolve) => {
          const qPath = window.__viewerStore.left.path
          const aPath = window.__viewerStore.right.path
          window.__annotationStore.setTool('pen')
          window.__annotationStore.addStroke(qPath, 0, {
            id: 'smoke-stroke-' + Date.now(),
            color: '#e53935',
            width: 4,
            points: [{ x: 100, y: 100 }, { x: 150, y: 130 }, { x: 200, y: 110 }]
          })
          window.__annotationStore.addBox(aPath, 0, {
            id: 'smoke-box-' + Date.now(),
            x: 200, y: 220,
            text: '冒烟测试备注',
            color: '#c62828',
            fontSize: 16,
            updatedAt: Date.now()
          })
          window.__settingsStore.setHoverShape('wide')
          // 等 Vue 响应式 DOM 更新后再检查
          setTimeout(() => {
            resolve({
              tool: window.__annotationStore.activeTool,
              strokes: window.__annotationStore.manager.getPage(qPath, 0).strokes.length,
              boxes: window.__annotationStore.manager.getPage(aPath, 0).boxes.length,
              hoverShape: window.__settingsStore.hoverShape,
              hasInkCanvas: !!document.querySelector('.ink-canvas'),
              hasTextBox: !!document.querySelector('.text-box'),
              // executeJavaScript 返回值中文在 Windows 上会乱码，改用 charCode 数组传回
              boxTextCodes: Array.from(
                (document.querySelector('.tb-text')?.textContent ?? '').trim()
              ).map((c) => c.charCodeAt(0))
            })
          }, 500)
        }))()`)
        // 主进程侧重建中文（仅用于报告展示）
        const annDiag = report.annotationDiag as Record<string, unknown> | undefined
        if (annDiag && Array.isArray(annDiag.boxTextCodes)) {
          annDiag.boxText = String.fromCharCode(...(annDiag.boxTextCodes as number[]))
          delete annDiag.boxTextCodes
        }

        // 空文本框泄漏回归：text 工具连续点击两次，应只剩 1 个空框；
        // 切回浏览工具后空框应被自动结算删除
        report.textFlowDiag = await js(`(() => new Promise((resolve) => {
          window.__annotationStore.setTool('text')
          const ics = document.querySelectorAll('.ink-canvas')
          const ic = ics[0]
          if (!ic) { resolve({ err: 'no ink canvas', n: ics.length }); return }
          const rect = ic.getBoundingClientRect()
          const opts = { clientX: rect.left + 80, clientY: rect.top + 60, bubbles: true }
          const qPath = window.__viewerStore.left.path
          const count = () => window.__annotationStore.manager.getPage(qPath, 0).boxes.length
          ic.dispatchEvent(new MouseEvent('click', opts))
          const afterClick1 = count()
          ic.dispatchEvent(new MouseEvent('click', opts))
          const afterClick2 = count()
          let boxesAt50 = -1
          let boxesAt200 = -1
          setTimeout(() => { boxesAt50 = count() }, 50)
          setTimeout(() => { boxesAt200 = count() }, 200)
          setTimeout(() => {
            const before = count()
            const domBoxes = document.querySelectorAll('.text-box').length
            const domTextareas = document.querySelectorAll('.tb-input').length
            const focused = document.activeElement ? document.activeElement.className : 'none'
            window.__annotationStore.setTool('browse')
            setTimeout(() => {
              resolve({
                n: ics.length, afterClick1, afterClick2, boxesAt50, boxesAt200,
                before, domBoxes, domTextareas, focused, after: count()
              })
            }, 300)
          }, 400)
        }))()`)

        // 画笔橡皮擦验证：添加两条笔画后擦除一条
        report.eraserDiag = await js(`(() => {
          const qPath = window.__viewerStore.left.path
          const base = window.__annotationStore.manager.getPage(qPath, 0).strokes.length
          window.__annotationStore.addStroke(qPath, 0, {
            id: 'er-' + Date.now(), color: '#000000', width: 4,
            points: [{ x: 400, y: 400 }, { x: 420, y: 420 }]
          })
          window.__annotationStore.addStroke(qPath, 0, {
            id: 'er2-' + Date.now(), color: '#000000', width: 4,
            points: [{ x: 600, y: 600 }, { x: 620, y: 620 }]
          })
          const afterAdd = window.__annotationStore.manager.getPage(qPath, 0).strokes.length
          window.__annotationStore.eraseStrokesAt(qPath, 0, 400, 400, 25)
          window.__annotationStore.endEraseSession()
          const afterErase = window.__annotationStore.manager.getPage(qPath, 0).strokes.length
          return { base, afterAdd, afterErase }
        })()`)

        // 撤回验证：画一笔 → 撤回消失；擦一笔 → 撤回恢复
        report.undoDiag = await js(`(() => {
          const qPath = window.__viewerStore.left.path
          const base = window.__annotationStore.manager.getPage(qPath, 0).strokes.length
          window.__annotationStore.addStroke(qPath, 0, {
            id: 'u-' + Date.now(), color: '#111111', width: 4,
            points: [{ x: 100, y: 100 }, { x: 120, y: 120 }]
          })
          const afterAdd = window.__annotationStore.manager.getPage(qPath, 0).strokes.length
          const ok1 = window.__annotationStore.undo()
          const afterUndoAdd = window.__annotationStore.manager.getPage(qPath, 0).strokes.length
          window.__annotationStore.addStroke(qPath, 0, {
            id: 'u2-' + Date.now(), color: '#111111', width: 4,
            points: [{ x: 300, y: 300 }, { x: 320, y: 320 }]
          })
          const beforeErase = window.__annotationStore.manager.getPage(qPath, 0).strokes.length
          // 模拟一次独立的拖动擦除（先结束旧会话）
          window.__annotationStore.endEraseSession()
          window.__annotationStore.eraseStrokesAt(qPath, 0, 300, 300, 25)
          window.__annotationStore.endEraseSession()
          const afterErase = window.__annotationStore.manager.getPage(qPath, 0).strokes.length
          const ok2 = window.__annotationStore.undo()
          const afterUndoErase = window.__annotationStore.manager.getPage(qPath, 0).strokes.length
          const historyLeft = window.__annotationStore.history.length
          return { base, afterAdd, afterUndoAdd, beforeErase, afterErase, afterUndoErase, ok1, ok2, historyLeft }
        })()`)

        // 书签自动切换验证：先打开"另一对"文件，再点书签应自动切回书签关联的文件
        if (a2) {
          report.switchDiag = await js(`(() => {
            // 记录当前书签（属于 q/a 这对文件）
            const b = window.__bookmarkStore.bookmarks[0]
            // 打开另一对文件（q2/a2），模拟换了题
            window.__viewerStore.open('question', ${JSON.stringify(q2 ?? '')})
            window.__viewerStore.open('answer', ${JSON.stringify(a2 ?? '')})
            return { hasBookmark: !!b, bq: b?.questionPath ?? null }
          })()`)
          await sleep(3000)
          report.switchDiag2 = await js(
            `[window.__viewerStore.left.path, window.__viewerStore.right.path, window.__viewerStore.left.loaded, window.__viewerStore.right.loaded]`
          )
          // 点击书签 → 自动切换回书签关联文件
          report.switchResult = await js(`window.__openBookmarkPair(window.__bookmarkStore.bookmarks[0])`)
          await sleep(3000)
          report.switchDiag3 = await js(
            `[window.__viewerStore.left.path, window.__viewerStore.right.path, window.__viewerStore.left.pageFloat, window.__viewerStore.right.pageFloat]`
          )
        }
      }
    }

    report.state2 = await js(
      `[window.__viewerStore.left.pageFloat, window.__viewerStore.right.pageFloat]`
    )
    report.scrollTops = await js(
      `Array.from(document.querySelectorAll('.viewer-scroll')).map(el => Math.round(el.scrollTop))`
    )
    report.renderedPages = await js(
      `Array.from(document.querySelectorAll('.pdf-page')).length`
    )
    report.theme = await js(`document.documentElement.dataset.theme`)

    // 主题切换冒烟
    await js(`window.__settingsStore.setTheme('night')`)
    await sleep(400)
    report.themeAfter = await js(`document.documentElement.dataset.theme`)

    // 帮助对话框验证：F1 打开，含 12 行动态快捷键表
    report.helpDiag = await js(`(() => new Promise((resolve) => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'F1', bubbles: true }))
      setTimeout(() => {
        const rows = document.querySelectorAll('.modal-help .help-table tbody tr').length
        const rebinds = document.querySelectorAll('.modal-help .rebind-btn').length
        window.dispatchEvent(new KeyboardEvent('keydown', { key: 'F1', bubbles: true }))
        setTimeout(() => {
          resolve({
            hasHelp: true,
            kbdCount: document.querySelectorAll('.kbd').length,
            helpRows: rows,
            rebindBtns: rebinds
          })
        }, 200)
      }, 300)
    }))()`)

    // 快捷键触发验证：P→画笔 / V→浏览 / M→遮罩切换；改键交换验证
    report.shortcutDiag = await js(`(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'p', bubbles: true }))
      const toolAfterP = window.__annotationStore.activeTool
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'v', bubbles: true }))
      const toolAfterV = window.__annotationStore.activeTool
      const maskBefore = window.__maskStore.mode
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'm', bubbles: true }))
      const maskAfter = window.__maskStore.mode
      // 改键：把「撤回」改为 F1（与「帮助」冲突 → 应自动交换）
      const swapped = window.__settingsStore.setShortcut('undo', 'f1')
      const undoBinding = window.__settingsStore.shortcuts.undo
      const helpBinding = window.__settingsStore.shortcuts.help
      // 恢复默认，避免污染后续
      window.__settingsStore.resetShortcuts()
      return { toolAfterP, toolAfterV, maskBefore, maskAfter, swapped, undoBinding, helpBinding }
    })()`)

    // 自定义下拉框验证：画笔粗细下拉 → 打开 → 选「粗」→ penWidth=7
    report.selectDiag = await js(`(() => new Promise((resolve) => {
      window.__annotationStore.setTool('pen')
      setTimeout(() => {
        const triggers = Array.from(document.querySelectorAll('.toolbar .sel-trigger'))
        const widthSel = triggers.find((t) => t.textContent.includes('细') || t.textContent.includes('中') || t.textContent.includes('粗'))
        if (!widthSel) { resolve({ hasTrigger: false }); return }
        widthSel.dispatchEvent(new MouseEvent('click', { bubbles: true }))
        setTimeout(() => {
          const menu = document.querySelector('.sel-menu')
          if (!menu) { resolve({ hasTrigger: true, hasMenu: false }); return }
          const opts = Array.from(menu.querySelectorAll('.sel-opt'))
          const rough = opts.find((o) => o.textContent.trim() === '粗')
          rough?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
          setTimeout(() => {
            resolve({
              hasTrigger: true,
              hasMenu: true,
              optCount: opts.length,
              penWidth: window.__annotationStore.penWidth
            })
          }, 250)
        }, 250)
      }, 250)
    }))()`)

    // 颜色选择器验证：打开色板 → 12 色块 → 点橙色块 → penColor 更新
    report.colorPickerDiag = await js(`(() => new Promise((resolve) => {
      window.__annotationStore.setTool('pen')
      setTimeout(() => {
        const trigger = document.querySelector('.toolbar .cp-trigger')
        if (!trigger) { resolve({ hasTrigger: false }); return }
        trigger.dispatchEvent(new MouseEvent('click', { bubbles: true }))
        setTimeout(() => {
          const menu = document.querySelector('.cp-menu')
          if (!menu) { resolve({ hasTrigger: true, hasMenu: false }); return }
          const swatches = Array.from(menu.querySelectorAll('.cp-swatch-btn'))
          const orange = swatches.find((s) => s.title === '#e8590c')
          orange?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
          setTimeout(() => {
            resolve({
              hasTrigger: true,
              hasMenu: true,
              swatchCount: swatches.length,
              hasCustom: !!menu.querySelector("input[type='color']"),
              penColor: window.__annotationStore.penColor
            })
          }, 250)
        }, 250)
      }, 250)
    }))()`)

    // 风格切换验证：瑞士 → 水墨 → 粗野 → 瑞士
    report.styleDiag = await js(`(() => new Promise((resolve) => {
      const get = () => document.documentElement.dataset.style
      const before = get()
      window.__settingsStore.setStyle('ink')
      setTimeout(() => {
        const ink = get()
        window.__settingsStore.setStyle('brutal')
        setTimeout(() => {
          const brutal = get()
          window.__settingsStore.setStyle('swiss')
          setTimeout(() => {
            resolve({ before, ink, brutal, swiss: get() })
          }, 300)
        }, 300)
      }, 300)
    }))()`)

    // 「⋮」更多菜单验证：点击弹出、含风格/主题选项与操作按钮
    report.moreMenuDiag = await js(`(() => new Promise((resolve) => {
      const btn = document.querySelector('.tb-more .btn')
      if (!btn) { resolve({ hasMoreBtn: false }); return }
      btn.dispatchEvent(new MouseEvent('click', { bubbles: true }))
      setTimeout(() => {
        resolve({
          hasMoreBtn: true,
          hasMenu: !!document.querySelector('.more-menu'),
          optionBtns: document.querySelectorAll('.more-menu .more-options .btn').length,
          actionBtns: document.querySelectorAll('.more-menu .more-actions .btn').length
        })
      }, 300)
    }))()`)

    // 风格下主题切换生效验证：水墨风格下 日间→夜间 工具栏背景应变化
    report.themeUnderStyleDiag = await js(`(() => new Promise((resolve) => {
      window.__settingsStore.setStyle('ink')
      window.__settingsStore.setTheme('day')
      setTimeout(() => {
        const dayBg = getComputedStyle(document.querySelector('.toolbar')).backgroundColor
        window.__settingsStore.setTheme('night')
        setTimeout(() => {
          const nightBg = getComputedStyle(document.querySelector('.toolbar')).backgroundColor
          window.__settingsStore.setTheme('day')
          setTimeout(() => {
            window.__settingsStore.setStyle('brutal')
            setTimeout(() => {
              resolve({ dayBg, nightBg, changed: dayBg !== nightBg })
            }, 250)
          }, 250)
        }, 350)
      }, 350)
    }))()`)

    // primary 按钮前景/背景对比验证（四种组合下都应有明显亮度差，杜绝同色）
    report.primaryBtnDiag = await js(`(() => new Promise((resolve) => {
      const btn = document.querySelector('.toolbar .btn.primary')
      const read = () => {
        const cs = getComputedStyle(btn)
        return { bg: cs.backgroundColor, fg: cs.color }
      }
      const lum = (c) => {
        const m = c.match(/[\\d.]+/g)
        if (!m || m.length < 3) return 0
        const [r, g, b] = m.slice(0, 3).map(Number)
        return 0.299 * r + 0.587 * g + 0.114 * b
      }
      const diff = (x) => Math.abs(lum(x.bg) - lum(x.fg))
      window.__settingsStore.setStyle('ink')
      window.__settingsStore.setTheme('day')
      setTimeout(() => {
        const inkDay = read()
        window.__settingsStore.setTheme('night')
        setTimeout(() => {
          const inkNight = read()
          window.__settingsStore.setStyle('brutal')
          window.__settingsStore.setTheme('day')
          setTimeout(() => {
            const brutalDay = read()
            window.__settingsStore.setTheme('night')
            setTimeout(() => {
              const brutalNight = read()
              window.__settingsStore.setStyle('brutal')
              window.__settingsStore.setTheme('day')
              setTimeout(() => {
                resolve({
                  inkDayDiff: Math.round(diff(inkDay)),
                  inkNightDiff: Math.round(diff(inkNight)),
                  brutalDayDiff: Math.round(diff(brutalDay)),
                  brutalNightDiff: Math.round(diff(brutalNight)),
                  allReadable:
                    diff(inkDay) > 60 &&
                    diff(inkNight) > 60 &&
                    diff(brutalDay) > 60 &&
                    diff(brutalNight) > 60
                })
              }, 250)
            }, 350)
          }, 350)
        }, 350)
      }, 350)
    }))()`)

    // 书签面板验证：打开面板、标签按钮组、点击标标签、拖拽调宽
    report.panelDiag = await js(`(() => new Promise((resolve) => {
      const btns = Array.from(document.querySelectorAll('.toolbar .btn'))
      const bmBtn = btns.find((b) => b.textContent.trim() === '书签')
      bmBtn?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
      setTimeout(() => {
        const panel = document.querySelector('.bookmark-panel')
        if (!panel) { resolve({ hasPanel: false }); return }
        const wBefore = panel.getBoundingClientRect().width
        const tagBtns = document.querySelectorAll('.bm-tagbtn')
        const firstTag = tagBtns[0]
        firstTag?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
        setTimeout(() => {
          const tagActive = firstTag?.classList.contains('active') ?? false
          const resizer = document.querySelector('.bm-resizer')
          const r = resizer.getBoundingClientRect()
          const cx = r.left + 2
          const cy = r.top + 100
          resizer.dispatchEvent(new PointerEvent('pointerdown', { clientX: cx, clientY: cy, bubbles: true, pointerId: 1 }))
          resizer.dispatchEvent(new PointerEvent('pointermove', { clientX: cx + 60, clientY: cy, bubbles: true, pointerId: 1 }))
          resizer.dispatchEvent(new PointerEvent('pointerup', { clientX: cx + 60, clientY: cy, bubbles: true, pointerId: 1 }))
          setTimeout(() => {
            const wAfter = panel.getBoundingClientRect().width
            resolve({
              hasPanel: true,
              wBefore: Math.round(wBefore),
              wAfter: Math.round(wAfter),
              tagBtns: tagBtns.length,
              tagActive
            })
          }, 300)
        }, 300)
      }, 300)
    }))()`)

    // 页码浮标与标签色点验证
    report.indicatorDiag = await js(`(() => {
      const ind = document.querySelector('.page-indicator')
      const tagBtn = document.querySelector('.bm-tagbtn')
      if (!ind) return { hasIndicator: false }
      const cs = getComputedStyle(ind)
      const dot = tagBtn ? getComputedStyle(tagBtn, '::before') : null
      return {
        hasIndicator: true,
        position: cs.position,
        hasViewerBody: !!document.querySelector('.viewer-body'),
        text: ind.textContent.trim(),
        tagDotWidth: dot ? dot.width : null
      }
    })()`)

    // 窄面板（240px）下标签按钮与删除按钮不重叠验证
    report.narrowPanelDiag = await js(`(() => {
      const panel = document.querySelector('.bookmark-panel')
      const del = document.querySelector('.bm-actions .btn.danger')
      const tags = Array.from(document.querySelectorAll('.bm-tagbtn'))
      if (!panel || !del || tags.length === 0) return { hasElements: false }
      const d = del.getBoundingClientRect()
      let overlap = false
      for (const t of tags) {
        const r = t.getBoundingClientRect()
        if (r.right > d.left && d.right > r.left && r.bottom > d.top && d.bottom > r.top) {
          overlap = true
        }
      }
      return {
        hasElements: true,
        panelWidth: Math.round(panel.getBoundingClientRect().width),
        overlap
      }
    })()`)

    // 再次打开 PDF 回归：滚动后重开另一文件 → 文档切换、渲染、滚动复位
    if (q2) {
      report.reopenDiag = await js(`(() => new Promise((resolve) => {
        const els = document.querySelectorAll('.viewer-scroll')
        els[0].scrollTop = 500
        els[0].dispatchEvent(new Event('scroll'))
        const beforeScroll = Math.round(els[0].scrollTop)
        window.__viewerStore.open('question', ${JSON.stringify(q2)}).then((r) => {
          setTimeout(() => {
            const els2 = document.querySelectorAll('.viewer-scroll')
            resolve({
              result: r,
              isQ2: (window.__viewerStore.left.path ?? '').includes('question2'),
              numPages: window.__viewerStore.left.numPages,
              beforeScroll,
              afterScroll: Math.round(els2[0].scrollTop),
              renderedPages: document.querySelectorAll('.pdf-page').length
            })
          }, 2500)
        })
      }))()`)
    }

    // 文本框双击编辑与删除按钮验证（先双击后删除，都用既有框）
    report.textBoxDiag = await js(`(() => new Promise((resolve) => {
      const aPath = window.__viewerStore.right.path
      const before = window.__annotationStore.manager.getPage(aPath, 0).boxes.length
      // 1) 双击编辑：在既有框上派发完整双击序列（down/up/click ×2 + dblclick）
      const box = document.querySelector('.text-box')
      if (box) {
        const r = box.getBoundingClientRect()
        const o = { bubbles: true, clientX: r.left + 10, clientY: r.top + 10 }
        for (let i = 0; i < 2; i++) {
          box.dispatchEvent(new PointerEvent('pointerdown', { ...o, pointerId: 5 + i }))
          box.dispatchEvent(new PointerEvent('pointerup', { ...o, pointerId: 5 + i }))
          box.dispatchEvent(new MouseEvent('click', o))
        }
        box.dispatchEvent(new MouseEvent('dblclick', o))
      }
      setTimeout(() => {
        const textareaAppeared = !!document.querySelector('.tb-input')
        // 2) 删除按钮：pointerdown/up + click
        const del = document.querySelector('.tb-del')
        if (del) {
          del.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerId: 9 }))
          del.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, pointerId: 9 }))
          del.dispatchEvent(new MouseEvent('click', { bubbles: true }))
        }
        setTimeout(() => {
          const afterDel = window.__annotationStore.manager.getPage(aPath, 0).boxes.length
          resolve({ before, hasBox: !!box, textareaAppeared, hasDel: !!del, afterDel })
        }, 300)
      }, 300)
    }))()`)

    // 截图
    const img = await win.webContents.capturePage()
    await writeFile(outImage, img.toPNG())
    report.screenshot = outImage

    console.log('[smoke] REPORT ' + JSON.stringify(report))
    await writeFile(outReport, JSON.stringify(report, null, 2))
    console.log('[smoke] DONE')
  } catch (err) {
    console.error('[smoke] FAILED', err)
    report.error = String(err)
    await writeFile(outReport, JSON.stringify(report, null, 2)).catch(() => {})
  }
}

app.whenReady().then(() => {
  registerIpc()
  void createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) void createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
