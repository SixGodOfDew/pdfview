// 校验打包 exe 的应用图标是否已替换为自定义图标
// 用法：npx electron scripts/check-exe-icon.js
const { app } = require('electron')
const { join } = require('path')
const { createHash } = require('crypto')
const { existsSync } = require('fs')

const root = join(__dirname, '..')
const appExe = join(root, 'release', 'win-unpacked', 'PDF双栏刷题阅读器.exe')
const defaultExe = join(root, 'node_modules', 'electron', 'dist', 'electron.exe')

const hash = (buf) => createHash('sha256').update(buf).digest('hex').slice(0, 16)

app.whenReady().then(async () => {
  if (!existsSync(appExe)) {
    console.log('[check] app exe not found:', appExe)
    app.exit(2)
    return
  }
  const ours = await app.getFileIcon(appExe, { size: 'large' })
  const def = await app.getFileIcon(defaultExe, { size: 'large' })
  const oursPng = ours.toPNG()
  const defPng = def.toPNG()
  console.log('[check] app icon   :', ours.getSize(), hash(oursPng), oursPng.length, 'bytes')
  console.log('[check] default icon:', def.getSize(), hash(defPng), defPng.length, 'bytes')
  console.log('[check] custom icon embedded:', hash(oursPng) !== hash(defPng))
  app.exit(hash(oursPng) !== hash(defPng) ? 0 : 1)
})
