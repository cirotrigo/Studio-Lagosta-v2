/**
 * A leva de setembro da Lagosta Criativa pelo COMPOSITOR — o teste do plano
 * editor-como-usina (§6): mesma copy, mesmas fotos do `dados.py` do canvas,
 * agora pelo editor.
 *
 *   npx tsx scripts/compor-leva-setembro.ts --json <dados.json> --provar 6 [--dias emporio,coronel] [--formato story|feed]
 *   npx tsx scripts/compor-leva-setembro.ts --json <dados.json> --confirmar [--dias ...] [--formato ...]
 *
 * --provar N   compõe as N primeiras peças EM MEMÓRIA e grava uma folha de
 *              contato (`.tmp-leva-prova.png`) — nada no banco.
 * --confirmar  compõe e GRAVA cada peça (Page + Generation + Blob) no
 *              projeto 8, em série, localmente. É o teste real.
 * --fila       em vez de compor aqui, enfileira (o cron de produção executa).
 *
 * As fotos saem de `design-canvas/lagosta-setembro/fotos/` e sobem para o
 * Blob em `compor/lagosta-setembro/<arquivo>` (idempotente).
 */
import 'dotenv/config'
import * as fs from 'fs'
import * as path from 'path'

import { put, head } from '@vercel/blob'

import { db } from '@/lib/db'
import { comporPeca } from '@/lib/compositor/compor'
import { enfileirarPeca } from '@/lib/compositor/fila'
import type { SpecDePeca } from '@/lib/compositor/spec'

const PROJETO = 8
const PASTA_FOTOS = path.resolve('design-canvas/lagosta-setembro/fotos')

interface Slide { foto: string; pre: string; h: string[]; a: string[]; cta?: string }
interface Dia { dia: string; cliente: string; slug: string; capa: string; carrossel: Slide[]; stories: Slide[]; legenda: string }

function arg(nome: string): string | null {
  const i = process.argv.indexOf(nome)
  return i >= 0 ? process.argv[i + 1] ?? null : null
}

async function subirFoto(arquivo: string): Promise<string> {
  const caminho = path.join(PASTA_FOTOS, arquivo)
  if (!fs.existsSync(caminho)) throw new Error(`foto não encontrada: ${caminho}`)
  const destino = `compor/lagosta-setembro/${arquivo}`
  try {
    const existente = await head(`https://2rhsgfleozgl5jbm.public.blob.vercel-storage.com/${destino}`)
    if (existente?.url) return existente.url
  } catch {
    /* não existe ainda */
  }
  const blob = await put(destino, fs.readFileSync(caminho), { access: 'public', contentType: 'image/jpeg', addRandomSuffix: false, allowOverwrite: true })
  return blob.url
}

function specDoSlide(d: Dia, s: Slide, formato: 'story' | 'feed', arquivo: string, url: string, quando: string, indice: string): SpecDePeca {
  const blocos: SpecDePeca['blocos'] = [
    { papel: 'pre', linhas: [s.pre] },
    { papel: 'headline', linhas: s.h },
    { papel: 'apoio', linhas: s.a },
  ]
  if (s.cta) blocos.push({ papel: 'cta', linhas: [s.cta] })
  return {
    projectId: PROJETO,
    formato,
    foto: { url },
    blocos,
    nome: `${d.cliente} — ${indice} (${arquivo})`,
    tema: d.cliente,
    quando,
  }
}

async function folhaDeContato(provas: Array<{ png: Buffer; rotulo: string }>, saida: string) {
  const sharp = (await import('sharp')).default
  const w = 360
  const cols = Math.min(4, provas.length)
  const linhas = Math.ceil(provas.length / cols)
  const alturas = await Promise.all(provas.map(async (p) => { const m = await sharp(p.png).metadata(); return Math.round((w * (m.height ?? 1920)) / (m.width ?? 1080)) }))
  const h = Math.max(...alturas)
  const composites = await Promise.all(
    provas.map(async (p, i) => ({
      input: await sharp(p.png).resize(w).png().toBuffer(),
      left: (i % cols) * (w + 12) + 12,
      top: Math.floor(i / cols) * (h + 12) + 12,
    })),
  )
  await sharp({ create: { width: cols * (w + 12) + 12, height: linhas * (h + 12) + 12, channels: 3, background: '#222' } })
    .composite(composites)
    .png()
    .toFile(saida)
}

