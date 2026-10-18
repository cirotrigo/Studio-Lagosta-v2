// argv: <saida>. Chromium headless do Playwright (CHROMIUM_CANAL=chrome usa o Google Chrome já instalado no runner, sem
// baixar navegador), página em branco, rede bloqueada; Montserrat 700 via FontFace (bytes locais do repositório).
const [out] = process.argv.slice(2)
const fs = require('node:fs'), path = require('node:path')
const { chromium } = require('@playwright/test')
const cen = fs.readFileSync(path.join(__dirname, 'sombras-cenarios.js'), 'utf8')
;(async () => {
  const b = await chromium.launch(process.env.CHROMIUM_CANAL ? { channel: process.env.CHROMIUM_CANAL } : {})
  const p = await b.newPage()
  await p.route('**/*', (r) => r.abort())
  const fonte = fs.readFileSync(path.resolve('assets/fonts/montserrat/Montserrat-700.ttf')).toString('base64')
  const r = await p.evaluate(async ({ cen, fonte }) => {
    eval(cen)
    const bytes = Uint8Array.from(atob(fonte), (ch) => ch.charCodeAt(0))
    const f = new FontFace('Montserrat', bytes, { weight: '700' }); await f.load(); document.fonts.add(f)
    const res = {}
    for (const c of CENARIOS) {
      const cv = document.createElement('canvas'); cv.width = W; cv.height = H
      const ctx = cv.getContext('2d'); desenhar(ctx, c)
      res[c.nome] = { rgba: Array.from(ctx.getImageData(0, 0, W, H).data), png: cv.toDataURL('image/png') }
    }
    return { res, ua: navigator.userAgent }
  }, { cen, fonte })
  fs.mkdirSync(out, { recursive: true })
  for (const [nome, v] of Object.entries(r.res)) {
    fs.writeFileSync(path.join(out, `chromium-${nome}.rgba`), Buffer.from(v.rgba))
    fs.writeFileSync(path.join(out, `chromium-${nome}.png`), Buffer.from(v.png.split(',')[1], 'base64'))
  }
  console.log(JSON.stringify({ rot: 'chromium', versao: b.version(), ua: r.ua.replace(/\(.*?\)/, '(…)') }))
  await b.close()
})().catch((e) => { console.error(e); process.exit(1) })
