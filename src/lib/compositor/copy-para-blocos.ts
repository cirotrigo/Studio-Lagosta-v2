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
 * ~18 caracteres; apoio em 2 quando passa de ~40. Os [colchetes] do destaque
 * não contam no tamanho e o corte nunca cai dentro de um. Módulo puro.
 */

import { CreativeError } from '@/lib/creatives/errors'
import { semColchetes } from './destaques'
import type { Bloco } from './spec'

type PapelDaSpec = Bloco['papel']

const TETO_DA_HEADLINE = 18
const TETO_DO_APOIO = 40

/** Quebra em 2 linhas no espaço mais perto do meio, quando passa do teto. */
export function quebrarEmDuas(texto: string, teto: number): string[] {
  const t = texto.replace(/\s+/g, ' ').trim()
  if (t.includes('\n')) return t.split('\n').map((l) => l.trim()).filter(Boolean)
  const visivel = semColchetes(t).length
  if (visivel <= teto) return [t]
  const meio = visivel / 2
  let melhor = -1
  let dist = Infinity
  // O corte nunca cai DENTRO de um destaque: "[em" / "dobro]" viraria
  // colchete sem par nas duas linhas e o destaque sumiria das duas.
  let dentro = false
  let visiveis = 0
  for (let i = 0; i < t.length; i++) {
    const ch = t[i]
    if (ch === '[') {
      dentro = true
      continue
    }
    if (ch === ']') {
      dentro = false
      continue
    }
    if (ch === ' ' && !dentro) {
      const d = Math.abs(visiveis - meio)
      if (d < dist) {
        dist = d
        melhor = i
      }
    }
    visiveis++
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

export interface OpcoesDeCopyParaBlocos {
  /**
   * Os papéis que a página de assinatura do formato TEM. A copy é distribuída
   * só sobre eles (Ciro, 04/09/2026: "a copy para cada arte deve ser feita em
   * cima dos campos que existem no template" — nunca acrescentar campo).
   * Sem a lista, vale a distribuição por contagem.
   */
  papeis?: PapelDaSpec[]
  /** Executor semanal: nenhuma condição recebida pode desaparecer no mapeamento. */
  estrito?: boolean
}

const ORDEM_DE_LEITURA: PapelDaSpec[] = ['pre', 'headline', 'apoio', 'cta']
/** Com menos textos que papéis, quem fica: a manchete, depois o apoio, a chamada e por último o pré-título. */
const PRIORIDADE: PapelDaSpec[] = ['headline', 'apoio', 'cta', 'pre']

export function copyParaBlocos(copy: string[], opcoes: OpcoesDeCopyParaBlocos = {}): Bloco[] {
  const limpa = copy.map((c) => c.replace(/\s+/g, ' ').trim()).filter(Boolean)
  if (limpa.length === 0) return []

  const disponiveis = opcoes.papeis ? new Set(opcoes.papeis) : null
  const servicoIdx = limpa.findIndex((c, i) => {
    const visivel = semColchetes(c)
    return i > 0 && PARECE_SERVICO.test(visivel) && visivel.length <= 90
  })
  const servico = servicoIdx >= 0 ? limpa[servicoIdx] : null
  const resto = servicoIdx >= 0 ? limpa.filter((_, i) => i !== servicoIdx) : limpa

  let papeis: PapelDaSpec[]
  if (disponiveis) {
    const ordem = ORDEM_DE_LEITURA.filter((p) => disponiveis.has(p))
    const escolhidos = new Set(PRIORIDADE.filter((p) => disponiveis.has(p)).slice(0, resto.length))
    papeis = ordem.filter((p) => escolhidos.has(p))
  } else {
    papeis =
      resto.length >= 4 ? ['pre', 'headline', 'apoio', 'cta'] : resto.length === 3 ? ['headline', 'apoio', 'cta'] : resto.length === 2 ? ['headline', 'apoio'] : ['headline']
  }

  if (opcoes.estrito && (resto.length > papeis.length || (servico && disponiveis && !disponiveis.has('servico')))) {
    throw new CreativeError('PAPEIS_INCOMPATIVEIS', 'A copy do item excede os papéis da assinatura. Escolha uma variante compatível e preserve o serviço e as condições obrigatórias.', 422, { textosSemPapel: [...resto.slice(papeis.length), ...(servico && disponiveis && !disponiveis.has('servico') ? [servico] : [])] })
  }
  const blocos: Bloco[] = resto.slice(0, papeis.length).map((texto, i) => {
    const papel = papeis[i]
    const linhas = papel === 'headline' ? quebrarEmDuas(texto, TETO_DA_HEADLINE) : papel === 'apoio' ? quebrarEmDuas(texto, TETO_DO_APOIO) : [texto]
    return { papel, linhas }
  })
  if (servico && (!disponiveis || disponiveis.has('servico'))) blocos.push({ papel: 'servico', linhas: [servico] })
  return blocos
}
