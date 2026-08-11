/**
 * O CONTRATO da rodada de classificação de pilares — o que ela decide,
 * separado de como ela executa (`pilares-service.ts` e a rota de cron).
 *
 * Módulo PURO de propósito: sem Prisma, sem rede. `@/lib/db` lança no import
 * quando falta `DATABASE_URL`, e estas são justamente as regras que precisam ser
 * testáveis sem banco — mesmo precedente de `reconciliacao.ts`, `pilares.ts` e
 * `approval-checklist.ts`. Também é o que permite ao card da aba Marca (client)
 * usar a mesma frase de progresso que a rota devolve.
 *
 * As duas funções emprestadas de `@/lib/creatives/reconciliacao` (`haTempo` e
 * `rotacionarPorDia`) são REUSADAS, não copiadas: o defeito que elas evitam —
 * relógio que corta + ordem fixa = starvation silenciosa — é o mesmo aqui, e
 * duas cópias divergem no dia em que uma for corrigida.
 */

import { haTempo, rotacionarPorDia } from '@/lib/creatives/reconciliacao'

/**
 * Quanto tempo a rodada inteira pode consumir, contra os 300s de `maxDuration`.
 *
 * A folga de 80s tem tamanho MEDIDO: o que fica em voo quando o relógio estoura
 * é um LOTE, e a chamada de modelo do lote tem `TIMEOUT_MS = 60s`
 * (`classificador.ts`). Parar de pegar trabalho aos 220s significa, no pior
 * caso, terminar o lote em voo aos 280s e ainda ter ~20s para gravar e
 * responder. Um orçamento de 240s (o da reconciliação de catálogos) não caberia:
 * lá a folga cobre análises curtas, aqui ela precisa caber um timeout inteiro.
 */
export const ORCAMENTO_DA_RODADA_MS = 220_000

/**
 * Teto de posts classificados por PROJETO por rodada do cron.
 *
 * Existe para que um cliente com muito atraso não coma a rodada inteira e mate
 * os outros de fome — a rotação por dia resolve a ordem, mas não adianta
 * rotacionar se o primeiro da fila consome os 220s sozinho. 100 posts são 4
 * lotes (~88s pela medição de 11/08/2026: ~22s por lote de 25).
 *
 * O regime normal é muito menor que isto (um cliente publica unidades de peças
 * por dia); o teto é para o atraso. Backlog grande se limpa pelo botão da aba
 * Marca, que atende uma pessoa esperando e pode ser clicado de novo.
 */
export const LIMITE_POR_PROJETO = 100

/**
 * Teto padrão de um clique no botão "Classificar histórico".
 *
 * 🔴 Sem teto, o botão NÃO CONSEGUIA TERMINAR: medido no By Rock, 509 posts =
 * 21 lotes = 460s contra os 300s de `maxDuration`. Como cada lote grava ao
 * terminar, a pessoa via um erro sem saber que havia progredido — e clicar de
 * novo recomeçava do mesmo lugar, para sempre.
 *
 * 200 posts são 8 lotes (~176s), dentro do orçamento de 220s. O relógio é a
 * segunda trava, e a que vale quando um lote demora mais que a média.
 */
export const LIMITE_DA_UI = 200

/** Um projeto candidato à rodada, com o que decide se ele entra. */
export interface ProjetoDaRodada {
  id: number
  nome: string
  /** Quantos pilares APROVADOS o cliente tem. Zero significa "sem taxonomia". */
  pilaresAprovados: number
}

/**
 * Quem entra na rodada, e em que ordem.
 *
 * Projeto sem taxonomia aprovada é PULADO em silêncio: `taxonomiaAprovada`
 * devolvendo vazio significa "este cliente ainda não tem taxonomia", nunca erro
 * (a mesma leitura que todo consumidor faz dela). Deixá-lo na fila gastaria uma
 * passada de banco por dia para descobrir o mesmo nada.
 *
 * A ordem ROTACIONA por dia — ver `rotacionarPorDia`. Sem isso, ordem fixa +
 * relógio que corta faria o primeiro cliente ser classificado todo dia e o
 * último talvez nunca, que é exatamente o envelhecimento que este cron existe
 * para impedir.
 */
export function filaDeClassificacao<T extends { pilaresAprovados: number }>(
  projetos: readonly T[],
  data = new Date(),
): T[] {
  return rotacionarPorDia(
    projetos.filter((p) => p.pilaresAprovados > 0),
    data,
  )
}

export interface PercursoComOrcamento<T, R> {
  /** O que foi processado — na ordem da fila. */
  feitos: R[]
  /** Quem ficou de fora porque o relógio acabou. */
  adiados: T[]
}

/**
 * Percorre a fila com o relógio na mão.
 *
 * A regra é "parar de PEGAR trabalho", não "abortar o trabalho em voo": o item
 * que já começou termina, porque nesta frente o trabalho custa chamada paga de
 * modelo e resultado descartado é dinheiro jogado fora (mesma razão da folga de
 * `ORCAMENTO_DA_RODADA_MS`).
 *
 * O relógio é injetável para que o corte seja testável sem esperar 4 minutos.
 * Erro de um item é problema do `trabalhar` — quem chama é que decide como
 * registrar a falha sem derrubar a rodada.
 */
export async function percorrerComOrcamento<T, R>(
  itens: readonly T[],
  trabalhar: (item: T) => Promise<R>,
  opcoes: { prazoEm: number; agora?: () => number },
): Promise<PercursoComOrcamento<T, R>> {
  const agora = opcoes.agora ?? Date.now
  const feitos: R[] = []
  const adiados: T[] = []

  for (const item of itens) {
    if (!haTempo(opcoes.prazoEm, agora())) {
      adiados.push(item)
      continue
    }
    feitos.push(await trabalhar(item))
  }

  return { feitos, adiados }
}

/**
 * Quantos posts continuam esperando depois desta passada.
 *
 * `pendentes` é a foto do começo (quantos estavam por classificar na janela) e
 * `resolvidos` é o que ficou EFETIVAMENTE gravado — não o que entrou nos lotes.
 * A diferença importa: lote cujo modelo não respondeu deixa os posts como
 * estavam, e contá-los como resolvidos esconderia trabalho que ainda falta.
 *
 * Nunca negativo: entre a contagem e o fim da passada alguém pode ter
 * classificado pelo botão, e um "faltam -3" na tela é pior do que "faltam 0".
 */
export function restantesDaPassada(pendentes: number, resolvidos: number): number {
  return Math.max(0, pendentes - resolvidos)
}

/**
 * A frase que a tela mostra depois de classificar.
 *
 * Mora aqui, e não no componente, porque a rota precisa da MESMA frase no log e
 * porque "faltam M — clique de novo" é a informação que faltava quando o botão
 * estourava: sem ela a pessoa não tem como saber que houve progresso.
 */
export function fraseDoProgresso(r: {
  classificados: number
  semTexto: number
  restantes: number
}): string {
  if (r.classificados === 0 && r.restantes === 0) {
    return 'Nada novo para classificar — o histórico já está em dia.'
  }

  const semTexto = r.semTexto > 0 ? ` (${r.semTexto} sem texto no sistema)` : ''
  const feito = `${r.classificados} publicação(ões) classificadas${semTexto}.`

  return r.restantes > 0
    ? `${feito} Faltam ${r.restantes} — clique de novo para continuar.`
    : `${feito} Histórico em dia.`
}
