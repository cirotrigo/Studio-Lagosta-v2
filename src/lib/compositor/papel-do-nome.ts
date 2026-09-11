/**
 * O PAPEL de um texto para o compositor, lido do nome que a equipe dá à camada.
 *
 * Mora sozinho porque dois lados precisam dele: a assinatura (servidor) e a
 * captura das combinações de texto no painel do editor (client), que não deve
 * arrastar o resto do compositor para o bundle.
 *
 * Módulo PURO.
 */

import type { Papel } from './spec'

export const PAPEIS_DO_COMPOSITOR: readonly Papel[] = ['pre', 'headline', 'headline2', 'apoio', 'cta', 'servico']

export function ehPapel(valor: unknown): valor is Papel {
  return typeof valor === 'string' && (PAPEIS_DO_COMPOSITOR as readonly string[]).includes(valor)
}

/** Nome de camada → papel. Aceita o que a equipe tende a escrever. */
export function papelDoNome(nome: string | null | undefined): Papel | null {
  const n = (nome ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim()
  if (!n) return null
  if (/^(pre|pre-?titulo|pretitulo|kicker|sobretitulo)$/.test(n)) return 'pre'
  if (/^(headline|titulo|manchete|title)[\s-]*(copy|2|b|dois|segunda)$/.test(n)) return 'headline2'
  if (/^(headline|titulo|manchete|title)$/.test(n)) return 'headline'
  if (/^(apoio|descricao|subtitulo|corpo|body)$/.test(n)) return 'apoio'
  if (/^(cta|chamada)$/.test(n)) return 'cta'
  if (/^(servico|info|rodape|footer)$/.test(n)) return 'servico'
  return null
}
