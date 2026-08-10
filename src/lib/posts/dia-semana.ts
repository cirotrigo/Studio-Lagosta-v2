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
  return textos.some((t) => (t ? normalizar(t).includes(alvo) : false))
}

/** Todos os dias que o modelo atende — normalmente zero ou um. */
export function diasDoModelo(textos: Array<string | null | undefined>): DiaSemana[] {
  const dias: DiaSemana[] = []
  for (let dia = 0; dia < 7; dia++) {
    if (casaComDia(textos, dia)) dias.push(DIAS_SEMANA[dia])
  }
  return dias
}
