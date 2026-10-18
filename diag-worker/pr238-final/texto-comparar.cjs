const [out] = process.argv.slice(2); const fs = require('node:fs'), path = require('node:path')
const a = JSON.parse(fs.readFileSync(path.join(out, 'v0-medidas.json'))), b = JSON.parse(fs.readFileSync(path.join(out, 'v1-medidas.json')))
const linhas = []
for (const n of Object.keys(a.res)) {
  const x = fs.readFileSync(path.join(out, `v0-${n}.rgba`)), y = fs.readFileSync(path.join(out, `v1-${n}.rgba`))
  let px = 0, max = 0; for (let i = 0; i < x.length; i += 4) { let d = 0; for (let k = 0; k < 3; k++) d = Math.max(d, Math.abs(x[i + k] - y[i + k])); if (d) px++; max = Math.max(max, d) }
  linhas.push({ caso: n, pixelsDiferentes: px, pct: +(100 * px / (640 * 180)).toFixed(2), maxDelta: max, largura: { [a.versao]: a.res[n].largura, [b.versao]: b.res[n].largura } })
}
fs.writeFileSync(path.join(out, 'comparacao.json'), JSON.stringify(linhas, null, 1))
for (const l of linhas) console.log(l.caso.padEnd(16), String(l.pixelsDiferentes).padStart(6), `${l.pct}%`.padStart(7), 'max', String(l.maxDelta).padStart(3), JSON.stringify(l.largura))
