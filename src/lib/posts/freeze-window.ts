/**
 * Janela de congelamento — o instante em que a arte deixa de ser editável.
 *
 * O Zernio é o publicador externo. Enquanto o post não foi entregue a ele
 * (`laterPostId` nulo), a arte no banco é a única fonte de verdade e pode ser
 * editada à vontade. Depois de entregue, é a cópia do Zernio que vai ao ar —
 * e nada no funil de render fala com ele, então editar aqui não muda mais
 * nada lá.
 *
 * Até 03/08/2026 o PRE-SEND do executor entregava TODO post futuro assim que
 * ficasse renderizado, sem limite superior de data: mediana de 39 segundos
 * após o agendamento, com posts congelados por até 27 dias. O resultado é que
 * a liberdade de editar acabava, na mediana, 13,9h antes do horário — e
 * acabava em silêncio. Medido em 33 dias: 29 posts tiveram a arte
 * re-renderizada depois de já estarem no Zernio e publicaram a versão velha.
 *
 * Agora a entrega só acontece dentro da janela. Antes dela o post vive só no
 * Studio; ao entrar, é entregue e a interface passa a dizer isso.
 *
 * O tamanho da janela é um equilíbrio entre duas coisas que se opõem:
 *   - encurtar aumenta o tempo editável (o que se quer);
 *   - encurtar reduz a folga para o sistema se recuperar de uma falha antes
 *     do horário — a cadeia de retry leva ~7 min e um outage do Zernio de 9
 *     min já aconteceu (03/08/2026, 17:01–17:10).
 *
 * Com 5 minutos a cadeia de retry ainda cabe (falha em T−5 → tentativas em
 * T−4, T−3 e T−2, todas antes do horário), mas por pouco: um outage do
 * publicador mais longo que isso esgota as tentativas e o post morre FAILED,
 * sem ninguém repescar — as três consultas do executor filtram SCHEDULED.
 * Foi o preço aceito para maximizar o tempo editável; encurtar mais exigiria
 * repescagem automática de FAILED antes.
 *
 * ⚠️  A janela também mudou QUEM responde pelo horário. Enquanto a entrega
 * acontecia horas antes, uma queda do nosso cron era irrelevante — o post já
 * estava no publicador e saía sozinho. Agora, se o cron estiver fora do ar
 * nos minutos finais, ninguém publica. O catch-up do executor cobre 6 horas;
 * passado isso, quem resgata é o caso (c) do `checkStuckPosts`, que marca
 * FAILED e avisa a equipe em vez de publicar fora de hora. Quem for encurtar
 * esta janela precisa ler este parágrafo antes.
 */
import type { PostStatus } from '../../../prisma/generated/client'

/**
 * Antecedência com que o post é entregue ao Zernio. Escolhido pelo Ciro em
 * 03/08/2026 sobre a curva medida: 5 min captura 29/29 dos casos de arte
 * trocada depois da entrega (15 min captura 26/29).
 */
export const FREEZE_WINDOW_MS = 5 * 60 * 1000

/**
 * Quanto antes do horário o cron de render prioriza a fila. Maior que a
 * janela de propósito: a arte precisa estar pronta ANTES de congelar, senão
 * o congelamento chega e não há o que entregar.
 */
export const PRIORIDADE_RENDER_MS = 15 * 60 * 1000

/** O instante em que este post deixa de ser editável. */
export function congelaEm(scheduledDatetime: Date): Date {
  return new Date(scheduledDatetime.getTime() - FREEZE_WINDOW_MS)
}

/**
 * O post já foi entregue ao publicador? É um fato, não uma previsão: o que
 * decide é ter `laterPostId`, não o relógio. Post que ainda não coube na
 * rodada do cron continua editável mesmo depois do horário de congelar.
 *
 * Aceita as duas formas porque as rotas da agenda NÃO mandam o `laterPostId`
 * para o cliente — id de sistema externo não precisa trafegar — e sim o
 * booleano `congelado` já derivado.
 */
export function estaCongelado(post: {
  laterPostId?: string | null
  congelado?: boolean
}): boolean {
  if (typeof post.congelado === 'boolean') return post.congelado
  return post.laterPostId != null
}

/**
 * Já passou do horário de congelar (mesmo que a entrega ainda não tenha
 * acontecido). Serve para a interface avisar "congela a qualquer momento".
 */
export function entrouNaJanela(
  post: { scheduledDatetime?: Date | null },
  agora: Date = new Date(),
): boolean {
  if (!post.scheduledDatetime) return false
  return congelaEm(post.scheduledDatetime).getTime() <= agora.getTime()
}

/**
 * Frase em português para a agenda, o chat e as tools do MCP. Nunca devolve
 * jargão de banco — quem lê é a equipe de conteúdo, não quem escreveu o
 * schema.
 */
export function descreverJanela(post: {
  laterPostId?: string | null
  congelado?: boolean
  scheduledDatetime?: Date | string | null
  status?: PostStatus | string | null
}): { congelado: boolean; iminente: boolean; rotulo: string; mensagem: string; congelaEm?: Date } {
  if (estaCongelado(post)) {
    return {
      congelado: true,
      iminente: false,
      rotulo: 'Enviada para publicação',
      mensagem:
        'Esta arte já foi enviada para publicação e não aceita mais alteração. ' +
        'Para trocar, cancele o agendamento e agende de novo.',
    }
  }

  const agendado = post.scheduledDatetime ? new Date(post.scheduledDatetime) : null
  if (!agendado || Number.isNaN(agendado.getTime())) {
    return {
      congelado: false,
      iminente: false,
      rotulo: 'Editável',
      mensagem: 'Esta arte ainda pode ser editada.',
    }
  }

  const quando = congelaEm(agendado)
  const horaBRT = quando.toLocaleString('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    dateStyle: 'short',
    timeStyle: 'short',
  })

  if (quando.getTime() <= Date.now()) {
    return {
      congelado: false,
      iminente: true,
      congelaEm: quando,
      rotulo: 'Congela a qualquer momento',
      mensagem:
        'Esta arte vai ser enviada para publicação a qualquer momento — ' +
        'edição a partir de agora pode não entrar.',
    }
  }

  return {
    congelado: false,
    iminente: false,
    congelaEm: quando,
    rotulo: `Editável até ${horaBRT}`,
    mensagem: `Editável até ${horaBRT}, quando a arte é enviada para publicação.`,
  }
}
