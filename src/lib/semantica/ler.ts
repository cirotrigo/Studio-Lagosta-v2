/**
 * Os LEITORES da semântica de uma camada: o papel (`metadata.compositor.papel`)
 * e o slot (`metadata.slot.id`). Toda leitura desses campos pela fundação passa
 * por aqui — e a compatibilidade com o legado fica concentrada aqui.
 *
 * Três estados explícitos, nunca `null` ambíguo:
 *  - `ausente`  — a camada não declara nada (e, no papel, nada se infere);
 *  - `valido`   — declarado, ou inferido pelo legado (a `origem` diz qual);
 *  - `invalido` — há declaração explícita, mas corrompida.
 *
 * 🔴 Declaração inválida NÃO é substituída pela inferência: `papel: "servicoo"`
 * numa camada de id `servico` sai `invalido`. O legado (`papelDaCamada`)
 * continua caindo para o id nos consumidores antigos; a fundação só passa a
 * DIAGNOSTICAR. Sem declaração, a inferência segue a ordem de `papelDaCamada`
 * (id, depois nome) — `ler.test.ts` confere a paridade.
 *
 * Módulo PURO.
 */

import type { Layer } from '@/types/template'
import { ehPapel } from '@/lib/compositor/papel-do-nome'
import { ehSemanticRole, type SemanticRole } from './papeis'

export type OrigemDoPapel = 'metadata' | 'id' | 'nome' | 'tipo' | 'id-reservado'

export type LeituraDoPapel =
  | { status: 'ausente' }
  | { status: 'valido'; papel: SemanticRole; origem: OrigemDoPapel }
  | { status: 'invalido'; valor: unknown }

export type LeituraDoSlot = { status: 'ausente' } | { status: 'valido'; slotId: string } | { status: 'invalido'; valor: unknown }

/** O mesmo formato dos ids de bloco da copy autoral (`copy-autoral/contrato.ts`), com teto. */
const FORMATO_DO_SLOT = /^[a-z0-9][a-z0-9._-]*$/i
const MAX_SLOT = 100

type CamadaLida = Pick<Layer, 'id' | 'name' | 'type' | 'metadata'>

function compositorDe(camada: CamadaLida): Record<string, unknown> | undefined {
  const c = (camada.metadata as { compositor?: unknown } | undefined)?.compositor
  return c && typeof c === 'object' ? (c as Record<string, unknown>) : undefined
}

export function lerSemanticRole(camada: CamadaLida): LeituraDoPapel {
  const compositor = compositorDe(camada)
  if (compositor && 'papel' in compositor && compositor.papel !== undefined) {
    const valor = compositor.papel
    return ehSemanticRole(valor) ? { status: 'valido', papel: valor, origem: 'metadata' } : { status: 'invalido', valor }
  }
  if (ehPapel(camada.id)) return { status: 'valido', papel: camada.id, origem: 'id' }
  if (ehPapel(camada.name)) return { status: 'valido', papel: camada.name, origem: 'nome' }
  if (camada.type === 'logo') return { status: 'valido', papel: 'logo', origem: 'tipo' }
  if (camada.id === 'bg-foto') return { status: 'valido', papel: 'foto', origem: 'id-reservado' }
  return { status: 'ausente' }
}

export function lerSlotId(camada: Pick<Layer, 'metadata'>): LeituraDoSlot {
  const meta = camada.metadata as { slot?: unknown } | undefined
  if (!meta || meta.slot === undefined) return { status: 'ausente' }
  const slot = meta.slot
  const id = slot && typeof slot === 'object' ? (slot as { id?: unknown }).id : undefined
  if (typeof id === 'string' && id.length <= MAX_SLOT && FORMATO_DO_SLOT.test(id)) return { status: 'valido', slotId: id }
  return { status: 'invalido', valor: slot }
}
