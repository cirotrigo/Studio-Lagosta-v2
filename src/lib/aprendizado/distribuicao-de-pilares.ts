/**
 * A distribuição de assuntos de um cliente, PESADA POR RECÊNCIA.
 *
 * Antes disto o perfil contava os pilares com um `groupBy` chapado de 180 dias:
 * um happy hour que o cliente parou de fazer em março pesava igual ao que ele
 * fez ontem. O mesmo perfil tinha o *quando* (cadência) decaindo com meia-vida
 * de 21 dias e o *sobre o quê* achatado — a assimetria que este módulo fecha,
 * reusando `pesoPorRecencia` de `cadencia.ts` em vez de inventar outra curva.
 *
 * 🔴 **Por que pesar e não CORTAR por idade.** Medido em 11/08/2026: cortar em
 * 40 dias deixaria cada cliente com 15 a 56 posts de texto — o Bacana com 15,
 * espalhados por 6 pilares, o que não é distribuição, é ruído; ele e o Wine Vix
 * voltariam ao cold start. Com decaimento, o post de cinco meses continua
 * contando, só que pouco. A cobertura do corpus é medida por
 * `scripts/cobertura-de-aprendizado.ts`.
 *
 * 🔴 **A âncora é a ÚLTIMA ATIVIDADE do cliente, não o relógio** — mesma lição
 * que `cadencia.ts` pagou caro: ancorando no relógio, cliente que passou umas
 * semanas sem publicar via todo o peso evaporar e o sistema emudecia justamente
 * com quem precisava voltar a postar. Recência é comparação DENTRO do
 * histórico.
 *
 * Módulo PURO (sem Prisma, sem rede): quem carrega as linhas é o serviço.
 */

import { pesoPorRecencia } from '@/lib/posts/cadencia'

export interface PostComPilar {
  /** Slug do pilar. Reservados (`outro`, `sem-texto`) NÃO entram aqui. */
  pilar: string
  quando: Date | null
}

export interface PilarPesado {
  pilar: string
  /** Quantos posts, CRU — é o que diz se há dado suficiente para confiar. */
  total: number
  /** Soma dos pesos por recência. */
  peso: number
  /**
   * Participação do pilar, **pesada por recência**.
   *
   * ⚠️ Não é `total / soma(total)`: dois pilares com a mesma contagem têm
   * frações diferentes quando um é recente e o outro é antigo. É de propósito —
   * é o ponto do módulo — e é por isso que `total` continua exposto ao lado.
   */
  fracao: number
}

/**
 * A referência de tempo: a última atividade do cliente, nunca à frente de agora.
 * Sem nenhuma data utilizável, cai em `agora`.
 */
export function referenciaDeRecencia(posts: PostComPilar[], agora: Date): Date {
  let ultima = 0
  for (const p of posts) {
    if (p.quando) ultima = Math.max(ultima, p.quando.getTime())
  }
  return ultima > 0 ? new Date(Math.min(ultima, agora.getTime())) : agora
}

/**
 * Distribuição por pilar, pesada por recência e ordenada da maior para a menor.
 *
 * Post sem data não é descartado (ele aconteceu): entra na contagem crua com
 * peso zero. Se NENHUM post tiver data, o módulo cai na contagem chapada — sem
 * data não há recência a medir, e devolver tudo zerado seria pior que a
 * resposta antiga.
 */
export function distribuicaoPorRecencia(
  posts: PostComPilar[],
  agora: Date = new Date(),
): PilarPesado[] {
  if (posts.length === 0) return []

  const referencia = referenciaDeRecencia(posts, agora)
  const porPilar = new Map<string, { total: number; peso: number }>()

  for (const post of posts) {
    const atual = porPilar.get(post.pilar) ?? { total: 0, peso: 0 }
    atual.total += 1
    if (post.quando) atual.peso += pesoPorRecencia(post.quando, referencia)
    porPilar.set(post.pilar, atual)
  }

  const somaDePeso = [...porPilar.values()].reduce((t, p) => t + p.peso, 0)
  const somaDeTotal = [...porPilar.values()].reduce((t, p) => t + p.total, 0)
  // Sem nenhuma data utilizável, a fração volta a ser a contagem chapada.
  const usarPeso = somaDePeso > 0

  return [...porPilar.entries()]
    .map(([pilar, { total, peso }]) => ({
      pilar,
      total,
      peso,
      fracao: usarPeso
        ? Math.round((peso / somaDePeso) * 100) / 100
        : Math.round((total / Math.max(1, somaDeTotal)) * 100) / 100,
    }))
    .sort((a, b) => b.fracao - a.fracao || b.total - a.total)
}
