/**
 * O que fazer, em português, quando a copy não cabe nos LIMITES do contrato
 * (300 caracteres por linha, 12 linhas por bloco, 1 a 40 blocos). Quem recusa
 * uma copy — o item de plano, a peça do compositor — diz o motivo E a saída:
 * "linha longa demais" sem "quebre a linha" devolve à pessoa um problema que
 * ela não sabe resolver (restack sobre o PR2-01, 13/09/2026).
 *
 * Lê o CAMINHO do problema (`blocos.0.linhas.3`), não o texto em inglês do zod.
 * Problema que não é de limite (id repetido, ordem com buraco) não gera
 * orientação — a mensagem dele já diz o que está errado. Módulo PURO.
 */

import { MAX_BLOCOS_NA_COPY, MAX_LINHAS } from './contrato'
import type { ProblemaDaCopy } from './validar'

export const ORIENTACAO_LINHA_LONGA = 'Quebre as linhas longas: cada linha cabe em até 300 caracteres (divida o texto com uma quebra de linha).'
export const ORIENTACAO_LINHAS_DEMAIS = `Cada bloco cabe em até ${MAX_LINHAS} linhas: junte linhas curtas ou divida o texto em mais de um bloco.`
export const ORIENTACAO_BLOCOS_DEMAIS = `A copy cabe em até ${MAX_BLOCOS_NA_COPY} blocos: junte blocos ou tire os que sobram.`
export const ORIENTACAO_SEM_BLOCOS = 'A copy precisa de pelo menos um bloco.'

export function orientacaoDosProblemas(problemas: Array<ProblemaDaCopy | string>): string[] {
  const saida = new Set<string>()
  for (const problema of problemas) {
    const mensagem = typeof problema === 'string' ? problema : problema.mensagem
    const i = mensagem.indexOf(':')
    if (i < 0) continue
    const caminho = mensagem.slice(0, i).trim().replace(/^copy derivada da spec\s*/, '')
    const limite = Number(/\d+/.exec(mensagem.slice(i + 1))?.[0])
    if (/(^|\.)linhas\.\d+$/.test(caminho)) {
      if (limite === 300) saida.add(ORIENTACAO_LINHA_LONGA)
    } else if (/(^|\.)linhas$/.test(caminho)) {
      if (limite === MAX_LINHAS) saida.add(ORIENTACAO_LINHAS_DEMAIS)
    } else if (caminho === 'blocos') {
      if (limite === MAX_BLOCOS_NA_COPY) saida.add(ORIENTACAO_BLOCOS_DEMAIS)
      else if (limite === 1) saida.add(ORIENTACAO_SEM_BLOCOS)
    }
  }
  return [...saida]
}

/** A orientação como frase de fim de mensagem (" Quebre…"); vazio quando não há. */
export function orientacaoEmFrase(orientacao: string[]): string {
  return orientacao.length > 0 ? ` ${orientacao.join(' ')}` : ''
}
