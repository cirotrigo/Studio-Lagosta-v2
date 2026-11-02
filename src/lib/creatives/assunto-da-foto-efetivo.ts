/**
 * O ASSUNTO EFETIVO de uma foto (F2b, 02/11/2026): o resolvedor único entre a caixa da VISÃO, que mora no JSON do
 * catálogo, e a decisão HUMANA, que mora na tabela `PhotoAssunto` (a tool `marcar-assunto`). A composição, a seleção, a
 * aprovação da referência e o acervo leem por aqui, nunca `lerCaixaDoAssunto(entrada.assunto)`: `assunto` é TEXTO.
 *
 * Módulo PURO: quem lê os dois insumos é `assuntosEfetivosDoProjeto` (`acervo.ts`).
 */
import { lerCaixaDoAssunto, type AssuntoNormalizado } from '@/lib/compositor/assunto-da-foto'

export interface AssuntoEfetivo {
  caixa: AssuntoNormalizado | null
  origem: 'humano' | 'visao' | 'nenhuma'
  estado: 'localizada' | 'sem-assunto' | 'nao-analisada' | 'fonte-nao-coerente'
}

/** Foto sem entrada, sem análise da caixa e sem decisão humana: segue pelo estimado. */
export const ASSUNTO_NAO_ANALISADO: AssuntoEfetivo = { caixa: null, origem: 'nenhuma', estado: 'nao-analisada' }

export interface DecisaoHumanaDoAssunto {
  decisao: string
  caixa: unknown
  revogadoEm?: Date | null
}

export function assuntoEfetivoDaFoto(
  entrada: { caixaDoAssunto?: unknown; caixaAnalisadaEm?: string } | null | undefined,
  humana: DecisaoHumanaDoAssunto | null | undefined,
): AssuntoEfetivo {
  if (humana && !humana.revogadoEm) {
    if (humana.decisao === 'sem-assunto') return { caixa: null, origem: 'humano', estado: 'sem-assunto' }
    const caixa = lerCaixaDoAssunto(humana.caixa)
    if (caixa) return { caixa, origem: 'humano', estado: 'localizada' }
  }
  if (entrada?.caixaDoAssunto === null && entrada.caixaAnalisadaEm) return { caixa: null, origem: 'visao', estado: 'sem-assunto' }
  const caixa = lerCaixaDoAssunto(entrada?.caixaDoAssunto)
  return caixa ? { caixa, origem: 'visao', estado: 'localizada' } : ASSUNTO_NAO_ANALISADO
}
