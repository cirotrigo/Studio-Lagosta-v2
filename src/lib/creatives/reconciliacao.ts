/**
 * O CONTRATO da reconciliação do catálogo de imagens — o que ela decide,
 * separado de como ela executa (`reconciliar-catalogo.ts`).
 *
 * Módulo PURO de propósito: sem Prisma, sem Drive, sem rede. `@/lib/db` lança
 * no import quando falta `DATABASE_URL`, e estas são justamente as regras que
 * precisam ser testáveis sem banco — mesmo precedente de `page-layers.ts` e
 * `approval-checklist.ts`.
 */

/**
 * Até onde a varredura desce.
 *
 * Mesmo 4 de `acervo.ts` e do `analyze-drive-images.ts`: o Wine Vix guarda o
 * almoço executivo em `Executivo/Principais/Ancho` (três níveis), e 5 dos 10
 * clientes usam terceiro nível. Reconciliar com profundidade menor que a da
 * catalogação declararia órfã toda foto que mora fundo demais — e apagaria do
 * catálogo um acervo que existe.
 */
export const PROFUNDIDADE_MAXIMA = 4

/**
 * Teto de fotos NOVAS analisadas por projeto por rodada.
 *
 * A análise é uma chamada paga de visão por foto. Com o acervo já catalogado,
 * a rodada normal encontra unidades de fotos novas; o teto existe para o dia
 * em que um fotógrafo despeja uma sessão inteira — o resto entra nas rodadas
 * seguintes, porque a reconciliação é idempotente (diff de ids, sem janela de
 * data).
 *
 * 200 desde 29/08/2026 (era 120): sessão típica de fotógrafo cabe numa noite.
 * Acima disso quem corta primeiro costuma ser o ORCAMENTO_DA_RODADA_MS, e o
 * excedente rola para a madrugada seguinte do mesmo jeito.
 */
export const MAX_NOVAS_POR_PROJETO_POR_DIA = 200

/** Análises simultâneas por projeto. O tempo é quase todo espera de rede. */
export const CONCORRENCIA_ANALISE = 4

/**
 * Quanto tempo a rodada inteira pode consumir, contra os 300s de `maxDuration`.
 *
 * A folga de 60s não é conforto: quando o relógio estoura, pode haver até
 * `CONCORRENCIA_ANALISE` análises em voo (dezenas de segundos cada) e ainda
 * falta gravar o catálogo no Drive. Parar de PEGAR trabalho aos 240s é o que
 * garante que o que já foi analisado seja SALVO em vez de morrer com a
 * invocação — análise perdida é dinheiro perdido.
 */
export const ORCAMENTO_DA_RODADA_MS = 240_000

/**
 * Fração do catálogo que uma única rodada se recusa a podar.
 *
 * Um acervo não perde metade das fotos num dia; varredura que falha em
 * silêncio (credencial, permissão, pasta reapontada), sim. Como o catálogo no
 * Drive é a única cópia e o cron não tem quem confira, poda grande demais é
 * tratada como suspeita: a rodada não grava NADA e deixa o aviso no log.
 */
export const LIMITE_DE_PODA = 0.5

/** Abaixo disto a fração não diz nada — catálogo de 4 fotos perde 2 à toa. */
export const CATALOGO_MINIMO_PARA_PODA = 20

/** Por que um projeto não foi reconciliado nesta rodada. */
export type MotivoDePulo =
  | 'sem-pasta'
  | 'sem-catalogo'
  | 'catalogo-vazio'
  | 'varredura-vazia'
  | 'poda-suspeita'

export interface ResultadoReconciliacao {
  projectId: number
  projeto: string
  /** Entradas do catálogo cujo arquivo não existe mais no Drive. */
  orfasRemovidas: number
  /** Fotos vivas que não estavam no catálogo e foram analisadas agora. */
  novasCatalogadas: number
  /** Fotos novas que ficaram para a próxima rodada (teto ou relógio). */
  restantes: number
  /** Falhas de análise/foto — nunca derrubam a rodada. */
  erros: number
  /** Entradas antigas que ganharam o hash de conteúdo nesta rodada (B8). */
  hashesPreenchidos?: number
  /** Preenchido quando a rodada não mexeu no catálogo deste projeto. */
  pulado?: MotivoDePulo
  /** Erro que derrubou a reconciliação DESTE projeto (a rodada segue). */
  falha?: string
  duracaoMs: number
}

/**
 * O diff que é o coração da reconciliação: ids vivos no Drive × ids no
 * catálogo. SEM filtro de data — foi janela de `createdTime` que deixou 501+56
 * fotos antigas invisíveis para a busca; o diff não precisa dela.
 */
export function diffDeIds(
  vivos: Iterable<string>,
  catalogadas: Iterable<string>,
): { orfas: string[]; novas: string[] } {
  const conjuntoVivos = vivos instanceof Set ? vivos : new Set(vivos)
  const conjuntoCatalogadas = catalogadas instanceof Set ? catalogadas : new Set(catalogadas)

  const orfas: string[] = []
  for (const id of conjuntoCatalogadas) {
    if (!conjuntoVivos.has(id)) orfas.push(id)
  }

  const novas: string[] = []
  for (const id of conjuntoVivos) {
    if (!conjuntoCatalogadas.has(id)) novas.push(id)
  }

  return { orfas, novas }
}

/** Corta a leva no teto do dia e conta o que sobrou para amanhã. */
export function aplicarTeto<T>(novas: T[], teto = MAX_NOVAS_POR_PROJETO_POR_DIA) {
  if (teto <= 0) return { paraAnalisar: [] as T[], restantes: novas.length }
  const paraAnalisar = novas.slice(0, teto)
  return { paraAnalisar, restantes: novas.length - paraAnalisar.length }
}

/**
 * Poda grande demais para ser drift real — ver `LIMITE_DE_PODA`.
 */
export function podaSuspeita(totalNoCatalogo: number, orfas: number): boolean {
  if (totalNoCatalogo < CATALOGO_MINIMO_PARA_PODA) return false
  return orfas / totalNoCatalogo > LIMITE_DE_PODA
}

/** Ainda dá para pegar mais trabalho nesta invocação? */
export function haTempo(prazoEm: number, agora = Date.now()): boolean {
  return agora < prazoEm
}

/**
 * Rotaciona a fila de projetos pelo DIA.
 *
 * Sem isso, ordem fixa + relógio que corta significa que o primeiro projeto é
 * reconciliado todo dia e o último talvez nunca — starvation silenciosa, que é
 * exatamente o defeito que este cron existe para resolver. A rotação é
 * stateless (não há coluna de "última reconciliação" e esta frente não abre
 * migration) e garante que, em N dias, cada projeto é o primeiro pelo menos
 * uma vez.
 */
export function rotacionarPorDia<T>(itens: T[], data = new Date()): T[] {
  if (itens.length <= 1) return [...itens]
  const dia = Math.floor(data.getTime() / 86_400_000)
  const corte = ((dia % itens.length) + itens.length) % itens.length
  return [...itens.slice(corte), ...itens.slice(0, corte)]
}
