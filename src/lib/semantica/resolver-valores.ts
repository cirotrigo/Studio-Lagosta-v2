/**
 * RESOLVER os valores semânticos de um preenchimento — `slotValues._slots`
 * (por slotId) e `slotValues._papeis` (por papel) — em valores POR ÍNDICE de
 * camada, sem aplicar nada (B1a; docs/research/studio-target-architecture.md).
 *
 * O endereçamento é o de `resolverAlvo`, nunca outro: papel repetido, slot
 * ausente ou duplicado e semântica corrompida voltam como o erro estruturado
 * dele, sem escolher camada. O resultado é indexado (não por referência de
 * objeto, nem achatado de volta para `slotValues[layer.id]` — isso reabriria a
 * colisão id × nome do casamento legado).
 *
 * Conflito nunca é escolhido em silêncio: duas fontes explicitamente enviadas
 * para a MESMA camada — `_slots` e `_papeis`, ou uma delas e a chave legada
 * pelo id ou pelo nome — precisam ter valores equivalentes; senão
 * VALOR_CONFLITANTE. "Enviada" segue a regra `??` do legado: `undefined` e
 * `null` são ausentes; `""` é valor.
 *
 * Só lê. A aplicação (bakeLayers, aplicarSlotNaCamada) é dos PRs seguintes.
 *
 * Módulo PURO.
 */

import type { Layer } from '@/types/template'
import { resolverAlvo, type ErroDoAlvo } from './resolver-alvo'
import type { SemanticRole } from './papeis'

/** O valor que o preenchimento entende: string ou objeto (`content`, `fileUrl`, `hidden`, `papel`, `bloco`). */
export type ValorDeSlot = string | Record<string, unknown>

export type OrigemSemantica = { tipo: 'slotId' | 'semanticRole'; chave: string }
export type OrigemDoValor = OrigemSemantica | { tipo: 'layerId' | 'name'; chave: string }

export interface ValorResolvido {
  indice: number
  /** O valor COMO VEIO — a aplicação decide o que ele significa em cada caminho. */
  valor: ValorDeSlot
  origem: OrigemSemantica
}

export type ErroDeValor =
  | { codigo: 'ENTRADA_INVALIDA'; campo: '_slots' | '_papeis' }
  | { codigo: 'VALOR_INVALIDO'; origem: OrigemSemantica }
  | { codigo: 'ALVO_NAO_RESOLVIDO'; origem: OrigemSemantica; erro: ErroDoAlvo }
  | { codigo: 'VALOR_CONFLITANTE'; indice: number; layerId: string; origens: OrigemDoValor[] }

export type AvisoDeValor = { codigo: 'FONTES_EQUIVALENTES'; indice: number; origens: OrigemDoValor[] }

export interface ValoresSemanticos {
  valores: Map<number, ValorResolvido>
  erros: ErroDeValor[]
  avisos: AvisoDeValor[]
}

const CHAVES_DO_VALOR = new Set(['content', 'fileUrl', 'hidden', 'papel', 'bloco'])

const fornecido = (v: unknown) => v !== undefined && v !== null
const objetoSimples = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)
const valorValido = (v: unknown): v is ValorDeSlot => typeof v === 'string' || objetoSimples(v)

/**
 * A forma canônica para comparar dois valores, só no contrato que o
 * preenchimento entende — não é deep-equal genérico. String não vazia `s`
 * equivale a `{ content: s }`; `""` só equivale a `""` (no render ela MANTÉM a
 * camada, e `{ content: "" }` a apaga). Objeto com chave fora do contrato não é
 * comparável (`null`).
 */
function canonico(v: unknown): string | null {
  if (typeof v === 'string') return v === '' ? '""' : JSON.stringify({ content: v })
  if (!objetoSimples(v)) return null
  const chaves = Object.keys(v)
  if (chaves.some((k) => !CHAVES_DO_VALOR.has(k))) return null
  return JSON.stringify(Object.fromEntries(chaves.sort().map((k) => [k, v[k]])))
}

function equivalentes(a: unknown, b: unknown): boolean {
  const x = canonico(a)
  return x !== null && x === canonico(b)
}

export function resolverValoresSemanticos(camadas: readonly Layer[], slotValues: Record<string, unknown>): ValoresSemanticos {
  const erros: ErroDeValor[] = []
  const avisos: AvisoDeValor[] = []
  const porIndice = new Map<number, Array<{ origem: OrigemSemantica; valor: ValorDeSlot }>>()

  const entradas: Array<{ campo: '_slots' | '_papeis'; tipo: OrigemSemantica['tipo'] }> = [
    { campo: '_slots', tipo: 'slotId' },
    { campo: '_papeis', tipo: 'semanticRole' },
  ]
  for (const { campo, tipo } of entradas) {
    const bruto = slotValues[campo]
    if (!fornecido(bruto)) continue
    if (!objetoSimples(bruto)) {
      erros.push({ codigo: 'ENTRADA_INVALIDA', campo })
      continue
    }
    for (const [chave, valor] of Object.entries(bruto)) {
      const origem: OrigemSemantica = { tipo, chave }
      if (!valorValido(valor)) {
        erros.push({ codigo: 'VALOR_INVALIDO', origem })
        continue
      }
      const r = resolverAlvo(camadas, tipo === 'slotId' ? { slotId: chave } : { semanticRole: chave as SemanticRole })
      if ('erro' in r) {
        erros.push({ codigo: 'ALVO_NAO_RESOLVIDO', origem, erro: r.erro })
        continue
      }
      porIndice.set(r.indice, [...(porIndice.get(r.indice) ?? []), { origem, valor }])
    }
  }

  const valores = new Map<number, ValorResolvido>()
  for (const [indice, semanticas] of [...porIndice.entries()].sort((a, b) => a[0] - b[0])) {
    const layer = camadas[indice]
    // As fontes enviadas para esta camada, na ordem: legado pelo id, legado pelo nome, slotId, papel.
    const fontes: Array<{ origem: OrigemDoValor; valor: unknown }> = []
    if (typeof layer.id === 'string' && !layer.id.startsWith('_') && fornecido(slotValues[layer.id])) {
      fontes.push({ origem: { tipo: 'layerId', chave: layer.id }, valor: slotValues[layer.id] })
    }
    if (typeof layer.name === 'string' && layer.name !== layer.id && !layer.name.startsWith('_') && fornecido(slotValues[layer.name])) {
      fontes.push({ origem: { tipo: 'name', chave: layer.name }, valor: slotValues[layer.name] })
    }
    fontes.push(...semanticas)
    const origens = fontes.map((f) => f.origem)
    if (fontes.some((f) => !equivalentes(f.valor, semanticas[0].valor))) {
      erros.push({ codigo: 'VALOR_CONFLITANTE', indice, layerId: layer.id, origens })
      continue
    }
    if (fontes.length > 1) avisos.push({ codigo: 'FONTES_EQUIVALENTES', indice, origens })
    valores.set(indice, { indice, valor: semanticas[0].valor, origem: semanticas[0].origem })
  }
  return { valores, erros, avisos }
}
