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
 * (id, depois nome) — `ler.test.ts` confere a paridade em camadas de texto.
 *
 * Papel e tipo têm de casar (`papelCabeNoTipo`): papel de texto declarado numa
 * imagem sai `invalido` com `motivo: 'tipo'`, e a inferência por id/nome não
 * transforma uma imagem chamada "headline" em manchete. Aqui a fundação
 * diverge de `papelDaCamada`, que não olha o tipo.
 *
 * Módulo PURO.
 */

import type { Layer } from '@/types/template'
import { ehPapel } from '@/lib/compositor/papel-do-nome'
import { ehSemanticRole, papelCabeNoTipo, type SemanticRole } from './papeis'

export type OrigemDoPapel = 'metadata' | 'id' | 'nome' | 'tipo' | 'id-reservado'

export type LeituraDoPapel =
  | { status: 'ausente' }
  | { status: 'valido'; papel: SemanticRole; origem: OrigemDoPapel }
  | { status: 'invalido'; valor: unknown; motivo: 'valor' | 'tipo' }

export type LeituraDoSlot = { status: 'ausente' } | { status: 'valido'; slotId: string } | { status: 'invalido'; valor: unknown }

/** O mesmo formato dos ids de bloco da copy autoral (`copy-autoral/contrato.ts`), com teto. */
const FORMATO_DO_SLOT = /^[a-z0-9][a-z0-9._-]*$/i
const MAX_SLOT = 100

type CamadaLida = Pick<Layer, 'id' | 'name' | 'type' | 'metadata'>

export function lerSemanticRole(camada: CamadaLida): LeituraDoPapel {
  const bruto = (camada.metadata as { compositor?: unknown } | undefined)?.compositor
  // `compositor` presente mas que não é objeto é declaração corrompida — não
  // cai na inferência. Objeto SEM `papel` é legítimo: a camada extra `livre`
  // é gravada assim de propósito (`compositor/blocos.ts`, `camadaDoPapel`).
  if (bruto !== undefined && (bruto === null || typeof bruto !== 'object' || Array.isArray(bruto))) {
    return { status: 'invalido', valor: bruto, motivo: 'valor' }
  }
  const compositor = bruto as Record<string, unknown> | undefined
  if (compositor && 'papel' in compositor && compositor.papel !== undefined) {
    const valor = compositor.papel
    if (!ehSemanticRole(valor)) return { status: 'invalido', valor, motivo: 'valor' }
    if (!papelCabeNoTipo(valor, camada.type)) return { status: 'invalido', valor, motivo: 'tipo' }
    return { status: 'valido', papel: valor, origem: 'metadata' }
  }
  if (ehPapel(camada.id) && papelCabeNoTipo(camada.id, camada.type)) return { status: 'valido', papel: camada.id, origem: 'id' }
  if (ehPapel(camada.name) && papelCabeNoTipo(camada.name, camada.type)) return { status: 'valido', papel: camada.name, origem: 'nome' }
  if (camada.type === 'logo') return { status: 'valido', papel: 'logo', origem: 'tipo' }
  if (camada.id === 'bg-foto' && papelCabeNoTipo('foto', camada.type)) return { status: 'valido', papel: 'foto', origem: 'id-reservado' }
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
