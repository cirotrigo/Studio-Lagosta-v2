/**
 * A EDIÇÃO crua de um SocialPost (`update-post` do MCP local) diante do contrato semântico novo — B1d,
 * checkpoint c.
 *
 * Roda DENTRO da transação de quem grava: lê a linha com `SELECT … FOR UPDATE`, decide e devolve o que gravar,
 * para a decisão valer para a linha que será escrita (sem leitura solta seguida de update incondicional).
 *
 * - Post e pedido sem `_slots`/`_papeis`: `{ semantico: false }` — a edição legada segue como sempre.
 * - Contrato novo (antes ou depois da edição): a MESMA admissão do `createPost`, contra a página EFETIVA (a
 *   nova, se veio, senão a gravada). Recusa retirar o contrato de um post semântico (seria um atalho em torno
 *   da guarda de envio) e editar post já entregue. Mudar o pedido INVALIDA o render: a mídia e o RENDERED
 *   anteriores afirmariam uma arte que não é mais a pedida.
 * - RENDER_FAILED (checkpoint f): só a falha SEMÂNTICA (envelope de `lerErroRenderSemantico`) de um post ainda
 *   recuperável — DRAFT ou SCHEDULED com horário futuro (status e data EFETIVOS: o update-post grava os dois
 *   junto), sem vídeo, mídia coberta pelo render da página, sem retry de publicação ativo — e só se o pedido NOVO
 *   passar na admissão. Erro comum continua terminal; post vencido ou FAILED não ressuscita.
 */
import { admitirPedidoSemantico, type ClienteDeAdmissao } from './admitir-pedido-semantico'
import { temContratoSemantico } from './copy-segue-a-pagina'
import { lerErroRenderSemantico } from './erro-render-semantico'
import { renderDaPaginaCobreAMidia } from './render-da-pagina'
import { postDeVideo } from './post-de-video'

export type CodigoDaEdicao =
  | 'POST_NAO_ENCONTRADO'
  | 'CONTRATO_NAO_PODE_SER_REMOVIDO'
  | 'POST_JA_ENTREGUE'
  | 'RENDER_FAILED_SEM_RECUPERACAO'
  | 'RECUPERACAO_FORA_DO_PRAZO'
  | 'RECUPERACAO_SEM_RENDER_DA_PAGINA'
  | 'RECUPERACAO_COM_PUBLICACAO_PENDENTE'

const MENSAGENS: Record<CodigoDaEdicao, string> = {
  POST_NAO_ENCONTRADO: 'Post não encontrado.',
  CONTRATO_NAO_PODE_SER_REMOVIDO: 'Este post usa o contrato semântico (_slots/_papeis); ele não pode ser retirado por edição.',
  POST_JA_ENTREGUE: 'O post já foi entregue ao publicador (ou está sendo); o pedido semântico não pode mais mudar.',
  RENDER_FAILED_SEM_RECUPERACAO: 'O render deste post falhou por um erro que não é do contrato semântico; corrigir o pedido não o reabre.',
  RECUPERACAO_FORA_DO_PRAZO: 'O render semântico deste post falhou, mas ele não pode voltar sozinho: está FAILED ou o horário já passou. Reagende (ou volte para rascunho) antes de corrigir.',
  RECUPERACAO_SEM_RENDER_DA_PAGINA: 'O render semântico deste post falhou, mas a mídia dele não sai do render da página (vídeo ou carrossel).',
  RECUPERACAO_COM_PUBLICACAO_PENDENTE: 'O render semântico deste post falhou e há uma nova tentativa de publicação pendente; ela enviaria cedo a arte corrigida.',
}

export class ErroEdicaoSemantica extends Error {
  constructor(readonly codigo: CodigoDaEdicao) {
    super(MENSAGENS[codigo])
    this.name = 'ErroEdicaoSemantica'
  }
}

export interface ClienteDeEdicao extends ClienteDeAdmissao {
  $queryRaw<T = unknown>(query: TemplateStringsArray, ...values: unknown[]): Promise<T>
  postRetry: { count(args: { where: { postId: string; status: { in: Array<'PENDING' | 'PROCESSING'> } } }): Promise<number> }
}

