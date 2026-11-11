/**
 * Mede a recomposição da foto (`src/lib/ai/preservar-foto.ts`) num par
 * origem × peça gerada que já existe em disco. Não chama IA nem banco.
 *
 * Escreve, ao lado da peça gerada (ou em <pastaDeSaida>), a peça recomposta e
 * uma folha: origem | gerada | recomposta | onde a recomposta difere da origem.
 *
 * Uso: npx tsx scripts/medir-preservacao-da-foto.ts <origem> <gerada> [pastaDeSaida] [--cores=#EF6A00,#FFFFFF] [--folgado]
 */
import sharp from 'sharp'
import { readFileSync, writeFileSync } from 'fs'
import path from 'path'
import { deslocamentoDaFoto, preservarFotoDaOrigem } from '../src/lib/ai/preservar-foto'

async function main() {
  const folgado = process.argv.includes('--folgado')
  const cores = process.argv.find((x) => x.startsWith('--cores='))?.slice(8).split(',') ?? []
  const [origem, gerada, saida] = process.argv.slice(2).filter((x) => !x.startsWith('--'))
  if (!origem || !gerada) throw new Error('uso: npx tsx scripts/medir-preservacao-da-foto.ts <origem> <gerada> [pastaDeSaida]')
  const a = readFileSync(origem)
  const b = readFileSync(gerada)
  const t0 = Date.now()
  const f = await preservarFotoDaOrigem(a, b, { coresDaMarca: cores, folgado })
  const d = await deslocamentoDaFoto(a, b)
  const nome = path.basename(gerada).replace(/\.[^.]+$/, '')
  console.log(
    `${nome}: ${Date.now() - t0}ms · máscara ${(f.fracaoDaMascara * 100).toFixed(1)}% em ${f.blocos} bloco(s) · ` +
      `diferença fora da máscara ${f.diferencaForaAntes.toFixed(1)} → ${f.diferencaFora} · ` +
      `assunto ${d.deslocada ? 'DESLOCADO' : 'no lugar'} (${d.deslocados} de ${d.ladrilhos} ladrilhos, maior ${(d.maior * 100).toFixed(1)}%)`,
  )
  const W = 540
  const H = 960
  const ra = await sharp(a).resize(W, H, { fit: 'fill' }).removeAlpha().raw().toBuffer()
  const rf = await sharp(f.buffer).resize(W, H, { fit: 'fill' }).removeAlpha().raw().toBuffer()
  const dif = Buffer.alloc(W * H * 3)
  for (let i = 0; i < W * H * 3; i++) dif[i] = Math.min(255, Math.abs(ra[i] - rf[i]) * 6)
  const quadro = (buf: Buffer) => sharp(buf).resize(W, H, { fit: 'fill' }).png().toBuffer()
  const tiles = [await quadro(a), await quadro(b), await quadro(f.buffer), await sharp(dif, { raw: { width: W, height: H, channels: 3 } }).png().toBuffer()]
  const pasta = saida ?? path.dirname(gerada)
  await sharp({ create: { width: W * 4, height: H, channels: 3, background: '#000' } })
    .composite(tiles.map((input, i) => ({ input, left: i * W, top: 0 })))
    .jpeg({ quality: 85 })
    .toFile(path.join(pasta, `${nome}-folha-recomposta.jpg`))
  writeFileSync(path.join(pasta, `${nome}-recomposta.png`), f.buffer)
}

main().catch((e) => {
  console.error(e.message ?? e)
  process.exitCode = 1
})
