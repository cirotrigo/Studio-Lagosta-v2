/**
 * Passada cirúrgica numa Generation pronta — só o arquivo, sem tocar no banco.
 *
 *   npx dotenv-cli -e .env -- npx tsx scripts/passada-cirurgica.ts <generationId> \
 *     --zona 0,0.86,1,0.97 --instrucao "aumente o texto do rodapé para cerca do dobro do tamanho" \
 *     --texto "Funcionamento - 10h às 22h" --texto "Rua Elesbão Linhares, 52, Praia do Canto."
 */
import { writeFileSync, mkdirSync } from 'node:fs'
import sharp from 'sharp'
import { db } from '../src/lib/db'
import { fetchImageSource } from '../src/lib/ai/fetch-image-source'
import { passadaCirurgica } from '../src/lib/ai/passada-cirurgica'
function arg(n: string) { const i = process.argv.indexOf(`--${n}`); return i >= 0 ? process.argv[i + 1] : undefined }
function args(n: string) { const o: string[] = []; process.argv.forEach((a, i) => { if (a === `--${n}` && process.argv[i + 1]) o.push(process.argv[i + 1]) }); return o }
async function main() {
  const id = process.argv[2]
  const [x0, y0, x1, y1] = (arg('zona') ?? '0,0.86,1,0.97').split(',').map(Number)
  const g = await db.generation.findUnique({ where: { id }, select: { resultUrl: true, fieldValues: true } })
  if (!g?.resultUrl) throw new Error('sem arte')
  const peca = (await fetchImageSource(g.resultUrl)).buffer
  const meta = await sharp(peca).metadata()
  const tamanho = (meta.height ?? 0) / (meta.width ?? 1) > 1.5 ? { width: 1088, height: 1936 } : { width: 1088, height: 1360 }
  const r = await passadaCirurgica({
    peca,
    zona: { nome: 'rodapé', x0, y0, x1, y1 },
    instrucao: arg('instrucao') ?? 'aumente o texto do rodapé para cerca do dobro do tamanho, mantendo fonte, cor e alinhamento',
    textosDaZona: args('texto'),
    tamanho,
    quality: (arg('tier') as 'low' | 'medium' | 'high') ?? 'low',
  })
  mkdirSync('.tmp-medicao-estilo-chatgpt/testes-reais', { recursive: true })
  const out = `.tmp-medicao-estilo-chatgpt/testes-reais/cirurgica-${id.slice(-6)}.jpg`
  writeFileSync(out, await sharp(r.buffer).jpeg({ quality: 90 }).toBuffer())
  console.log(`${(r.ms / 1000).toFixed(1)}s · dif fora antes=${r.difForaAntes.toFixed(1)} depois=${r.difForaDepois.toFixed(1)}\n--- prompt ---\n${r.prompt}\n--- ${out}`)
  await db.$disconnect()
}
main().catch((e) => { console.error(e); process.exit(1) })
