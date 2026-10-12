/**
 * Os CAMPOS PREENCHÍVEIS de uma página-modelo — o que o `escolher-modelo`
 * devolve ao agente — e o diagnóstico semântico da página inteira (B1b).
 *
 * Os cinco campos legados (`layerId`, `name`, `type`, `isDynamic`,
 * `currentValue`) não mudam. `semantic` é aditivo e ESTRUTURAL: papel (com a
 * confiança — declarado, inferido, ausente, inválido), slot, por onde o campo
 * pode ser endereçado e os problemas. Nada de texto, URL ou metadata bruta além
 * do `currentValue` que já existia; valor corrompido nunca aparece.
 *
 * Quais camadas viram campo:
 *  - as de sempre: `type === 'text'` e imagem com `isDynamic` (rich-text não);
 *  - mais as que declaram `metadata.slot.id` válido, de qualquer tipo;
 *  - papel inferido SOZINHO nunca faz uma camada entrar.
 *
 * `addressableBy` vem do `resolverAlvo`, não de uma cópia das regras dele: a
 * descoberta promete exatamente o que o preenchimento (B1c) resolverá.
 *
 * `semanticIssues` diagnostica a PÁGINA, inclusive camadas que não viram campo
 * (um slot inválido numa forma, um papel inválido que bloqueia a resolução por
 * papel). Multiplicidade de papel não é problema — está em `occurrences` e
 * `ambiguous`; slot e id de camada repetidos são (o `resolverAlvo` os recusa).
 *
 * Módulo PURO (não importa o banco): `arte-rapida.ts` reexporta.
 */

import { parsePageLayers } from '@/lib/posts/page-layers'
import { descreverAlvos } from '@/lib/semantica/descritores'
import { resolverAlvo } from '@/lib/semantica/resolver-alvo'
import type { OrigemDoPapel } from '@/lib/semantica/ler'
import type { Cardinalidade, SemanticRole } from '@/lib/semantica/papeis'
import type { Layer } from '@/types/template'

export type ProblemaDoCampo =
  | { code: 'ROLE_INVALID'; reason: 'valor' | 'tipo' }
  | { code: 'SLOT_INVALID' }
  | { code: 'SLOT_DUPLICATE'; layerIds: string[] }
  | { code: 'LAYER_ID_DUPLICATE' }

export interface SemanticaDoCampo {
  role: {
    status: 'declared' | 'inferred' | 'absent' | 'invalid'
    value: SemanticRole | null
    origin: OrigemDoPapel | null
    /** Expectativa do vocabulário, nunca validação. */
    expectedCardinality: Cardinalidade | null
    /** Contagem OBSERVADA na página. */
    occurrences: number
    ambiguous: boolean
  }
  slot: { status: 'declared' | 'absent' | 'invalid' | 'duplicate'; id: string | null }
  addressableBy: Array<'slotId' | 'semanticRole' | 'layerId'>
  problems: ProblemaDoCampo[]
}

export interface SlotField {
  layerId: string
  name: string
  type: string
  isDynamic: boolean
  currentValue: string
  semantic: SemanticaDoCampo
}

export type SemanticIssue =
  | { code: 'ROLE_INVALID'; layerIds: string[]; reason: 'valor' | 'tipo' }
  | { code: 'SLOT_INVALID'; layerIds: string[] }
  | { code: 'SLOT_DUPLICATE'; layerIds: string[]; slotId: string }
  | { code: 'LAYER_ID_DUPLICATE'; layerIds: string[]; occurrences: number }

export interface AnaliseDosCampos {
  slotFields: SlotField[]
  semanticIssues: SemanticIssue[]
}

const entraPeloLegado = (l: any) => l?.type === 'text' || (l?.type === 'image' && l?.isDynamic)

