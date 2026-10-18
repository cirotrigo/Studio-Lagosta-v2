// argv: <saida>. Compara 0.1.84 e 1.0.11 contra o Chromium e entre si: pixels diferentes, maior delta por canal,
// e a "massa" da sombra (soma de escurecimento sobre o branco, em luma) — qual versão escurece como o Chromium.
const [out] = process.argv.slice(2)
const fs = require('node:fs'), path = require('node:path')
const { W, H, CENARIOS } = require('./sombras-cenarios.js')
const ler = (r, n) => fs.readFileSync(path.join(out, `${r}-${n}.rgba`))
const dif = (a, b) => { let px = 0, max = 0; for (let i = 0; i < a.length; i += 4) { let d = 0; for (let k = 0; k < 3; k++) d = Math.max(d, Math.abs(a[i + k] - b[i + k])); if (d) px++; max = Math.max(max, d) } return { px, pct: +(100 * px / (W * H)).toFixed(2), max } }
const massa = (a) => { let s = 0; for (let i = 0; i < a.length; i += 4) s += 255 - (0.299 * a[i] + 0.587 * a[i + 1] + 0.114 * a[i + 2]); return Math.round(s) }
const linhas = []
for (const c of CENARIOS) {
  const ch = ler('chromium', c.nome), v0 = ler('napi-0.1.84', c.nome), v1 = ler('napi-1.0.11', c.nome)
  linhas.push({ cenario: c.nome, '0.1.84×chromium': dif(v0, ch), '1.0.11×chromium': dif(v1, ch), '0.1.84×1.0.11': dif(v0, v1), massa: { chromium: massa(ch), '0.1.84': massa(v0), '1.0.11': massa(v1) } })
}
fs.writeFileSync(path.join(out, 'comparacao.json'), JSON.stringify(linhas, null, 2))
for (const l of linhas) console.log([l.cenario.padEnd(28), ...['0.1.84×chromium', '1.0.11×chromium', '0.1.84×1.0.11'].map((k) => `${k} ${String(l[k].pct).padStart(6)}% max ${String(l[k].max).padStart(3)}`), `massa ch ${l.massa.chromium} v0 ${l.massa['0.1.84']} v1 ${l.massa['1.0.11']}`].join(' | '))
