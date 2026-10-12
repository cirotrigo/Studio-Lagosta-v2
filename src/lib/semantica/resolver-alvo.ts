/**
 * RESOLVER O ALVO de uma operação numa página: identidade e integridade, nada
 * de apresentação (docs/research/studio-target-architecture.md §2).
 *
 * Precedência explícita:
 *  A. `layerId`      → a instância física exata (id repetido = LAYER_DUPLICADO);
 *  B. `slotId`       → exatamente uma camada (zero = SLOT_NOT_FOUND, mais = SLOT_DUPLICADO);
 *  C. `semanticRole` → uma ocorrência resolve (zero = ROLE_NOT_FOUND, mais = AMBIGUOUS_TARGET).
 *
 * Regras que não se negociam:
 *  - NUNCA escolhe a primeira camada: toda multiplicidade vira erro com os
 *    candidatos, para quem chamou decidir;
 *  - o campo de maior precedência resolve e os demais CONFEREM a camada
 *    resolvida — se ela não tem aquele slot ou papel, ALVO_CONFLITANTE (o
 *    campo mais forte não passa por cima em silêncio);
 *  - semântica corrompida na página (papel ou slot declarado e inválido)
 *    bloqueia a resolução por aquele campo: a camada corrompida pode ser a que
 *    se queria, e o único `servico` válido não é "o servico" da página;
 *  - SEM fallback legado: o casamento dos `slotValues` por id/nome continua
 *    onde sempre esteve (`bakeLayers`, `aplicarSlotNaCamada`), intocado;
 *  - os erros carregam só IDENTIDADE (ids, papel, tipo, nome, visibilidade) —
 *    nunca texto ou URL da página. Apresentar conteúdo é da camada de cima,
 *    depois de o acesso à página estar autorizado.
 *
 * Camada oculta conta: filtrá-la esconderia uma ambiguidade real.
 *
 * Módulo PURO.
 */

import type { Layer } from '@/types/template'
import { lerSemanticRole, lerSlotId } from './ler'
import { ehSemanticRole, type SemanticRole } from './papeis'

export interface Alvo {
  layerId?: string
  slotId?: string
  semanticRole?: SemanticRole
}

export interface Candidato {
  indice: number
  layerId: string
  slotId: string | null
  semanticRole: SemanticRole | null
  type: string
  name: string
  visible: boolean
}

export type ErroDoAlvo =
  | { codigo: 'ALVO_VAZIO' }
  | { codigo: 'PAPEL_DESCONHECIDO'; semanticRole: string }
  | { codigo: 'LAYER_NOT_FOUND'; layerId: string }
  | { codigo: 'LAYER_DUPLICADO'; layerId: string; candidatos: Candidato[] }
  | { codigo: 'SLOT_NOT_FOUND'; slotId: string }
  | { codigo: 'SLOT_DUPLICADO'; slotId: string; candidatos: Candidato[] }
  | { codigo: 'ROLE_NOT_FOUND'; semanticRole: SemanticRole }
  | { codigo: 'AMBIGUOUS_TARGET'; semanticRole: SemanticRole; candidatos: Candidato[] }
  | { codigo: 'SEMANTICA_INVALIDA'; campo: 'papel' | 'slot'; candidatos: Candidato[] }
  | { codigo: 'ALVO_CONFLITANTE'; campo: 'slotId' | 'semanticRole'; candidatos: Candidato[] }

export type ViaDoAlvo = 'layerId' | 'slotId' | 'semanticRole'

export type ResultadoDoAlvo = { ok: true; camada: Layer; indice: number; via: ViaDoAlvo } | { ok: false; erro: ErroDoAlvo }

type Parcial = { ok: true; indice: number } | { ok: false; erro: ErroDoAlvo }

export function candidatoDe(camada: Layer, indice: number): Candidato {
  const papel = lerSemanticRole(camada)
  const slot = lerSlotId(camada)
  return {
    indice,
    layerId: camada.id,
    slotId: slot.status === 'valido' ? slot.slotId : null,
    semanticRole: papel.status === 'valido' ? papel.papel : null,
    type: camada.type,
    name: camada.name,
    visible: camada.visible !== false,
  }
}

function indicesOnde(camadas: readonly Layer[], cond: (c: Layer) => boolean): number[] {
  const out: number[] = []
  camadas.forEach((c, i) => {
    if (cond(c)) out.push(i)
  })
  return out
}

const candidatos = (camadas: readonly Layer[], indices: number[]) => indices.map((i) => candidatoDe(camadas[i], i))

