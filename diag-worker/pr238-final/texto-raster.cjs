// argv: <pacote> <saida> <rotulo> <registro: main|pr>. main = só Montserrat por peso (como a main);
// pr = Montserrat por peso + cada arquivo também como sans-serif (o garantirFontesPadrao corrigido). Processo próprio.
const [pkg, out, rot, reg] = process.argv.slice(2)
const fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto')
const { createCanvas, GlobalFonts } = require(pkg)
for (const w of ['100', '300', '400', '500', '600', '700', '800', '900']) {
  const f = path.resolve(`assets/fonts/montserrat/Montserrat-${w}.ttf`)
  if (!GlobalFonts.registerFromPath(f, 'Montserrat')) throw new Error('Montserrat ' + w)
  if (reg === 'pr' && !GlobalFonts.registerFromPath(f, 'sans-serif')) throw new Error('sans-serif ' + w)
}
const T = 'ALMOÇO às 12h Ç Ã'
const casos = { 'montserrat-400': { font: '400 40px Montserrat' }, 'montserrat-700': { font: '700 40px Montserrat' }, 'sans-400': { font: '400 40px sans-serif' }, 'sans-700': { font: '700 40px sans-serif' }, serif: { font: '40px serif' }, inexistente: { font: '40px FamiliaQueNaoExiste' }, contorno: { font: '700 40px Montserrat', contorno: true }, rotacao: { font: '700 40px Montserrat', rot: true } }
const res = {}
fs.mkdirSync(out, { recursive: true })
for (const [n, c] of Object.entries(casos)) {
  const cv = createCanvas(640, 180), ctx = cv.getContext('2d')
  ctx.fillStyle = '#e0e0e0'; ctx.fillRect(0, 0, 640, 180); ctx.font = c.font; ctx.fillStyle = '#123456'; ctx.textBaseline = 'top'
  if (c.rot) { ctx.translate(20, 20); ctx.rotate(Math.PI / 18) }
  ctx.fillText(T, 30, 35)
  if (c.contorno) { ctx.lineWidth = 2; ctx.strokeStyle = '#c00000'; ctx.strokeText(T, 30, 35) }
  const d = Buffer.from(ctx.getImageData(0, 0, 640, 180).data)
  fs.writeFileSync(path.join(out, `${rot}-${n}.rgba`), d); fs.writeFileSync(path.join(out, `${rot}-${n}.png`), cv.toBuffer('image/png'))
  res[n] = { largura: +ctx.measureText(T).width.toFixed(2) }
}
fs.writeFileSync(path.join(out, `${rot}-medidas.json`), JSON.stringify({ versao: require(pkg + '/package.json').version, reg, res }, null, 1))
