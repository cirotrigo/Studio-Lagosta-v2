/**
 * Amostras do compositor sem halo — gradiente de leitura e destaque com
 * [colchetes] — UMA story por cliente, para o Ciro revisar no editor ANTES de
 * o código ir para produção (pedido de 11/09/2026: "deixe travado no estúdio
 * para eu aprovar abrindo no editor; se precisar de ajuste eu faço os ajustes
 * e salvo para você ver e corrigir").
 *
 *   npx tsx scripts/amostras-gradiente-e-destaque.ts --provar [--saida dir]   # só PNG local, nada gravado
 *   npx tsx scripts/amostras-gradiente-e-destaque.ts --gravar                 # grava no Studio
 *   npx tsx scripts/amostras-gradiente-e-destaque.ts --gravar --so 1,3        # só alguns clientes
 *
 * Cada amostra parte da última story composta daquele cliente (mesma foto,
 * mesma copy, mesma variante) e troca só as linhas em que o destaque foi
 * marcado. No `--gravar`:
 *  - a página vai para uma pasta PRÓPRIA do cliente ("AMOSTRA · Gradiente e
 *    destaque — não agendar"), fora das pastas da semana;
 *  - nenhum post é criado;
 *  - o uso da foto é DESFEITO (a amostra não pode empurrar a foto para o fim do
 *    rodízio de quem vai compor a semana de verdade).
 */
import 'dotenv/config'
import * as fs from 'fs'
import * as path from 'path'

import { db } from '@/lib/db'
import { comporPeca } from '@/lib/compositor/compor'
import { getPublicAppUrl } from '@/lib/creatives/persist'

const TAG_DA_PASTA = 'amostra-gradiente-2026-09-11'
const NOME_DA_PASTA = 'AMOSTRA · Gradiente e destaque — não agendar'

type Papel = 'pre' | 'headline' | 'apoio' | 'cta' | 'servico'

/** A última story composta de cada cliente e as linhas que ganham [destaque]. */
const AMOSTRAS: Array<{ projectId: number; cliente: string; generationId: string; marcas: Partial<Record<Papel, string[]>> }> = [
  { projectId: 1, cliente: 'Real Gelateria', generationId: 'cmtvq9bcu001usw1rtyemi9ao', marcas: { apoio: ['Seu milk-shake', 'vem [em dobro].'] } },
  { projectId: 2, cliente: 'O Quintal Parrilla', generationId: 'cmttho6nw000csw0inqrgyi0r', marcas: { apoio: ['Junta a [galera]'] } },
  { projectId: 3, cliente: 'TERO', generationId: 'cmtuv8kvb005jl404c1i9mr1p', marcas: { apoio: ['TEMPO DE [DESACELERAR]', 'SEM OLHAR O RELÓGIO'] } },
  { projectId: 4, cliente: 'Seu Quinto', generationId: 'cmtthsxnf0018sw0il3byxr30', marcas: { apoio: ['Venha pro [boteco]'] } },
  { projectId: 5, cliente: 'Bacana', generationId: 'cmtuve8m6006xl404bkv1dzjb', marcas: { headline: ['Do [300g]', 'ao kilo'] } },
  { projectId: 6, cliente: 'Espeto Gaúcho', generationId: 'cmtthr4nc000wsw0i4gggzh4l', marcas: { cta: ['Vem pro [Espeto]!'] } },
  { projectId: 7, cliente: 'By Rock', generationId: 'cmtthnpk00007sw0irm2tf46p', marcas: { cta: ['Chama a [galera]'] } },
  { projectId: 8, cliente: 'Lagosta Criativa', generationId: 'cmtngg3bp000bsw14qxj6ywn4', marcas: { apoio: ['Espeto, panela e acompanhamentos,', 'na [luz do salão].'] } },
  { projectId: 11, cliente: 'Wine Vix', generationId: 'cmtthtdzn001dsw0in0vbtv1k', marcas: { headline: ['Uma Boa', '[Pausa]'] } },
  { projectId: 12, cliente: 'Empório Fonseca', generationId: 'cmtths7wl0011sw0ianb7o3cq', marcas: { headline: ['Sua [mesa] no', 'Empório Fonseca'] } },
]

function argumento(nome: string): string | null {
  const i = process.argv.indexOf(nome)
  return i >= 0 ? process.argv[i + 1] ?? null : null
}