export interface MudancaDoPost {
  pageId?: string
  slotValues?: unknown
  mediaUrls?: string[]
  /** Status e data que a MESMA escrita grava (update-post): os gates da recuperação olham os valores efetivos. */
  status?: string
  scheduledDatetime?: Date | null
}

type LinhaDoPost = {
  id: string
  projectId: number
  postType: string
  pageId: string | null
  slotValues: unknown
  laterPostId: string | null
  status: string
  renderStatus: string
  renderError: string | null
  scheduledDatetime: Date | null
  videoDaPagina: boolean
  mediaUrls: string[]
}

export async function prepararEdicaoSemantica(
  tx: ClienteDeEdicao,
  postId: string,
  mudanca: MudancaDoPost,
): Promise<{ semantico: false } | { semantico: true; data: Record<string, unknown> }> {
  const [linha] = await tx.$queryRaw<LinhaDoPost[]>`
    SELECT "id", "projectId", "postType"::text AS "postType", "pageId", "slotValues", "laterPostId",
           "status"::text AS "status", "renderStatus"::text AS "renderStatus",
           "renderError", "scheduledDatetime", "videoDaPagina", "mediaUrls"
    FROM "SocialPost" WHERE "id" = ${postId} FOR UPDATE`
  if (!linha) throw new ErroEdicaoSemantica('POST_NAO_ENCONTRADO')

  const slotValues = mudanca.slotValues !== undefined ? mudanca.slotValues : linha.slotValues
  const eraSemantico = temContratoSemantico(linha.slotValues)
  if (!eraSemantico && !temContratoSemantico(slotValues)) return { semantico: false }

  if (eraSemantico && !temContratoSemantico(slotValues)) throw new ErroEdicaoSemantica('CONTRATO_NAO_PODE_SER_REMOVIDO')
  const status = mudanca.status ?? linha.status
  const quando = mudanca.scheduledDatetime !== undefined ? mudanca.scheduledDatetime : linha.scheduledDatetime
  const entregue = (s: string) => s === 'POSTING' || s === 'POSTED'
  if (linha.laterPostId || entregue(linha.status) || entregue(status)) throw new ErroEdicaoSemantica('POST_JA_ENTREGUE')
  if (linha.renderStatus === 'RENDER_FAILED') {
    if (!eraSemantico || !lerErroRenderSemantico(linha.renderError)) throw new ErroEdicaoSemantica('RENDER_FAILED_SEM_RECUPERACAO')
    const noPrazo = linha.status !== 'FAILED' && (status === 'DRAFT' || (status === 'SCHEDULED' && !!quando && quando.getTime() > Date.now()))
    if (!noPrazo) throw new ErroEdicaoSemantica('RECUPERACAO_FORA_DO_PRAZO')
    if (postDeVideo(linha) || !renderDaPaginaCobreAMidia(linha.mediaUrls)) throw new ErroEdicaoSemantica('RECUPERACAO_SEM_RENDER_DA_PAGINA')
    const retries = await tx.postRetry.count({ where: { postId, status: { in: ['PENDING', 'PROCESSING'] } } })
    if (retries > 0) throw new ErroEdicaoSemantica('RECUPERACAO_COM_PUBLICACAO_PENDENTE')
  }

  await admitirPedidoSemantico(tx, {
    projectId: linha.projectId,
    postType: linha.postType,
    pageId: mudanca.pageId ?? linha.pageId,
    // A mídia gravada é a do render anterior, invalidada abaixo; só mídia NOVA conta como "pronta".
    mediaUrls: mudanca.mediaUrls ?? [],
    slotValues,
  })

  return {
    semantico: true,
    data: {
      slotValues,
      mediaUrls: [],
      renderedImageUrl: null,
      renderedAt: null,
      renderStatus: 'PENDING',
      nextRenderAt: new Date(),
      renderAttempts: 0,
      renderError: null,
    },
  }
}
