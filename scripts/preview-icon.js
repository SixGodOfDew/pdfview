// 图标 ASCII 预览 + 关键像素校验（无视觉模型时的人工检查手段）
// 用法：npx electron scripts/preview-icon.js
const { app, BrowserWindow } = require('electron')
const { join } = require('path')
const { readFileSync } = require('fs')

const root = join(__dirname, '..')
const svgText = readFileSync(join(root, 'build', 'icon.svg'), 'utf-8')

app.disableHardwareAcceleration()

async function main() {
  await app.whenReady()
  const win = new BrowserWindow({
    width: 400,
    height: 400,
    show: false,
    webPreferences: { offscreen: true }
  })
  await win.loadURL('about:blank')
  const result = await win.webContents.executeJavaScript(`(async () => {
    try {
    const img = new Image()
    img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(${JSON.stringify(svgText)})
    await img.decode()
    const c = document.createElement('canvas')
    c.width = 1024
    c.height = 1024
    const ctx = c.getContext('2d')
    ctx.drawImage(img, 0, 0, 1024, 1024)
    const d = ctx.getImageData(0, 0, 1024, 1024).data
    const at = (x, y) => {
      const i = (y * 1024 + x) * 4
      return [d[i], d[i + 1], d[i + 2], d[i + 3]]
    }
    // ASCII 预览：64×32 块
    const cols = 64, rows = 32
    const lines = []
    for (let row = 0; row < rows; row++) {
      let line = ''
      for (let col = 0; col < cols; col++) {
        const [r, g, b, a] = at(col * 16 + 8, row * 32 + 8)
        let ch = '.'
        if (a > 40) {
          const lum = 0.299 * r + 0.587 * g + 0.114 * b
          const redness = r - (g + b) / 2
          if (lum > 244) ch = '#'
          else if (lum > 200) ch = '='
          else if (redness > 70) ch = 'R'
          else if (redness > 30) ch = 'r'
          else ch = '-'
        }
        line += ch
      }
      lines.push(line)
    }
    const checks = {
      tileCornerTopLeft: at(160, 160),
      tileCornerBottomRight: at(864, 864),
      outsideTile: at(16, 16),
      leftPage: at(352, 512),
      rightPage: at(672, 512),
      spine: at(512, 512),
      questionDome: at(352, 486),
      questionDot: at(348, 676),
      checkStroke: at(698, 594),
      pdfPill: at(420, 840),
      textLine: at(300, 362)
    }
    return { lines, checks }
    } catch (e) { return { err: String(e && e.message || e), stack: e && e.stack } }
  })()`)
  if (result.err) {
    console.error('[preview] page error:', result.err)
    console.error(String(result.stack).split('\n').slice(0, 4).join('\n'))
    app.exit(1)
    return
  }
  console.log(result.lines.join('\n'))
  for (const [k, v] of Object.entries(result.checks)) {
    console.log(`${k.padEnd(22)} rgba(${v.join(',')})`)
  }
  app.quit()
}

main().catch((err) => {
  console.error('[preview] failed:', err)
  app.exit(1)
})
