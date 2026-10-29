/**
 * MEDIÇÃO (só leitura) do efeito das margens de 29/10/2026 sobre as artes que já existem — antes de integrar o PR
 * "margens de 29/10" (decisão do owner: Story 64/160/160, Feed 64/72/72; piso da interface do Story 160/160).
 *
 * Para cada página de post AGENDADO (SCHEDULED, com `pageId`) e de cada arte dos ÚLTIMOS 30 DIAS (Generation com
 * `fieldValues.pageId`), mede os textos UMA vez (fontes do projeto + medidor do servidor) e confere as MESMAS
 * métricas, pela MESMA regra do revisor (a tinta de cada bloco, `blocosDeTexto`), contra as margens antigas (revisor
 * 70/120/100; piso 188/224) e as novas (`limitesDoEditor`; piso 160/160). Conta quantas peças mudam de aviso em
 * `fora-da-area-segura` e de veredito no piso da interface; o que não dá para medir sai contado à parte.
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
import { measureTextLayers } from '@/lib/creatives/text-geometry'
import { foraDaInterface } from '@/lib/creatives/revisao/gate'
import { blocosDeTexto, limitesDoEditor } from '@/lib/creatives/revisao/regras'
import { fontesQueFaltam } from '@/lib/creatives/revisao/revisar-arte'
import { formatoDaPaginaGravada } from '@/lib/compositor/formato'
import type { Layer } from '@/types/template'

/** As margens que o revisor conferia ATÉ 29/10 (eram `CANVAS_MARGIN` 70/120/100); só existem aqui, para a comparação. */
const ANTES = { top: 120, bottom: 100, left: 70, right: 70 }
/** A folga da regra `fora-da-area-segura` do revisor (regras.ts): passar menos que 2 px não é invasão. */
const FOLGA = 2

/** A MESMA regra do revisor: a TINTA de cada BLOCO de texto (não a caixa) contra as quatro linhas (Codex R1). */
function blocosFora(camadas: Layer[], metricas: ReturnType<typeof measureTextLayers>, lim: { topo: number; base: number; esquerda: number; direita: number }): string[] {
  return blocosDeTexto(camadas, metricas)
    .filter((b) => {
      const t = b.tinta
      return lim.topo - t.y > FOLGA || t.y + t.height - lim.base > FOLGA || lim.esquerda - t.x > FOLGA || t.x + t.width - lim.direita > FOLGA
    })
    .map((b) => b.textos.map((x) => x.camada.name).join(' + '))
}
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
  const fontesComFalha = new Set<number>()
  const resumo = { medidas: 0, naoMedidas: 0, aproximadas: 0, falhas: 0, areaSeguraMudou: 0, ganhouAviso: 0, perdeuAviso: 0, pisoMudou: 0, pisoPassouAReprovar: 0, pisoPassouAAceitar: 0 }
  const detalhes: string[] = []

  for (const l of linhas) {
    try {
      const page = await db.page.findUnique({ where: { id: l.pageId }, select: { id: true, name: true, width: true, height: true, tags: true, layers: true } })
      if (!page) continue
      if (!fontesPorProjeto.has(l.projectId)) {
        try {
          await registerProjectFonts(l.projectId)
        } catch (erro) {
          detalhes.push(`projeto ${l.projectId}: fontes não registradas — ${erro instanceof Error ? erro.message : String(erro)} (as páginas dele contam como NÃO medidas)`)
          fontesComFalha.add(l.projectId)
        }
        fontesPorProjeto.add(l.projectId)
      }
      // Não medida = não conta no resumo (Codex R1): camadas ilegíveis, fontes do projeto sem registro, texto visível que
      // o medidor omitiu (curvo, fitty, auto-resize). Rich text é medido como texto simples — aproximação, dita à parte.
      const lidas = lerCamadas(page.layers)
      if (!lidas.legivel || fontesComFalha.has(l.projectId)) {
        resumo.naoMedidas++
        detalhes.push(`${l.origem} ${l.pageId} (${page.name}): NÃO medida (${!lidas.legivel ? 'camadas ilegíveis' : 'fontes do projeto sem registro'})`)
        continue
      }
      const originais = lidas.camadas as unknown as Layer[]
      const camadas = originais.map((c) => (c.type === 'rich-text' ? ({ ...c, type: 'text', richTextStyles: undefined } as Layer) : c))
      const canvas = { width: page.width, height: page.height }
      const formato = formatoDaPaginaGravada(page)
      const metricas = measureTextLayers(camadas, medir)
      const medidos = new Set(metricas.map((m) => m.layerId))
      const semMetrica = camadas.filter((c) => c.type === 'text' && c.visible !== false && String(c.content ?? '').trim() && !medidos.has(c.id))
      if (semMetrica.length > 0) {
        resumo.naoMedidas++
        detalhes.push(`${l.origem} ${l.pageId} (${page.name}): NÃO medida (texto sem métrica: ${semMetrica.map((c) => c.name).join(', ')})`)
        continue
      }
      // `registerProjectFonts` só loga a falha de uma fonte (não lança): a conferência real é por família carregada
      const faltam = await fontesQueFaltam(camadas)
      if (faltam.length > 0) {
        resumo.naoMedidas++
        detalhes.push(`${l.origem} ${l.pageId} (${page.name}): NÃO medida (fonte ausente: ${faltam.map((f) => f.familia).join(', ')} — a métrica sairia com fonte substituta)`)
        continue
      }
      // Rich text é medido como texto simples: aproximação — dita à parte e FORA dos contadores de impacto
      const aproximada = originais.some((c) => c.type === 'rich-text' && c.visible !== false)
      const s = canvas.width / 1080
      const antes = blocosFora(camadas, metricas, { topo: ANTES.top * s, base: canvas.height - ANTES.bottom * s, esquerda: ANTES.left * s, direita: canvas.width - ANTES.right * s })
      const depois = blocosFora(camadas, metricas, limitesDoEditor(canvas))
      const a = antes.length > 0
      const d = depois.length > 0
      if (aproximada) {
        resumo.aproximadas++
        if (a !== d) detalhes.push(`${l.origem} ${l.pageId} (${page.name}, ${formato}): APROXIMADA (rich text) — área segura ${a ? 'avisava' : 'ok'} → ${d ? 'avisa' : 'ok'}; não conta no resumo`)
        continue
      }
      resumo.medidas++
      if (a !== d) {
        resumo.areaSeguraMudou++
        if (d) resumo.ganhouAviso++
        else resumo.perdeuAviso++
        detalhes.push(`${l.origem} ${l.pageId} (${page.name}, ${formato}): área segura ${a ? `avisava (${antes.join('; ')})` : 'ok'} → ${d ? `avisa (${depois.join('; ')})` : 'ok'}${l.laterPostId ? ' [laterPostId: INTOCÁVEL]' : ''}`)
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