export function analisarSlotFields(raw: unknown): AnaliseDosCampos {
  const camadas = parsePageLayers(raw) as Layer[]
  const descritores = descreverAlvos(camadas)

  const porId = new Map<string, number[]>()
  const porSlot = new Map<string, number[]>()
  descritores.forEach((d, i) => {
    porId.set(d.layerId, [...(porId.get(d.layerId) ?? []), i])
    if (d.slot.status === 'valido') porSlot.set(d.slot.slotId, [...(porSlot.get(d.slot.slotId) ?? []), i])
  })
  const idsDe = (indices: number[]) => indices.map((i) => descritores[i].layerId)

  const semanticIssues: SemanticIssue[] = []
  const vistos = new Set<string>()
  descritores.forEach((d) => {
    const repetidos = porId.get(d.layerId)!
    if (repetidos.length > 1 && !vistos.has(`id:${d.layerId}`)) {
      vistos.add(`id:${d.layerId}`)
      semanticIssues.push({ code: 'LAYER_ID_DUPLICATE', layerIds: [d.layerId], occurrences: repetidos.length })
    }
    if (d.papel.status === 'invalido') semanticIssues.push({ code: 'ROLE_INVALID', layerIds: [d.layerId], reason: d.papel.motivo })
    if (d.slot.status === 'invalido') semanticIssues.push({ code: 'SLOT_INVALID', layerIds: [d.layerId] })
    if (d.slot.status === 'valido') {
      const mesmos = porSlot.get(d.slot.slotId)!
      if (mesmos.length > 1 && !vistos.has(`slot:${d.slot.slotId}`)) {
        vistos.add(`slot:${d.slot.slotId}`)
        semanticIssues.push({ code: 'SLOT_DUPLICATE', layerIds: idsDe(mesmos), slotId: d.slot.slotId })
      }
    }
  })

  const slotFields: SlotField[] = []
  descritores.forEach((d, i) => {
    const l = camadas[i] as any
    if (!entraPeloLegado(l) && d.slot.status !== 'valido') return

    const problems: ProblemaDoCampo[] = []
    const idRepetido = porId.get(d.layerId)!.length > 1
    if (idRepetido) problems.push({ code: 'LAYER_ID_DUPLICATE' })

    const p = d.papel
    const role: SemanticaDoCampo['role'] =
      p.status === 'valido'
        ? {
            status: p.origem === 'metadata' ? 'declared' : 'inferred',
            value: p.papel,
            origin: p.origem,
            expectedCardinality: d.cardinalidadeEsperada,
            occurrences: d.ocorrenciasDoPapel,
            ambiguous: d.ambiguous,
          }
        : { status: p.status === 'invalido' ? 'invalid' : 'absent', value: null, origin: null, expectedCardinality: null, occurrences: 0, ambiguous: false }
    if (p.status === 'invalido') problems.push({ code: 'ROLE_INVALID', reason: p.motivo })

    let slot: SemanticaDoCampo['slot'] = { status: 'absent', id: null }
    if (d.slot.status === 'invalido') {
      slot = { status: 'invalid', id: null }
      problems.push({ code: 'SLOT_INVALID' })
    } else if (d.slot.status === 'valido') {
      const mesmos = porSlot.get(d.slot.slotId)!
      slot = { status: mesmos.length > 1 ? 'duplicate' : 'declared', id: d.slot.slotId }
      if (mesmos.length > 1) problems.push({ code: 'SLOT_DUPLICATE', layerIds: idsDe(mesmos) })
    }

    // Por onde o preenchimento resolverá ESTA camada — perguntado ao próprio resolverAlvo.
    const resolveAqui = (alvo: Parameters<typeof resolverAlvo>[1]) => {
      const r = resolverAlvo(camadas, alvo)
      return 'indice' in r && r.indice === i
    }
    const addressableBy: SemanticaDoCampo['addressableBy'] = []
    if (d.slot.status === 'valido' && resolveAqui({ slotId: d.slot.slotId })) addressableBy.push('slotId')
    if (p.status === 'valido' && resolveAqui({ semanticRole: p.papel })) addressableBy.push('semanticRole')
    if (resolveAqui({ layerId: d.layerId })) addressableBy.push('layerId')

    slotFields.push({
      layerId: l.id,
      name: l.name,
      type: l.type,
      isDynamic: !!l.isDynamic,
      currentValue: l.type === 'text' ? (l.content ?? '') : (l.fileUrl ?? ''),
      semantic: { role, slot, addressableBy, problems },
    })
  })

  return { slotFields, semanticIssues }
}

/** A lista de campos — a API de sempre, agora enriquecida. */
export function slotFieldsFromLayers(raw: unknown): SlotField[] {
  return analisarSlotFields(raw).slotFields
}
