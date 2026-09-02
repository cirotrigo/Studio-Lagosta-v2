/**
 * Como o sistema descobre que um modelo "é do dia tal".
 *
 * Não existe campo de dia da semana em `Page`: o vínculo é textual — o nome da
 * página, o nome do template e as tags de um e de outro. `sugerirPosts` casa o
 * modelo com o dia por essa regra, e o inventário de curadoria
 * (`scripts/inventario-uso-modelos.ts`) precisa casar EXATAMENTE do mesmo jeito
 * — senão a curadoria despromove um modelo que a sugestão ainda enxerga como o
 * único daquele dia, e a sugestão perde o dia em silêncio.
 *
 * Mora em módulo separado e SEM dependências justamente para os dois lados
 * poderem importar: `sugerir-posts.ts` puxa `@/lib/db`, e um script de
 * manutenção não deveria acordar o cliente do Prisma da aplicação só para
 * reaproveitar seis linhas de normalização.
 */

/** Índice = `Date.getUTCDay()` em BRT. */
export const DIAS_SEMANA = [
  'domingo',
  'segunda',
  'terça',
  'quarta',
  'quinta',
  'sexta',
  'sábado',
] as const

export type DiaSemana = (typeof DIAS_SEMANA)[number]

/** Minúsculas sem acento — "Sábado" e "sabado" precisam casar. */
export function normalizar(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
}

/**
 * O modelo atende ao dia `dia` (0=domingo)? Basta QUALQUER um dos textos
 * (nome da página, nome do template, tags dos dois) conter o nome do dia — é o
 * que faz "Quinta-feira", "quinta" e "By Rock — Quinta" casarem igual.
 */
export function casaComDia(textos: Array<string | null | undefined>, dia: number): boolean {
  const alvo = normalizar(DIAS_SEMANA[dia])
  /**
   * 🔴 Por TOKEN, nunca por substring. "quinta" está dentro de "Quintal", e
   * com `includes` TODO template de "O Quintal Parrilla — …" era "de quinta":
   * foi assim que `escolher-modelo("funcionamento")` devolveu "Celebrações
   * Especiais" em 01/09/2026 — o primeiro da lista vencia o desempate por dia.
   * "Quinta-feira" e "By Rock — Quinta" continuam casando: o hífen e o espaço
   * separam tokens.
   */
  return textos.some((t) => (t ? tokens(normalizar(t)).includes(alvo) : false))
}

function tokens(texto: string): string[] {
  return texto.split(/[^a-z0-9]+/).filter(Boolean)
}

/** Todos os dias que o modelo atende — normalmente zero ou um. */
export function diasDoModelo(textos: Array<string | null | undefined>): DiaSemana[] {
  const dias: DiaSemana[] = []
  for (let dia = 0; dia < 7; dia++) {
    if (casaComDia(textos, dia)) dias.push(DIAS_SEMANA[dia])
  }
  return dias
}

/**
 * CURINGA: o modelo que não declara dia nenhum serve a QUALQUER dia.
 *
 * Existe por causa dos modelos de base ("Story base — 3 layouts", do TERO e do
 * Wine Vix): eles são genéricos por desenho — as tags descrevem a DIAGRAMAÇÃO
 * (topo/dividido/rodapé), não o assunto — e por isso não têm dia. Antes disso
 * a única forma de o modelo aparecer na sugestão era declarar um dia no nome
 * ou nas tags, e foi o que levou alguém a carimbar `quinta` neles: um modelo
 * para qualquer dia preso a um só.
 *
 * 🔴 Tirar a tag do dia NÃO resolvia — `casaComDia` só dá match quando o texto
 * CONTÉM o nome do dia, então o modelo sem dia simplesmente sumia da sugestão.
 * Medido em 16/08/2026: sem `quinta`, TERO e Wine Vix perdiam o único modelo
 * de quinta e não ganhavam nenhum outro dia.
 */
export function ehCuringaDeDia(textos: Array<string | null | undefined>): boolean {
  return diasDoModelo(textos).length === 0
}

/** A chave `dia:*` do curinga, na contabilidade de cobertura. */
export const CHAVE_DIA_CURINGA = 'dia:*'

/**
 * As chaves de cobertura de dia deste modelo.
 *
 * Curinga NÃO recebe as sete chaves: ele viraria "único cobridor" de todo dia
 * e nunca poderia ser despromovido. Recebe `dia:*`, que é o que ele realmente
 * é — a reserva. Perder o último curinga do cliente tira a reserva de todos os
 * dias, e é isso que a proteção contra chave órfã precisa enxergar.
 */
export function chavesDeDia(textos: Array<string | null | undefined>): string[] {
  const dias = diasDoModelo(textos)
  return dias.length > 0 ? dias.map((d) => `dia:${d}`) : [CHAVE_DIA_CURINGA]
}

/**
 * O modelo para um dia: ESPECÍFICO primeiro, curinga como reserva.
 *
 * A prioridade é o ponto todo — um modelo carimbado "Sábado" tem de ganhar do
 * genérico no sábado, e o genérico só entra onde não há específico. Mora aqui,
 * e não em quem chama, porque `sugerirPosts` e o inventário de curadoria
 * (`scripts/inventario-uso-modelos.ts`) PRECISAM casar exatamente do mesmo
 * jeito: divergir faz a curadoria despromover um modelo que a sugestão ainda
 * enxerga como o único daquele dia, e a sugestão perder o dia em silêncio.
 */
export function escolherModeloDoDia<T>(
  modelos: readonly T[],
  textosDe: (modelo: T) => Array<string | null | undefined>,
  dia: number,
): { modelo: T; curinga: boolean } | undefined {
  const especifico = modelos.find((m) => casaComDia(textosDe(m), dia))
  if (especifico) return { modelo: especifico, curinga: false }

  const curinga = modelos.find((m) => ehCuringaDeDia(textosDe(m)))
  return curinga ? { modelo: curinga, curinga: true } : undefined
}
