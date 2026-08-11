/**
 * De quem é a copy de uma arte: da DICA que a propôs, ou de ninguém — o
 * CONTRATO (parte PURA).
 *
 * Módulo SEM Prisma de propósito: `@/lib/db` **lança no import** quando falta
 * `DATABASE_URL`, e o que mora aqui precisa ser testável sem banco. É a mesma
 * separação que já obrigou `dica-de-copy-contrato.ts`, `para-bancada.ts`,
 * `approval-checklist.ts` e `text-comparison.ts` a saírem dos seus serviços.
 *
 * ── O DEFEITO QUE ISTO EXISTE PARA IMPEDIR ────────────────────────────────
 * Até `propor-semana` nascer, a copy de uma arte NUNCA tinha sido proposta: ela
 * era escrita pelo LLM na conversa e chegava pronta. Registrar a correção dela
 * como **escolha absoluta** era o certo — não havia proposta a recusar.
 *
 * Com a dica de copy, a mesma peça pode ter uma sugestão EM ABERTO. Se a
 * correção continuasse abrindo uma linha nova, o mesmo texto viraria dois
 * sinais com sentidos opostos: um dizendo "ninguém propôs nada" e outro,
 * pendente, que expiraria como indiferença. O denominador do KPI infla e a taxa
 * de aceitação vira ficção. É o mesmo defeito que a F1 já teve de corrigir uma
 * vez no slot (`e3236624`): **um sinal por proposta, nunca dois com rótulos
 * opostos.**
 *
 * As duas decisões que precisam ser inspecionáveis moram aqui:
 *
 *   1. `escolherItemDoPlano` — esta arte veio de uma leva? (por PÁGINA, não por
 *      rótulo que a superfície manda);
 *   2. `decidirDesfechoDaCopy` — o desfecho é CALCULADO pelo diff, e "não sei"
 *      nunca vira aceitação.
 */

import { desfechoPeloDiff, diffDeCopy, type DiffDeCopy, type LadoDaCopy } from './diff-copy'
import type { Desfecho } from './vocabulario'

/** O que o resolvedor precisa saber de um `ItemDePlano` para reconhecê-lo. */
export interface ItemDePlanoCandidato {
  id: string
  /** A página da arte que o item virou. */
  pageId?: string | null
  /** A arte que o item virou. */
  generationId?: string | null
  /** Desempate quando mais de um item aponta para a mesma arte. */
  atualizadoEm?: Date | null
}

function limpo(valor: string | null | undefined): string | null {
  const t = typeof valor === 'string' ? valor.trim() : ''
  return t === '' ? null : t
}

/** Mais recente primeiro; sem data vai para o fim (nunca vence quem tem data). */
function maisRecentePrimeiro(a: ItemDePlanoCandidato, b: ItemDePlanoCandidato): number {
  const ta = a.atualizadoEm ? a.atualizadoEm.getTime() : -Infinity
  const tb = b.atualizadoEm ? b.atualizadoEm.getTime() : -Infinity
  return tb - ta
}

/**
 * O item de plano que corresponde a esta arte — `null` quando ela não nasceu
 * de leva nenhuma (o caso comum, e o que faz o chamador cair no registro de
 * sempre).
 *
 * 🔴 **A PÁGINA vence a arte.** `ajustar-arte` cria uma Generation NOVA a cada
 * ajuste, então o `generationId` que o chamador tem em mãos é de uma arte que
 * o item nunca viu; o que sobrevive ao ajuste é a página. Casar por arte
 * continua valendo para a via `ia`, onde o item pode ter arte sem página.
 *
 * Empate (dois itens apontando para a mesma página, o que só acontece quando
 * alguém regenera) resolve pelo mais recentemente mexido: é o item que a pessoa
 * está de fato usando.
 */
export function escolherItemDoPlano(
  candidatos: ItemDePlanoCandidato[],
  alvo: { pageId?: string | null; generationId?: string | null },
): ItemDePlanoCandidato | null {
  const pageId = limpo(alvo.pageId)
  const generationId = limpo(alvo.generationId)
  if (!pageId && !generationId) return null

  if (pageId) {
    const porPagina = candidatos.filter((c) => limpo(c.pageId) === pageId)
    if (porPagina.length > 0) return [...porPagina].sort(maisRecentePrimeiro)[0]
  }
  if (generationId) {
    const porArte = candidatos.filter((c) => limpo(c.generationId) === generationId)
    if (porArte.length > 0) return [...porArte].sort(maisRecentePrimeiro)[0]
  }
  return null
}

/** O que fazer com a dica encontrada. */
export type DecisaoDeCopy =
  /** Dá para concluir: feche a proposta com este desfecho. */
  | { acao: 'fechar'; desfecho: Desfecho; diff: DiffDeCopy }
  /**
   * Não deu para comparar os dois lados. **Não grave nada** — a proposta segue
   * pendente e a varredura de expiração a fecha como `expirada`.
   */
  | { acao: 'nao-sei'; diff: DiffDeCopy }

/**
 * O desfecho de uma dica de copy, CALCULADO comparando o texto proposto com o
 * final.
 *
 * 🔴 Nunca declarado pela superfície: quem está gerando a arte tem todo
 * incentivo a relatar acerto, e o texto continua editável depois de a peça ter
 * nascido de uma dica. Mesma regra de `avaliarSlotSugerido`.
 *
 * 🔴 **Ilegível nunca vira aceitação.** `Page.layers` tem codificação
 * inconsistente no banco e `copyDeCamadas` devolve `null` quando não consegue
 * ler; aceitar isso registraria "a pessoa não mudou nada" justamente nas
 * páginas que ninguém consegue ler. Copy final VAZIA cai no mesmo balde: é
 * "não sei", não "trocou tudo".
 */
export function decidirDesfechoDaCopy(propostos: LadoDaCopy, final: LadoDaCopy): DecisaoDeCopy {
  const temFinal = Array.isArray(final) ? final.length > 0 : !!final && Object.keys(final).length > 0
  const diff = diffDeCopy(propostos, temFinal ? final : null)
  const desfecho = desfechoPeloDiff(diff)
  if (!desfecho) return { acao: 'nao-sei', diff }
  return { acao: 'fechar', desfecho, diff }
}

/** O que aconteceu com a tentativa de fechar a dica da arte de uma página. */
export type ResultadoDaCopyDePlano =
  /** Havia dica e o desfecho foi calculado e gravado. */
  | 'fechada'
  /** Havia dica, mas não deu para comparar os dois lados — fica pendente. */
  | 'indecisa'
  /** Esta arte não veio de leva (ou o item nunca recebeu dica). */
  | 'sem-plano'
  | 'erro'

/**
 * Só `sem-plano` autoriza o chamador a registrar a **escolha absoluta**.
 *
 * `fechada` já registrou o desfecho — registrar de novo é a contagem dupla que
 * este arquivo existe para impedir. `indecisa` deixou a proposta pendente de
 * propósito. E `erro` é o caso perigoso: sem saber se havia dica, abrir uma
 * linha paralela pode ser exatamente o defeito; perder um sinal num soluço de
 * banco é o preço barato.
 */
export function caiNaEscolhaPropria(resultado: ResultadoDaCopyDePlano): boolean {
  return resultado === 'sem-plano'
}
