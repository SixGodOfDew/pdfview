/**
 * 生成最小合法 PDF（纯手写语法，无外部依赖），用于冒烟测试。
 * 用法：node scripts/gen-test-pdf.js
 */
const fs = require('fs')
const path = require('path')

/** 生成一页内容流 */
function pageStream(text) {
  return `BT /F1 28 Tf 72 700 Td (${text}) Tj 0 -40 Td (Line two - 1234567890) Tj ET`
}

/**
 * @param {string[]} pageTexts 每页文字
 * @param {string} outPath
 */
function makePdf(pageTexts, outPath) {
  const n = pageTexts.length
  let buf = '%PDF-1.4\n'

  const offsets = []
  /** @param {number} num @param {string} body */
  function addObj(num, body) {
    offsets[num] = Buffer.byteLength(buf)
    buf += `${num} 0 obj\n${body}\nendobj\n`
  }

  const kidRefs = Array.from({ length: n }, (_, i) => `${4 + i} 0 R`).join(' ')

  addObj(1, '<< /Type /Catalog /Pages 2 0 R >>')
  addObj(2, `<< /Type /Pages /Kids [${kidRefs}] /Count ${n} >>`)
  addObj(3, '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>')

  // 页面对象：4 .. 3+n
  for (let i = 0; i < n; i++) {
    addObj(
      4 + i,
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 3 0 R >> >> /Contents ${4 + n + i} 0 R >>`
    )
  }
  // 内容流对象：4+n .. 3+2n
  for (let i = 0; i < n; i++) {
    const stream = pageStream(pageTexts[i])
    addObj(4 + n + i, `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`)
  }

  const totalObjs = 3 + 2 * n
  const xrefPos = Buffer.byteLength(buf)
  buf += `xref\n0 ${totalObjs + 1}\n`
  buf += '0000000000 65535 f \n'
  for (let i = 1; i <= totalObjs; i++) {
    const off = String(offsets[i]).padStart(10, '0')
    buf += `${off} 00000 n \n`
  }
  buf += `trailer\n<< /Size ${totalObjs + 1} /Root 1 0 R >>\nstartxref\n${xrefPos}\n%%EOF`

  fs.mkdirSync(path.dirname(outPath), { recursive: true })
  fs.writeFileSync(outPath, buf)
  console.log(`已生成 ${outPath}（${n} 页，${Buffer.byteLength(buf)} 字节）`)
}

const dir = path.join(__dirname, 'testdata')
// 题本 6 页 vs 解析 9 页：篇幅比例不同，可验证比例同步
makePdf(
  Array.from({ length: 6 }, (_, i) => `Question Book - Page ${i + 1} of 6`),
  path.join(dir, 'question.pdf')
)
makePdf(
  Array.from({ length: 9 }, (_, i) => `Answer Book - Page ${i + 1} of 9`),
  path.join(dir, 'answer.pdf')
)
// 第二对文件：用于验证书签自动切换（不同文件应触发切换）
makePdf(
  Array.from({ length: 3 }, (_, i) => `Other Question - Page ${i + 1} of 3`),
  path.join(dir, 'question2.pdf')
)
makePdf(
  Array.from({ length: 5 }, (_, i) => `Other Answer - Page ${i + 1} of 5`),
  path.join(dir, 'answer2.pdf')
)
