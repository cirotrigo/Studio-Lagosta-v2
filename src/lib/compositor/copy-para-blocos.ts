/**
 * A copy de um item de plano (`copyProposta: string[]`, blocos sem papel)
 * vira a spec do compositor (blocos POR PAPEL e POR LINHA).
 *
 * O item do plano não carrega o nome do papel — é a mesma simplificação
 * conhecida do mapeamento posicional da via template. A convenção aqui é a
 * ordem de leitura: 1 bloco = headline; 2 = headline + apoio; 3 = headline +
 * apoio + cta; 4 = pre + headline + apoio + cta; 5 = os quatro + servico.
 * Um bloco que a casa reconhece como SERVIÇO (horário/endereço) vai para o
 * papel servico onde quer que esteja.
 *
 * As linhas: headline quebrada em até 2 linhas equilibradas quando passa de
 * ~18 caracteres; apoio em 2 quando passa de ~40. Módulo puro.
 */

import type { Bloco } from './spec'

type PapelDaSpec = Bloco['papel']

const TETO_DA_HEADLINE = 18
const TETO_DO_APOIO = 40

/** Quebra em 2 linhas no espaço mais perto do meio, quando passa do teto. */
export function quebrarEmDuas(texto: string, teto: number): string[] {
  const t = texto.replace(/\s+/g, ' ').trim()
  if (t.includes('\n')) return t.split('\n').map((l) => l.trim()).filter(Boolean)
  if (t.length <= teto) return [t]
  const meio = t.length / 2
  let melhor = -1
  let dist = Infinity
  for (let i = 0; i < t.length; i++) {
    if (t[i] !== ' ') continue
    const d = Math.abs(i - meio)
    if (d < dist) {
      dist = d
      melhor = i
    }
  }
  if (melhor < 0) return [t]
  return [t.slice(0, melhor).trim(), t.slice(melhor + 1).trim()]
}

/**
 * Serviço é FAIXA de horário, faixa de dias ou endereço — hora solta não
 * basta ("desconto até as 20h" é apoio, não serviço; foi o caso do teste).
 */
const PARECE_SERVICO =
  /(\d{1,2}h(\d{2})?\s*(às|as|a|até|-|–)\s*\d{1,2}h|\b(de |das )?(segunda|terça|quarta|quinta|sexta|sábado|domingo)(-feira)?\b\s*(a|à|até)\s*(segunda|terça|quarta|quinta|sexta|sábado|domingo)|\brua\b|\bav\.|\bavenida\b|\bpraça\b|\balameda\b)/i

export function copyParaBlocos(copy: string[]): Bloco[] {
  const limpa = copy.map((c) => c.replace(/\s+/g, ' ').trim()).filter(Boolean)
  if (limpa.length === 0) return []

  const servicoIdx = limpa.findIndex((c, i) => i > 0 && PARECE_SERVICO.test(c) && c.length <= 90)
  const servico = servicoIdx >= 0 ? limpa[servicoIdx] : null
  const resto = servicoIdx >= 0 ? limpa.filter((_, i) => i !== servicoIdx) : limpa

  const papeis: PapelDaSpec[] =
    resto.length >= 4 ? ['pre', 'headline', 'apoio', 'cta'] : resto.length === 3 ? ['headline', 'apoio', 'cta'] : resto.length === 2 ? ['headline', 'apoio'] : ['headline']

  const blocos: Bloco[] = resto.slice(0, papeis.length).map((texto, i) => {
    const papel = papeis[i]
    const linhas = papel === 'headline' ? quebrarEmDuas(texto, TETO_DA_HEADLINE) : papel === 'apoio' ? quebrarEmDuas(texto, TETO_DO_APOIO) : [texto]
    return { papel, linhas }
  })
  if (servico) blocos.push({ papel: 'servico', linhas: [servico] })
  return blocos
}
