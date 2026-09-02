/**
 * O DIFF DE GEOMETRIA — o que a equipe moveu, encolheu ou realinhou depois
 * que o compositor pousou a peça (F4 do plano editor-como-usina).
 *
 * É o sinal que só o editor produz: a copy o PATCH já capturava; a posição
 * virava autosave e sumia. Compara camada a camada (pelo id) e devolve só o
 * que mudou de forma visível — deslocamento, tamanho da caixa, corpo da
 * fonte, alinhamento, visibilidade. Módulo puro, sem Prisma.
 */

import type { Layer } from '@/types/template'
import { lerCamadas } from '@/lib/posts/page-layers'

export interface DeltaDeCamada {
  id: string
  papel: string | null
  tipo: string
  /** px — positivo = para a direita / para baixo. */
  dx: number
  dy: number
  /** px — da caixa. */
  dw: number
  dh: number
  /** razão depois/antes do fontSize (1 = igual). Só em texto. */
  escalaDaFonte: number | null
  alinhamento: { antes: string; depois: string } | null
  visibilidade: { antes: boolean; depois: boolean } | null
}

export interface DiffDeGeometria {
  /** Não deu para ler um dos lados — nunca vira "não mudou nada". */
  ilegivel: boolean
  mudou: boolean
  deltas: DeltaDeCamada[]
  removidas: string[]
  adicionadas: string[]
}

/** Abaixo disto é ruído de arraste, não decisão. */
const TOLERANCIA_PX = 3
const TOLERANCIA_ESCALA = 0.02

function papelDe(l: Layer): string | null {
  const meta = l.metadata as { compositor?: { papel?: string } } | undefined
  return meta?.compositor?.papel ?? null
}

export function diffDeGeometria(antes: unknown, depois: unknown): DiffDeGeometria {
  const a = lerCamadas(antes)
  const d = lerCamadas(depois)
  if (!a.legivel || !d.legivel) return { ilegivel: true, mudou: false, deltas: [], removidas: [], adicionadas: [] }

  const porIdAntes = new Map((a.camadas as Layer[]).map((l) => [l.id, l]))
  const porIdDepois = new Map((d.camadas as Layer[]).map((l) => [l.id, l]))
  const deltas: DeltaDeCamada[] = []

  for (const [id, la] of porIdAntes) {
    const ld = porIdDepois.get(id)
    if (!ld) continue
    const dx = Math.round((ld.position?.x ?? 0) - (la.position?.x ?? 0))
    const dy = Math.round((ld.position?.y ?? 0) - (la.position?.y ?? 0))
    const dw = Math.round((ld.size?.width ?? 0) - (la.size?.width ?? 0))
    const dh = Math.round((ld.size?.height ?? 0) - (la.size?.height ?? 0))
    const fa = Number(la.style?.fontSize ?? 0)
    const fd = Number(ld.style?.fontSize ?? 0)
    const escalaDaFonte = la.type === 'text' && fa > 0 && fd > 0 ? Number((fd / fa).toFixed(3)) : null
    const alinhaA = String(la.style?.textAlign ?? '')
    const alinhaD = String(ld.style?.textAlign ?? '')
    const visA = la.visible !== false
    const visD = ld.visible !== false

    const moveu = Math.abs(dx) > TOLERANCIA_PX || Math.abs(dy) > TOLERANCIA_PX
    const redimensionou = Math.abs(dw) > TOLERANCIA_PX || Math.abs(dh) > TOLERANCIA_PX
    const reescalou = escalaDaFonte !== null && Math.abs(escalaDaFonte - 1) > TOLERANCIA_ESCALA
    const realinhou = la.type === 'text' && alinhaA !== alinhaD
    const escondeu = visA !== visD
    if (!moveu && !redimensionou && !reescalou && !realinhou && !escondeu) continue

    deltas.push({
      id,
      papel: papelDe(la) ?? papelDe(ld),
      tipo: la.type,
      dx: moveu ? dx : 0,
      dy: moveu ? dy : 0,
      dw: redimensionou ? dw : 0,
      dh: redimensionou ? dh : 0,
      escalaDaFonte: reescalou ? escalaDaFonte : null,
      alinhamento: realinhou ? { antes: alinhaA, depois: alinhaD } : null,
      visibilidade: escondeu ? { antes: visA, depois: visD } : null,
    })
  }

  const removidas = [...porIdAntes.keys()].filter((id) => !porIdDepois.has(id))
  const adicionadas = [...porIdDepois.keys()].filter((id) => !porIdAntes.has(id))
  return {
    ilegivel: false,
    mudou: deltas.length > 0 || removidas.length > 0 || adicionadas.length > 0,
    deltas,
    removidas,
    adicionadas,
  }
}

/** Uma linha por delta, em português — para o log e para a destilação ler. */
export function descreverDiff(diff: DiffDeGeometria): string[] {
  const linhas: string[] = []
  for (const d of diff.deltas) {
    const quem = d.papel ?? d.id
    const partes: string[] = []
    if (d.dx || d.dy) partes.push(`moveu ${d.dx >= 0 ? '+' : ''}${d.dx}px, ${d.dy >= 0 ? '+' : ''}${d.dy}px`)
    if (d.dw || d.dh) partes.push(`caixa ${d.dw >= 0 ? '+' : ''}${d.dw}×${d.dh >= 0 ? '+' : ''}${d.dh}`)
    if (d.escalaDaFonte !== null) partes.push(`fonte ×${d.escalaDaFonte}`)
    if (d.alinhamento) partes.push(`alinhamento ${d.alinhamento.antes} → ${d.alinhamento.depois}`)
    if (d.visibilidade) partes.push(d.visibilidade.depois ? 'religou' : 'escondeu')
    linhas.push(`${quem}: ${partes.join('; ')}`)
  }
  for (const id of diff.removidas) linhas.push(`${id}: removida`)
  for (const id of diff.adicionadas) linhas.push(`${id}: adicionada`)
  return linhas
}