function porLayerId(camadas: readonly Layer[], layerId: string): Parcial {
  const achados = indicesOnde(camadas, (c) => c.id === layerId)
  if (achados.length === 0) return { ok: false, erro: { codigo: 'LAYER_NOT_FOUND', layerId } }
  if (achados.length > 1) return { ok: false, erro: { codigo: 'LAYER_DUPLICADO', layerId, candidatos: candidatos(camadas, achados) } }
  return { ok: true, indice: achados[0] }
}

function porSlot(camadas: readonly Layer[], slotId: string): Parcial {
  const corrompidos = indicesOnde(camadas, (c) => lerSlotId(c).status === 'invalido')
  if (corrompidos.length > 0) return { ok: false, erro: { codigo: 'SEMANTICA_INVALIDA', campo: 'slot', candidatos: candidatos(camadas, corrompidos) } }
  const achados = indicesOnde(camadas, (c) => {
    const s = lerSlotId(c)
    return s.status === 'valido' && s.slotId === slotId
  })
  if (achados.length === 0) return { ok: false, erro: { codigo: 'SLOT_NOT_FOUND', slotId } }
  if (achados.length > 1) return { ok: false, erro: { codigo: 'SLOT_DUPLICADO', slotId, candidatos: candidatos(camadas, achados) } }
  return { ok: true, indice: achados[0] }
}

function porPapel(camadas: readonly Layer[], semanticRole: SemanticRole): Parcial {
  const corrompidos = indicesOnde(camadas, (c) => lerSemanticRole(c).status === 'invalido')
  if (corrompidos.length > 0) return { ok: false, erro: { codigo: 'SEMANTICA_INVALIDA', campo: 'papel', candidatos: candidatos(camadas, corrompidos) } }
  const achados = indicesOnde(camadas, (c) => {
    const p = lerSemanticRole(c)
    return p.status === 'valido' && p.papel === semanticRole
  })
  if (achados.length === 0) return { ok: false, erro: { codigo: 'ROLE_NOT_FOUND', semanticRole } }
  if (achados.length > 1) return { ok: false, erro: { codigo: 'AMBIGUOUS_TARGET', semanticRole, candidatos: candidatos(camadas, achados) } }
  return { ok: true, indice: achados[0] }
}

/**
 * O campo de MAIOR precedência resolve; os demais CONFEREM a camada resolvida
 * (ela tem de ter aquele slot e aquele papel). Assim um `layerId` não é
 * derrubado pela repetição do papel na página — mas também não passa por cima
 * de um papel ou slot que contradiz a camada.
 */
export function resolverAlvo(camadas: readonly Layer[], alvo: Alvo): ResultadoDoAlvo {
  if (alvo.semanticRole !== undefined && !ehSemanticRole(alvo.semanticRole)) {
    return { ok: false, erro: { codigo: 'PAPEL_DESCONHECIDO', semanticRole: String(alvo.semanticRole) } }
  }
  const via: ViaDoAlvo | null =
    alvo.layerId !== undefined ? 'layerId' : alvo.slotId !== undefined ? 'slotId' : alvo.semanticRole !== undefined ? 'semanticRole' : null
  if (!via) return { ok: false, erro: { codigo: 'ALVO_VAZIO' } }

  const r = via === 'layerId' ? porLayerId(camadas, alvo.layerId!) : via === 'slotId' ? porSlot(camadas, alvo.slotId!) : porPapel(camadas, alvo.semanticRole!)
  // `in`, não `!r.ok`: com strict:false o TS não estreita a união pelo literal booleano.
  if ('erro' in r) return { ok: false, erro: r.erro }
  const camada = camadas[r.indice]
  const conflito = (campo: 'slotId' | 'semanticRole'): ResultadoDoAlvo => ({
    ok: false,
    erro: { codigo: 'ALVO_CONFLITANTE', campo, candidatos: [candidatoDe(camada, r.indice)] },
  })

  if (via !== 'slotId' && alvo.slotId !== undefined) {
    const s = lerSlotId(camada)
    if (s.status !== 'valido' || s.slotId !== alvo.slotId) return conflito('slotId')
  }
  if (via !== 'semanticRole' && alvo.semanticRole !== undefined) {
    const p = lerSemanticRole(camada)
    if (p.status !== 'valido' || p.papel !== alvo.semanticRole) return conflito('semanticRole')
  }
  return { ok: true, camada, indice: r.indice, via }
}
