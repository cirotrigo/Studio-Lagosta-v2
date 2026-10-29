/**
 * MEDIÇÃO (só leitura) do efeito das margens de 29/10/2026 sobre as artes que já existem — antes de integrar o PR
 * "margens de 29/10" (decisão do owner: Story 64/160/160, Feed 64/72/72; piso da interface do Story 160/160).
 *
 * Para cada página de post AGENDADO (SCHEDULED, com `pageId`) e de cada arte dos ÚLTIMOS 30 DIAS (Generation com
 * `fieldValues.pageId`), mede os textos UMA vez (fontes do projeto + medidor do servidor) e confere as MESMAS
 * métricas contra as margens antigas (revisor 70/120/100; piso 188/224) e as novas (`margensDoEditor`; piso
 * 160/160). Conta quantas peças mudam de aviso em `fora-da-area-segura` e de veredito no piso da interface.
 *
 * 🔴 Lê PRODUÇÃO (`@/lib/db` usa o `.env`). Não grava nada. Rodar só com o ok do Ciro no chat:
 *   npx tsx scripts/medir-margens-2026-10-29.ts [--dias 30] [--limite 400]
 * Post com `laterPostId` é intocável em qualquer caso — aqui só é CONTADO.
 */
import 'dotenv/config'

import { db } from '@/lib/db'
import { lerCamadas } from '@/lib/posts/page-layers'
import { registerProjectFonts } from '@/lib/posts/register-project-fonts'
import { createServerTextBoxMeasurer } from '@/lib/creatives/server-text-measurer'
import { foraDaAreaSegura, limitesDaAreaSegura, measureTextLayers } from '@/lib/creatives/text-geometry'
import { foraDaInterface } from '@/lib/creatives/revisao/gate'
import { formatoDaPaginaGravada } from '@/lib/compositor/formato'

/** As margens que o revisor conferia ATÉ 29/10 (eram `CANVAS_MARGIN` 70/120/100); só existem aqui, para a comparação. */
const ANTES = { top: 120, bottom: 100, left: 70, right: 70 }
const PISO_ANTES = { topo: 188, rodape: 224 }
const PISO_DEPOIS = { topo: 160, rodape: 160 }

function arg(nome: string, padrao: number): number {
  const i = process.argv.indexOf(nome)
  const v = i >= 0 ? Number(process.argv[i + 1]) : NaN
  return Number.isFinite(v) ? v : padrao
}

type Linha = { origem: 'agendado' | 'recente'; pageId: string; projectId: number; postId?: string; laterPostId?: string | null }

async function paginasAMedir(dias: number, limite: number): Promise<Linha[]> {
  const agendados = await db.socialPost.findMany({
    where: { status: 'SCHEDULED', pageId: { not: null } },
    select: { id: true, pageId: true, projectId: true, laterPostId: true },
    take: limite,
  })
  const desde = new Date(Date.now() - dias * 86_400_000)
  const recentes = await db.generation.findMany({
    where: { createdAt: { gte: desde } },
    select: { projectId: true, fieldValues: true },
    orderBy: { createdAt: 'desc' },
    take: limite * 4,
  })
  const vistas = new Set<string>()
  const linhas: Linha[] = []
  for (const p of agendados) {
    if (!p.pageId || vistas.has(p.pageId)) continue
    vistas.add(p.pageId)
    linhas.push({ origem: 'agendado', pageId: p.pageId, projectId: p.projectId, postId: p.id, laterPostId: p.laterPostId })
  }
  for (const g of recentes) {
    const pageId = (g.fieldValues as Record<string, unknown> | null)?.pageId
    if (typeof pageId !== 'string' || vistas.has(pageId)) continue
    vistas.add(pageId)
    linhas.push({ origem: 'recente', pageId, projectId: g.projectId })
    if (linhas.length >= limite * 2) break
  }
  return linhas
}

async function main() {
  const dias = arg('--dias', 30)
  const limite = arg('--limite', 400)
  const linhas = await paginasAMedir(dias, limite)
  console.log(`páginas a medir: ${linhas.length} (agendadas ${linhas.filter((l) => l.origem === 'agendado').length}, recentes ${linhas.filter((l) => l.origem === 'recente').length}; com laterPostId: ${linhas.filter((l) => l.laterPostId).length})`)

  const medir = await createServerTextBoxMeasurer()
  const fontesPorProjeto = new Set<number>()
  const resumo = { medidas: 0, falhas: 0, areaSeguraMudou: 0, ganhouAviso: 0, perdeuAviso: 0, pisoMudou: 0, pisoPassouAReprovar: 0, pisoPassouAAceitar: 0 }
  const detalhes: string[] = []

  for (const l of linhas) {
    try {
      const page = await db.page.findUnique({ where: { id: l.pageId }, select: { id: true, name: true, width: true, height: true, tags: true, layers: true } })
      if (!page) continue
      if (!fontesPorProjeto.has(l.projectId)) {
        await registerProjectFonts(l.projectId)
        fontesPorProjeto.add(l.projectId)
      }
      const camadas = lerCamadas(page.layers).map((c) => (c.type === 'rich-text' ? ({ ...c, type: 'text', richTextStyles: undefined } as typeof c) : c))
      const canvas = { width: page.width, height: page.height }
      const formato = formatoDaPaginaGravada(page)
      const metricas = measureTextLayers(camadas, medir)
      const s = canvas.width / 1080
      const antes = foraDaAreaSegura(metricas, { top: ANTES.top * s, bottom: canvas.height - ANTES.bottom * s, left: ANTES.left * s, right: canvas.width - ANTES.right * s })
      const depois = foraDaAreaSegura(metricas, limitesDaAreaSegura(canvas))
      resumo.medidas++
      const a = antes.length > 0
      const d = depois.length > 0
      if (a !== d) {
        resumo.areaSeguraMudou++
        if (d) resumo.ganhouAviso++
        else resumo.perdeuAviso++
        detalhes.push(`${l.origem} ${l.pageId} (${page.name}, ${formato}): área segura ${a ? 'avisava' : 'ok'} → ${d ? 'avisa' : 'ok'} ${d ? depois.map((x) => x.detalhe).join('; ') : ''}${l.laterPostId ? ' [laterPostId: INTOCÁVEL]' : ''}`)
      }
      if (formato === 'story' && canvas.width === 1080 && canvas.height === 1920) {
        const pa = foraDaInterface(camadas, canvas, PISO_ANTES, metricas).length > 0
        const pd = foraDaInterface(camadas, canvas, PISO_DEPOIS, metricas).length > 0
        if (pa !== pd) {
          resumo.pisoMudou++
          if (pd) resumo.pisoPassouAReprovar++
          else resumo.pisoPassouAAceitar++
          detalhes.push(`${l.origem} ${l.pageId} (${page.name}): piso da interface ${pa ? 'reprovava' : 'passava'} → ${pd ? 'reprova' : 'passa'}${l.laterPostId ? ' [laterPostId: INTOCÁVEL]' : ''}`)
        }
      }
    } catch (erro) {
      resumo.falhas++
      detalhes.push(`${l.origem} ${l.pageId}: falhou — ${erro instanceof Error ? erro.message : String(erro)}`)
    }
  }

  console.log(JSON.stringify(resumo, null, 2))
  for (const d of detalhes) console.log(d)
  await db.$disconnect()
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
