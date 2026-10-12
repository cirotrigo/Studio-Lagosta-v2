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
 *   da guarda de envio), editar post já entregue, e post em RENDER_FAILED (reabrir é do checkpoint f). Mudar o
 *   pedido INVALIDA o render: a mídia e o RENDERED anteriores afirmariam uma arte que não é mais a pedida.
 */
import { admitirPedidoSemantico, type ClienteDeAdmissao } from './admitir-pedido-semantico'
import { temContratoSemantico } from './copy-segue-a-pagina'

export type CodigoDaEdicao = 'POST_NAO_ENCONTRADO' | 'CONTRATO_NAO_PODE_SER_REMOVIDO' | 'POST_JA_ENTREGUE' | 'RENDER_FAILED_SEM_RECUPERACAO'

const MENSAGENS: Record<CodigoDaEdicao, string> = {
  POST_NAO_ENCONTRADO: 'Post não encontrado.',
  CONTRATO_NAO_PODE_SER_REMOVIDO: 'Este post usa o contrato semântico (_slots/_papeis); ele não pode ser retirado por edição.',
  POST_JA_ENTREGUE: 'O post já foi entregue ao publicador (ou está sendo); o pedido semântico não pode mais mudar.',
  RENDER_FAILED_SEM_RECUPERACAO: 'O render deste post falhou; a edição do pedido semântico ainda não reabre o render.',
}

export class ErroEdicaoSemantica extends Error {
  constructor(readonly codigo: CodigoDaEdicao) {
    super(MENSAGENS[codigo])
    this.name = 'ErroEdicaoSemantica'
  }
}

export interface ClienteDeEdicao extends ClienteDeAdmissao {
  $queryRaw<T = unknown>(query: TemplateStringsArray, ...values: unknown[]): Promise<T>
}

export interface MudancaDoPost {
  pageId?: string
  slotValues?: unknown
  mediaUrls?: string[]
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
}

export async function prepararEdicaoSemantica(
  tx: ClienteDeEdicao,
  postId: string,
  mudanca: MudancaDoPost,
): Promise<{ semantico: false } | { semantico: true; data: Record<string, unknown> }> {
  const [linha] = await tx.$queryRaw<LinhaDoPost[]>`
    SELECT "id", "projectId", "postType"::text AS "postType", "pageId", "slotValues", "laterPostId",
           "status"::text AS "status", "renderStatus"::text AS "renderStatus"
    FROM "SocialPost" WHERE "id" = ${postId} FOR UPDATE`
  if (!linha) throw new ErroEdicaoSemantica('POST_NAO_ENCONTRADO')

  const slotValues = mudanca.slotValues !== undefined ? mudanca.slotValues : linha.slotValues
  const eraSemantico = temContratoSemantico(linha.slotValues)
  if (!eraSemantico && !temContratoSemantico(slotValues)) return { semantico: false }

  if (eraSemantico && !temContratoSemantico(slotValues)) throw new ErroEdicaoSemantica('CONTRATO_NAO_PODE_SER_REMOVIDO')
  if (linha.laterPostId || linha.status === 'POSTING' || linha.status === 'POSTED') throw new ErroEdicaoSemantica('POST_JA_ENTREGUE')
  if (linha.renderStatus === 'RENDER_FAILED') throw new ErroEdicaoSemantica('RENDER_FAILED_SEM_RECUPERACAO')

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
