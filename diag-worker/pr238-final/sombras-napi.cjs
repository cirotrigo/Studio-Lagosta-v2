// argv: <pacote @napi-rs/canvas> <saida> <rotulo>. Processo próprio por versão (registro global).
const [pkg, out, rot] = process.argv.slice(2)
const fs = require('node:fs'), path = require('node:path')
const { createCanvas, GlobalFonts } = require(pkg)
const { W, H, CENARIOS, desenhar } = require('./sombras-cenarios.js')
const ok = GlobalFonts.registerFromPath(path.resolve('assets/fonts/montserrat/Montserrat-700.ttf'), 'Montserrat')
if (!ok) throw new Error('Montserrat 700 não registrou')
fs.mkdirSync(out, { recursive: true })
for (const c of CENARIOS) {
  const cv = createCanvas(W, H), ctx = cv.getContext('2d'); desenhar(ctx, c)
  fs.writeFileSync(path.join(out, `${rot}-${c.nome}.rgba`), Buffer.from(ctx.getImageData(0, 0, W, H).data))
  fs.writeFileSync(path.join(out, `${rot}-${c.nome}.png`), cv.toBuffer('image/png'))
}
console.log(JSON.stringify({ rot, versao: require(pkg + '/package.json').version, cenarios: CENARIOS.length }))
