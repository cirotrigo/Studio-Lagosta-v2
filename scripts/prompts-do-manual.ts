/**
 * Escreve o PROMPT DO MANUAL de cada cliente em `.tmp-medicao-estilo-chatgpt/
 * prompts/<id>.txt` (para ler e editar) e, com `--gerar`, testa cada um direto
 * na API do gpt-image: foto + manual do projeto + prompt, tier low. Não toca
 * no banco nem em crédito — só na fatura da OpenAI (~US$ 0,01 por peça).
 *
 * Uso:
 *   npx dotenv-cli -e .env -- npx tsx scripts/prompts-do-manual.ts
 *   npx dotenv-cli -e .env -- npx tsx scripts/prompts-do-manual.ts --gerar
 */
import 'dotenv/config'
import { promises as fs } from 'node:fs'
import path from 'node:path'
import { db } from '../src/lib/db'
import { loadBrandContext } from '../src/lib/brand/brand-context'
import { lerEstiloDasReferencias } from '../src/lib/brand/estilo-das-referencias'
import { montarPromptDoManual } from '../src/lib/ai/prompt-do-manual'
import { runImageEdit } from '../src/lib/ai/openai-image-client'

const drive = (id: string) => `https://lh3.googleusercontent.com/d/${id}=w1920`
const SAIDA = path.join(process.cwd(), '.tmp-medicao-estilo-chatgpt', 'prompts')

/** Foto + copy de teste por cliente. A Vix usa as duas fotos e a copy do prompt do Ciro. */
const CASOS: Array<{ id: number; rot: string; foto: string; copy: string[] }> = [
  { id: 11, rot: 'vix-tartare', foto: '1BhYMFsQSftAB5aBMuK-UlEgqQskYdf1L', copy: ['Happy Hour', 'Brinde com descontos especiais em vinhos e entradas selecionadas.', 'Seg a Sáb - 16h às 19h'] },
  { id: 11, rot: 'vix-taca', foto: '1zpOBaNIykkJH0-SzEORiJ_RsVAXpbMzs', copy: ['Happy Hour', 'Brinde com descontos especiais em vinhos e entradas selecionadas.', 'Seg a Sáb - 16h às 19h'] },
  { id: 1, rot: 'real', foto: '1dvQFfvSgJplwxIAb1IWHE8EDrg88g76z', copy: ['Feriado merece sabores Real', 'Croissant, quentinho para desacelerar'] },
  { id: 2, rot: 'quintal', foto: '1HPHnduiUK-EZ5QYErsZjpC1G5hcY8vHZ', copy: ['Costela na mesa, brinde com os amigos!', 'Almoço de feriado no seu Quintal'] },
  { id: 3, rot: 'tero', foto: '', copy: ['Almoço executivo', 'O Jeito Tero de iniciar a semana', 'De terça a sexta, das 11h30 às 16h'] },
  { id: 4, rot: 'seu-quinto', foto: '1fZRM1clfHUqLpIYZJ-yhNPC40oiD9J0U', copy: ['Pra beliscar', 'O amargo que a gente ama vem pro Seu Quinto', 'Fígado com jiló do jeito certo'] },
  { id: 5, rot: 'bacana', foto: '', copy: ['Domingo pede aquele churrasco Bacana', 'Fartura na brasa para a família.'] },
  { id: 7, rot: 'by-rock', foto: '', copy: ['Bora!', 'Blend, cheddar e bacon. É o Oldfashion.', 'Todo dia, das 16h às 20h, até 50% OFF.'] },
  { id: 12, rot: 'emporio', foto: '1xGVVSSrEZ4BnFr5_AjOjnNhYfW88ZBMr', copy: ['Pizza artesanal saindo do forno', 'Quarta da Pizza', 'Toda quarta, das 19h às 22h'] },
]

async function baixar(url: string, name: string, mime: 'image/jpeg' | 'image/png') {
  const r = await fetch(url)
  if (!r.ok) throw new Error(`${name}: HTTP ${r.status}`)
  return { buffer: Buffer.from(await r.arrayBuffer()), name, mimeType: mime }
}

async function main() {
  const gerar = process.argv.includes('--gerar')
  await fs.mkdir(SAIDA, { recursive: true })
  // Fotos que faltam nos casos: a foto de referência do último arte-ia do projeto.
  for (const c of CASOS) {
    if (c.foto) continue
    const gs = await db.generation.findMany({ where: { projectId: c.id, status: 'COMPLETED' }, orderBy: { createdAt: 'desc' }, take: 300, select: { fieldValues: true } })
    for (const g of gs) {
      const refs = (g.fieldValues as Record<string, unknown>)?.referencias as Array<{ role: string; driveFileId?: string }> | undefined
      const sub = refs?.find((r) => r.role === 'subject' && r.driveFileId)
      if (sub?.driveFileId) { c.foto = sub.driveFileId; break }
    }
  }
  const so = process.argv.find((a) => a.startsWith('--so='))?.slice(5).split(',')
  const log: string[] = []
  for (const c of CASOS) {
    if (so && !so.includes(c.rot)) continue
    const brand = await loadBrandContext(c.id)
    if (!brand) continue
    const dna = await db.brandDNA.findUnique({ where: { projectId: c.id }, select: { estiloDasReferencias: true } })
    const estilo = lerEstiloDasReferencias(dna?.estiloDasReferencias)
    const prompt = montarPromptDoManual({ brand, estilo, copy: c.copy })
    await fs.writeFile(path.join(SAIDA, `${c.rot}.txt`), prompt)
    console.log(`${c.rot.padEnd(12)} ${prompt.length} chars → prompts/${c.rot}.txt`)
    if (!gerar) continue
    if (!c.foto || !brand.brandManualUrl) { log.push(`${c.rot}: sem foto ou sem manual`); continue }
    const t = Date.now()
    try {
      const [foto, manual] = await Promise.all([baixar(drive(c.foto), 'foto.jpg', 'image/jpeg'), baixar(brand.brandManualUrl, 'manual.png', 'image/png')])
      await fs.writeFile(path.join(SAIDA, `foto-${c.rot}.jpg`), foto.buffer)
      const png = await runImageEdit({ images: [foto, manual], prompt, size: '1088x1936', quality: 'low', timeoutMs: 280000 })
      await fs.writeFile(path.join(SAIDA, `E-${c.rot}.png`), png)
      log.push(`${c.rot}: OK ${Math.round((Date.now() - t) / 1000)}s`)
    } catch (e) {
      log.push(`${c.rot}: FALHOU — ${e instanceof Error ? e.message : e}`)
    }
    await fs.writeFile(path.join(SAIDA, 'geracao.log'), log.join('\n'))
  }
  if (gerar) console.log(log.join('\n'))
}

main()
  .catch((e) => { console.error(e); process.exitCode = 1 })
  .finally(() => db.$disconnect())
