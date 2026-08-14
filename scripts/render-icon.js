// 离屏渲染 build/icon.svg → build/icon.png（512×512）+ icon-1024.png（原始稿）
// 用法：npm run icon   （或 npx electron scripts/render-icon.js）
const { app, BrowserWindow, nativeImage } = require('electron')
const { join } = require('path')
const { readFileSync, writeFileSync } = require('fs')

const root = join(__dirname, '..')
const svgText = readFileSync(join(root, 'build', 'icon.svg'), 'utf-8')
const out1024 = join(root, 'build', 'icon-1024.png')
const out512 = join(root, 'build', 'icon.png')

app.disableHardwareAcceleration()

async function render() {
  await app.whenReady()
  const win = new BrowserWindow({
    width: 400,
    height: 400,
    show: false,
    webPreferences: { offscreen: true }
  })
  await win.loadURL('about:blank')
  // 在页面内用 canvas 按 1024×1024 精确光栅化 SVG，返回 PNG dataURL
  const dataUrl = await win.webContents.executeJavaScript(`(async () => {
    const img = new Image()
    img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(${JSON.stringify(svgText)})
    await img.decode()
    const c = document.createElement('canvas')
    c.width = 1024
    c.height = 1024
    const ctx = c.getContext('2d')
    ctx.drawImage(img, 0, 0, 1024, 1024)
    return c.toDataURL('image/png')
  })()`)
  const png1024 = Buffer.from(dataUrl.split(',')[1], 'base64')
  writeFileSync(out1024, png1024)
  const img = nativeImage.createFromBuffer(png1024)
  writeFileSync(out512, img.resize({ width: 512, height: 512, quality: 'best' }).toPNG())
  console.log('[icon] written:', out1024, `(${png1024.length} bytes)`)
  console.log('[icon] written:', out512)
  app.quit()
}

render().catch((err) => {
  console.error('[icon] failed:', err)
  app.exit(1)
})