async function main() {
  const json = arg('--json')
  if (!json) throw new Error('use --json <dados.json>')
  const dados = JSON.parse(fs.readFileSync(json, 'utf8')) as { H_STORY: string[]; H_FEED: string; DIAS: Dia[] }
  const provar = arg('--provar') ? Number(arg('--provar')) : 0
  const confirmar = process.argv.includes('--confirmar')
  const fila = process.argv.includes('--fila')
  const dias = arg('--dias')?.split(',').map((s) => s.trim()) ?? null
  const formatoFiltro = arg('--formato') as 'story' | 'feed' | null

  const pecas: Array<{ spec: SpecDePeca; arquivo: string }> = []
  for (const d of dados.DIAS) {
    if (dias && !dias.includes(d.slug)) continue
    if (!formatoFiltro || formatoFiltro === 'story') {
      for (const [i, s] of d.stories.entries()) {
        const arquivo = `${d.slug}-st${i + 1}.jpg`
        const url = await subirFoto(arquivo)
        pecas.push({ spec: specDoSlide(d, s, 'story', arquivo, url, `${d.dia}T${dados.H_STORY[i] ?? '12:00'}:00-03:00`, `story ${i + 1}`), arquivo })
      }
    }
    if (!formatoFiltro || formatoFiltro === 'feed') {
      for (const [i, s] of d.carrossel.entries()) {
        const arquivo = `${d.slug}-s${i + 2}.jpg`
        const url = await subirFoto(arquivo)
        pecas.push({ spec: specDoSlide(d, s, 'feed', arquivo, url, `${d.dia}T${dados.H_FEED}:00-03:00`, `slide ${i + 2}`), arquivo })
      }
    }
  }
  console.log(`${pecas.length} peça(s) na leva${dias ? ` (dias: ${dias.join(', ')})` : ''}${formatoFiltro ? ` (${formatoFiltro})` : ''}`)

  if (provar > 0) {
    const provas: Array<{ png: Buffer; rotulo: string }> = []
    for (const p of pecas.slice(0, provar)) {
      const t0 = Date.now()
      const r = await comporPeca(p.spec, { provar: true })
      const d = r.diagnostico
      console.log(`  ${p.arquivo}: ${d.posicao.ancora}/${d.posicao.alinha}@${d.posicao.crop} halo ${d.halos.map((h) => h.tinta).join('/')} logo ${d.logo?.canto ?? '-'} ${d.contraste?.every((c) => c.ok) ? 'contraste ok' : 'contraste FORA'} (${((Date.now() - t0) / 1000).toFixed(1)}s)${d.avisos.length ? ` — ${d.avisos.join(' · ')}` : ''}`)
      provas.push({ png: r.prova!, rotulo: p.arquivo })
    }
    const saida = arg('--saida') ?? '.tmp-leva-prova.png'
    await folhaDeContato(provas, saida)
    console.log(`folha de contato: ${saida}`)
    return
  }

  if (fila) {
    for (const p of pecas) {
      const r = await enfileirarPeca(p.spec)
      console.log(`  enfileirada ${p.arquivo} → ${r.generationId}`)
    }
    return
  }

  if (!confirmar) {
    console.log('Dry-run: nada composto. Use --provar N, --confirmar ou --fila.')
    return
  }

  const t0 = Date.now()
  let ok = 0
  const falhas: string[] = []
  for (const p of pecas) {
    try {
      const r = await comporPeca(p.spec)
      const d = r.diagnostico
      ok++
      console.log(`  ✓ ${p.arquivo} → ${r.persistido!.generationId} ${d.posicao.ancora}/${d.posicao.alinha}@${d.posicao.crop}${d.contraste?.every((c) => c.ok) ? '' : ' (contraste fora)'}`)
    } catch (erro) {
      const msg = erro instanceof Error ? erro.message : String(erro)
      falhas.push(`${p.arquivo}: ${msg}`)
      console.log(`  ✗ ${p.arquivo}: ${msg}`)
    }
  }
  console.log(`\n${ok} composta(s), ${falhas.length} falha(s) em ${Math.round((Date.now() - t0) / 1000)}s`)
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(() => db.$disconnect())