async function specDaAmostra(a: (typeof AMOSTRAS)[number]) {
  const g = await db.generation.findUnique({ where: { id: a.generationId }, select: { projectId: true, fieldValues: true } })
  const original = (g?.fieldValues as { spec?: Record<string, unknown> } | null)?.spec
  if (!g || g.projectId !== a.projectId || !original) throw new Error(`${a.cliente}: a peça ${a.generationId} não tem spec do compositor`)
  const blocos = (original.blocos as Array<{ papel: Papel; linhas: string[] }>).map((b) => (a.marcas[b.papel] ? { ...b, linhas: a.marcas[b.papel]! } : b))
  const faltou = (Object.keys(a.marcas) as Papel[]).filter((p) => !blocos.some((b) => b.papel === p))
  if (faltou.length > 0) throw new Error(`${a.cliente}: a peça não tem ${faltou.join(', ')} para destacar`)
  const preferencias = { ...((original.preferencias as Record<string, unknown> | undefined) ?? {}) }
  delete preferencias.tratamentoDeTexto
  return {
    projectId: a.projectId,
    formato: original.formato,
    foto: original.foto,
    blocos,
    ...(Object.keys(preferencias).length > 0 ? { preferencias } : {}),
    ...(original.tema ? { tema: original.tema } : {}),
    nome: `AMOSTRA gradiente e destaque — ${a.cliente}`,
  }
}

async function pastaDaAmostra(projectId: number, userId: string) {
  const existente = await db.template.findFirst({ where: { projectId, tags: { has: TAG_DA_PASTA } }, select: { id: true } })
  if (existente) return existente
  return db.template.create({
    data: { name: NOME_DA_PASTA, type: 'STORY', dimensions: '1080x1920', designData: {}, tags: ['amostra', TAG_DA_PASTA], projectId, createdBy: userId },
    select: { id: true },
  })
}

async function main() {
  const gravar = process.argv.includes('--gravar')
  const provar = process.argv.includes('--provar')
  if (gravar === provar) throw new Error('Use --provar (só PNG local) ou --gravar (grava no Studio).')
  const so = argumento('--so')?.split(',').map(Number) ?? null
  const saida = argumento('--saida') ?? '.tmp-amostras'
  if (provar) fs.mkdirSync(saida, { recursive: true })

  for (const a of AMOSTRAS.filter((x) => !so || so.includes(x.projectId))) {
    const t0 = Date.now()
    try {
      const spec = await specDaAmostra(a)
      const r = await comporPeca(spec, { provar })
      const d = r.diagnostico
      const resumo = [
        `variante ${d.assinatura.variante ?? '(única)'}`,
        `posição ${d.posicao.ancora}/${d.posicao.alinha}`,
        `gradientes ${(d.gradientes ?? []).map((gr) => `${gr.borda} força ${gr.forca} altura ${gr.altura} ${gr.cor}`).join(' + ') || 'nenhum'}`,
        `destaque em ${d.blocos.filter((b) => b.destacado).map((b) => b.papel).join(', ') || 'nenhum'}`,
        `contraste ${d.contraste?.map((c) => `${c.grupo.slice(0, 14)} ${c.ok ? 'ok' : 'FORA'}`).join(' ') ?? '-'}`,
      ].join(' | ')

      if (provar) {
        const arquivo = path.join(saida, `${a.projectId}-${a.cliente.replace(/\s+/g, '-').toLowerCase()}.png`)
        fs.writeFileSync(arquivo, r.prova!)
        console.log(`✓ ${a.cliente} (${((Date.now() - t0) / 1000).toFixed(1)}s) → ${arquivo}\n  ${resumo}${d.avisos.length ? `\n  avisos: ${d.avisos.join(' || ')}` : ''}`)
        continue
      }

      const p = r.persistido!
      const projeto = await db.project.findUnique({ where: { id: a.projectId }, select: { userId: true } })
      const pasta = await pastaDaAmostra(a.projectId, projeto!.userId)
      await db.page.update({ where: { id: p.pageId }, data: { templateId: pasta.id } })
      await db.generation.update({ where: { id: p.generationId }, data: { templateId: pasta.id } })
      const usos = await db.photoUsage.deleteMany({ where: { generationId: p.generationId } })
      console.log(`✓ ${a.cliente} (${((Date.now() - t0) / 1000).toFixed(1)}s)\n  editor: ${getPublicAppUrl()}/templates/${pasta.id}/editor\n  arte: ${p.url}\n  generationId ${p.generationId} · pageId ${p.pageId} · usos de foto desfeitos: ${usos.count}\n  ${resumo}${d.avisos.length ? `\n  avisos: ${d.avisos.join(' || ')}` : ''}`)
    } catch (erro) {
      console.log(`✗ ${a.cliente}: ${erro instanceof Error ? erro.message : String(erro)}`)
    }
  }
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(() => db.$disconnect())
