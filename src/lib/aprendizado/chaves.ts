/**
 * Chaves de idempotência da captura (`LearningSignal.chave`).
 *
 * O denominador do KPI é "sugestões emitidas". Sem chave, cada refresh da
 * bancada gravaria 15 slots de novo e a taxa de aceitação despencaria por
 * construção: a MESMA proposta contada 40 vezes porque alguém recarregou a
 * tela. Com chave, a proposta é a unidade — reemiti-la devolve a linha que já
 * existe (`upsert` com `update: {}` em `captura.ts`).
 *
 * A chave é `@unique` GLOBAL na tabela, então todo componente entra: tipo,
 * versão da heurística, projeto e o que identifica a proposta. A versão está
 * lá de propósito — mudou a heurística, a safra nova NÃO herda o desfecho da
 * antiga, que foi decidida sobre outra proposta.
 *
 * Módulo puro (sem Prisma, sem rede): dá para testar sem banco.
 */

import { createHash } from 'node:crypto'

/** Separador que não aparece em id, data nem nome de serviço. */
const SEP = '|'

/**
 * Monta a chave a partir das partes, na ordem em que foram passadas.
 * `null`/`undefined` viram string vazia — a POSIÇÃO é preservada, senão
 * `[projeto, tema, pasta]` com tema vazio colidiria com pasta vazia.
 */
export function chaveDeSugestao(...partes: Array<string | number | null | undefined>): string {
  return partes
    .map((p) => (p === null || p === undefined ? '' : String(p).trim()))
    .join(SEP)
}

/**
 * Resumo estável de um objeto, para caber numa chave.
 *
 * `JSON.stringify` não serve direto: a ordem das chaves de um objeto literal
 * varia com a ordem de escrita, e dois filtros iguais montados em ordens
 * diferentes gerariam chaves diferentes — ou seja, duas propostas onde há uma.
 */
export function resumoEstavel(valor: unknown, tamanho = 12): string {
  return createHash('sha1').update(ordenado(valor)).digest('hex').slice(0, tamanho)
}

function ordenado(valor: unknown): string {
  if (valor === null || valor === undefined) return 'null'
  if (Array.isArray(valor)) return `[${valor.map(ordenado).join(',')}]`
  if (typeof valor === 'object') {
    const entradas = Object.entries(valor as Record<string, unknown>)
      .filter(([, v]) => v !== undefined && v !== null && v !== '')
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => `${k}:${ordenado(v)}`)
    return `{${entradas.join(',')}}`
  }
  if (typeof valor === 'string') return JSON.stringify(valor.trim().toLowerCase())
  return JSON.stringify(valor)
}

/**
 * O dia em Brasília de uma data — a granularidade de dedupe das propostas que
 * não têm alvo próprio (busca no acervo, por exemplo).
 *
 * Buscar "picanha" cinco vezes numa tarde é UMA proposta vista cinco vezes,
 * não cinco propostas; amanhã, com o acervo em outro estado, é outra.
 */
export function diaBRT(d: Date = new Date()): string {
  return new Date(d.getTime() - 3 * 3600_000).toISOString().slice(0, 10)
}
