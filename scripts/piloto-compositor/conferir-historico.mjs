import { readFileSync, writeFileSync } from 'node:fs'
import sharp from 'sharp'
const root = '.tmp-medicao-compositor'
const snapshot = JSON.parse(readFileSync(`${root}/snapshot.json`))
const resultados = []
for (const c of snapshot.casos) {
  const id = c.projeto.id
  const r = await fetch(c.evidencia.art.imageUrl, { signal: AbortSignal.timeout(30000) })
  if (!r.ok) throw new Error('Preview histórico indisponível')
  const path = `${root}/${id}-historico.png`
  writeFileSync(path, Buffer.from(await r.arrayBuffer()))
  const a = await sharp(path).raw().toBuffer({ resolveWithObject: true })
  const b = await sharp(`${root}/${id}-anterior-0.png`).raw().toBuffer({ resolveWithObject: true })
  resultados.push({ id, dimensoesIguais: JSON.stringify(a.info) === JSON.stringify(b.info), pixelsIguais: a.data.equals(b.data) })
}
writeFileSync(`${root}/comparacao-historica.json`, JSON.stringify(resultados, null, 2))
console.log(`${resultados.filter((r) => r.pixelsIguais).length}/${resultados.length} baselines idênticos pixel a pixel aos previews históricos.`)
