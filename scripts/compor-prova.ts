/**
 * Prova do compositor: uma spec (JSON) → PNG + diagnóstico, SEM gravar nada.
 *
 *   npx tsx scripts/compor-prova.ts spec.json [saida.png]
 *   npx tsx scripts/compor-prova.ts --exemplo 8 [saida.png]   # spec de exemplo da Lagosta
 *
 * Roda contra o banco do `.env` para ler a assinatura e as fontes; escreve
 * só o PNG no caminho pedido (default: ./.tmp-prova.png).
 */
import 'dotenv/config'
import * as fs from 'fs'

import { db } from '@/lib/db'
import { comporPeca } from '@/lib/compositor/compor'

async function main() {
  const args = process.argv.slice(2)
  let spec: unknown
  let saida = '.tmp-prova.png'
  if (args[0] === '--exemplo') {
    spec = {
      projectId: Number(args[1] ?? 8),
      formato: 'story',
      foto: { url: args[3] ?? 'https://images.unsplash.com/photo-1504674900247-0877df9cc836?w=1600' },
      blocos: [
        { papel: 'pre', linhas: ['Produção de conteúdo'] },
        { papel: 'headline', linhas: ['Foto Nova a Cada', 'Quinze Dias'] },
        { papel: 'apoio', linhas: ['O executivo do Empório Fonseca muda', 'de cardápio, a produção acompanha.'] },
        { papel: 'cta', linhas: ['Conheça nossos pacotes'] },
      ],
      tema: 'exemplo',
    }
    if (args[2]) saida = args[2]
  } else {
    spec = JSON.parse(fs.readFileSync(args[0], 'utf8'))
    if (args[1]) saida = args[1]
  }
  const t0 = Date.now()
  const r = await comporPeca(spec, { provar: true })
  fs.writeFileSync(saida, r.prova!)
  const d = r.diagnostico
  console.log(`prova em ${saida} (${((Date.now() - t0) / 1000).toFixed(1)}s)`)
  console.log(`variante: ${d.assinatura.variante ?? '(única)'} — ${d.assinatura.motivoDaVariante ?? 'sem motivo registrado'}`)
  console.log(`posição: ${d.posicao.ancora}/${d.posicao.alinha}, corte ${d.posicao.crop} — ${d.posicao.motivo}`)
  console.log(`assunto: ${d.assuntoOrigem} ${d.assunto ? JSON.stringify(d.assunto) : ''}`)
  console.log(`halos: ${d.halos.map((h) => `${h.grupo} tinta ${h.tinta} (luz ${Math.round(h.luz)}, alvo ${h.alvo}, necessidade ${h.necessidade})`).join(' | ')}`)
  console.log(`logo: ${d.logo ? `${d.logo.canto} tinta ${d.logo.tinta}` : 'nenhuma'}`)
  console.log(`blocos: ${d.blocos.map((b) => `${b.papel} ${b.width}x${b.height}${b.escala < 1 ? ` (${Math.round(b.escala * 100)}%)` : ''}`).join(' | ')}`)
  if (d.contraste) console.log(`contraste: ${d.contraste.map((c) => `${c.grupo} p98 ${c.p98SemHalo}→${c.p98ComHalo} alvo ${c.alvo} ${c.ok ? 'ok' : 'FORA'}`).join(' | ')}`)
  if (d.avisos.length) console.log(`avisos:\n  - ${d.avisos.join('\n  - ')}`)
  console.log(`candidatos:\n  ${d.candidatos.slice(0, 6).map((c) => `${c.ancora}/${c.alinha}@${c.crop} ${c.pontuacao}${c.descartado ? ' (descartado)' : ''} — ${c.motivo}`).join('\n  ')}`)
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(() => db.$disconnect())
