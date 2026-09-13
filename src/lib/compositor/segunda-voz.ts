/**
 * A manchete em DUAS VOZES (`headline` + `headline2`): quem decide quais linhas
 * vão na voz 2 é o AUTOR, no contrato (`estilo.linhasNaVoz2`). Até o PR 4 de
 * "Marca simples, copy melhor" (12/09/2026) a última linha mudava de voz
 * sozinha sempre que a assinatura tinha `headline2` — e ao passar de duas para
 * três linhas o destaque trocava de trecho sem ninguém pedir.
 *
 * Módulo PURO, com teste.
 *
 * Regras:
 *  - COM contrato: só as linhas declaradas vão na voz 2. Sem declaração, a
 *    manchete inteira sai na voz 1 — mesmo que a variante tenha `headline2`.
 *    Declaração numa variante SEM voz 2 não é honrada e vira aviso (nunca
 *    some em silêncio).
 *  - SEM contrato (spec legada, só `blocos`): vale a regra antiga — a última
 *    linha COM TEXTO (e os respiros depois dela) na voz 2 quando a variante tem
 *    `headline2` e há 2+ linhas com texto; nunca uma voz 2 vazia. É uma
 *    transformação do sistema, e a copy efetiva a registra como tal.
 *  - A voz 2 é sempre o FIM da manchete (as duas vozes são duas camadas
 *    empilhadas): a validação do contrato já recusa índice fora do fim.
 */

export interface DivisaoDaManchete {
  voz1: string[]
  voz2: string[]
  /** De onde saiu a divisão — para o diagnóstico e para a copy efetiva. */
  origem: 'contrato' | 'legado' | 'nenhuma'
  aviso: string | null
}

export function dividirManchete(
  linhas: string[],
  args: {
    /** A variante (ou o arranjo) tem a camada `headline2`? */
    temSegundaVoz: boolean
    /** Há contrato de copy nesta spec? Decide entre a regra do autor e a do legado. */
    comContrato: boolean
    /** Os índices (0-based) que o autor declarou na voz 2; `null`/vazio = nenhum. */
    declaradas?: number[] | null
  },
): DivisaoDaManchete {
  const declaradas = [...new Set((args.declaradas ?? []).filter((i) => Number.isInteger(i) && i >= 0 && i < linhas.length))].sort((a, b) => a - b)
  if (args.comContrato) {
    if (declaradas.length === 0) return { voz1: linhas, voz2: [], origem: 'nenhuma', aviso: null }
    if (!args.temSegundaVoz) {
      return {
        voz1: linhas,
        voz2: [],
        origem: 'nenhuma',
        aviso: `a copy declarou ${declaradas.length === 1 ? 'a linha' : 'as linhas'} ${declaradas.map((i) => i + 1).join(', ')} da manchete na segunda voz, mas a variante escolhida não tem "headline2" — saíram na voz 1`,
      }
    }
    // As declaradas precisam ser o FIM contíguo da manchete (validado no
    // contrato); aqui o corte é defensivo: da primeira declarada até o fim.
    const corte = declaradas[0]
    const contiguas = declaradas.every((v, k) => v === corte + k) && corte + declaradas.length === linhas.length
    if (!contiguas) {
      return {
        voz1: linhas,
        voz2: [],
        origem: 'nenhuma',
        aviso: `a segunda voz precisa ser as ÚLTIMAS linhas da manchete (veio ${declaradas.map((i) => i + 1).join(', ')} de ${linhas.length}) — a manchete saiu inteira na voz 1`,
      }
    }
    return { voz1: linhas.slice(0, corte), voz2: linhas.slice(corte), origem: 'contrato', aviso: null }
  }
  /**
   * Legado: a voz 2 é a ÚLTIMA linha COM TEXTO, com os respiros que a seguem.
   * Desde que linha vazia é conteúdo (R02/R03 do PR 10) a manchete pode chegar
   * com respiro no fim — "na brasa\n" digitado no editor (Shift+Enter) volta
   * como ['Costela', 'na brasa', ''] na recomposição sem contrato —, e a última
   * linha crua pôs uma voz 2 VAZIA: "na brasa" perdia cor e fonte da segunda
   * voz numa edição de OUTRO texto (C10-02 da pré-revisão do HEAD 8b8e801f).
   * Com menos de duas linhas com texto não há segunda voz.
   */
  const comTexto = linhas.flatMap((l, i) => (l.trim().length > 0 ? [i] : []))
  if (args.temSegundaVoz && comTexto.length >= 2) {
    const corte = comTexto[comTexto.length - 1]
    return { voz1: linhas.slice(0, corte), voz2: linhas.slice(corte), origem: 'legado', aviso: null }
  }
  return { voz1: linhas, voz2: [], origem: 'nenhuma', aviso: null }
}
