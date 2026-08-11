/**
 * Os sinais do agendamento — a parte PURA: como um horário vira contexto de
 * cadência e quais chaves de idempotência ele carrega.
 *
 * Módulo SEM Prisma de propósito. `@/lib/db` **lança no import** quando falta
 * `DATABASE_URL`, e desde que `sinal-de-agendamento.ts` passou a fechar a dica
 * de copy ele arrasta o banco por dois caminhos (`captura` e
 * `fechar-copy-por-pagina`) — o teste destas três funções não conseguia sequer
 * carregar o arquivo. É a mesma separação que já obrigou
 * `fechar-copy-por-pagina-contrato.ts`, `dica-de-copy-contrato.ts`,
 * `para-bancada.ts`, `approval-checklist.ts` e `text-comparison.ts` a saírem
 * dos seus serviços.
 *
 * O segundo motivo é um CICLO: `sinal-de-agendamento` → `fechar-copy-por-pagina`
 * → `sinal-de-copy-do-plano` → `sinal-de-agendamento`. Ele nasceu quando o
 * agendamento passou a fechar a dica, e some quando quem só quer a conversão de
 * fuso a importa daqui.
 *
 * O que mora aqui é justamente o tipo de coisa que ninguém percebe estar
 * errada: um slot gravado em UTC vira "story das 21h" que o relatório mostra
 * como meia-noite do dia seguinte, e uma chave que não bate faz o mesmo post
 * virar duas linhas de cadência.
 */

/** Chave de idempotência da decisão de slot de um post. Um post, uma linha. */
export function chaveDoSlot(postId: string): string {
  return `slot:post:${postId}`
}

/** Idem para a copy que foi de fato comprometida no post. */
export function chaveDaCopy(postId: string): string {
  return `copy:post:${postId}`
}

const FUSO = 'America/Sao_Paulo'

/**
 * Quando o post vai ao ar, em horário de Brasília e já quebrado nos campos que
 * a cadência precisa.
 *
 * Guardar o `Date` cru obrigaria todo consumidor a repetir a conversão de fuso
 * — e é assim que aparece "story das 21h" que na verdade é meia-noite UTC.
 */
export function slotEmBrasilia(quando: Date): {
  data: string
  hora: string
  diaDaSemana: string
  iso: string
} {
  const partes = new Intl.DateTimeFormat('pt-BR', {
    timeZone: FUSO,
    weekday: 'long',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(quando)
  const p = (tipo: string) => partes.find((x) => x.type === tipo)?.value ?? ''
  return {
    data: `${p('year')}-${p('month')}-${p('day')}`,
    hora: `${p('hour')}:${p('minute')}`,
    diaDaSemana: p('weekday'),
    iso: quando.toISOString(),
  }
}
