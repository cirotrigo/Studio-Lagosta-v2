/**
 * Invalidação da arte renderizada de posts agendados.
 *
 * O cron `render-stories` nunca revisita um post RENDERED — quem edita a
 * página depois do render precisa invalidar, senão a publicação sai com a
 * arte antiga. Essa lógica vivia inline no PUT do template e as rotas de
 * página não a tinham: editar um story agendado pelo editor publicava a
 * versão velha em silêncio.
 *
 * Um helper só para os três chamadores (PUT do template, PATCH da página,
 * PATCH de layer) — a regra em dois lugares foi exatamente o que deixou a
 * rota de página para trás.
 *
 * `mediaUrls` é limpo junto (o PUT do template não limpava): o cron grava
 * `mediaUrls: [url]` para o executor publicar, e o recover-stuck-post
 * reconstrói a publicação a partir dele — com o campo preenchido, um recover
 * manual num post PENDING mandaria a arte velha.
 */
import { PostStatus, RenderStatus, RetryStatus, type Prisma, type PrismaClient } from '../../../prisma/generated/client'
import { renderDaPaginaCobreAMidia } from './render-da-pagina'
import { postDeVideo } from './post-de-video'
import { lerErroRenderSemantico, PREFIXO_DO_ENVELOPE } from './erro-render-semantico'
import { temContratoSemantico } from './copy-segue-a-pagina'
import { admitirPedidoSemantico, ErroAdmissaoSemantica, type ClienteDeAdmissao } from './admitir-pedido-semantico'

/**
 * `normalizeLayersString` mudou de casa para `page-layers.ts` — um módulo SEM
 * Prisma, para que o diff de copy do aprendizado (que precisa da MESMA leitura
 * de camadas) possa importá-lo sem arrastar o banco. Continua exportada daqui:
 * os chamadores existentes não mudam.
 */
export { normalizeLayersString } from './page-layers'

type DbClient = PrismaClient | Prisma.TransactionClient

/**
 * `apenasRascunho` (perfil draft-only, H4): a edição só devolve à fila os RASCUNHOS da página. O agendado fica com
 * a arte que a pessoa aprovou, mesmo que ele tenha sido aprovado no meio da edição.
 */
export type InvalidateTarget = { templateId: number } | { pageIds: string[]; apenasRascunho?: boolean } | { postIds: string[] }

/**
 * Invalida a arte renderizada dos posts que dependem da página/template
 * alterado, devolvendo-os à fila de render.
 *
 * Vale para agendados e rascunhos: o cron `render-stories` renderiza os dois
 * (o rascunho precisa mostrar a arte certa na agenda muito antes de alguém
 * aprovar).
 */

export interface InvalidateResult {
  /** Posts devolvidos à fila de render. */
  invalidados: number
  /**
   * Posts que a edição NÃO alcança porque já foram entregues ao publicador.
   * Quem chama deve contar isso a quem editou — silêncio aqui é o bug que a
   * janela de congelamento veio corrigir.
   */
  congelados: string[]
  /** B1d (checkpoint f): falhas SEMÂNTICAS de render que a edição corrigiu e voltaram à fila (RENDER_FAILED → PENDING). */
  reabertos: number
}

export async function invalidateScheduledRenders(
  client: DbClient,
  target: InvalidateTarget,
): Promise<InvalidateResult> {
  const vazio: InvalidateResult = { invalidados: 0, congelados: [], reabertos: 0 }
  if ('pageIds' in target && target.pageIds.length === 0) return vazio
  if ('postIds' in target && target.postIds.length === 0) return vazio

  const alvo =
    'templateId' in target
      ? { templateId: target.templateId, pageId: { not: null } }
      : 'pageIds' in target
        ? { pageId: { in: target.pageIds }, ...(target.apenasRascunho ? { status: PostStatus.DRAFT } : {}) }
        : { id: { in: target.postIds }, pageId: { not: null } }

  const base = {
    // DRAFT entra junto: o rascunho criado pelo chat guarda o PNG do momento
    // da criação, e sem invalidar ele mostra a arte velha na agenda — e
    // publica ela na aprovação, porque a aprovação só manda renderizar
    // quando o post está sem mídia.
    status: { in: [PostStatus.SCHEDULED, PostStatus.DRAFT] },
    renderStatus: { in: [RenderStatus.RENDERED, RenderStatus.PENDING, RenderStatus.RENDERING] },
    ...alvo,
  }

  /**
   * Post já entregue ao publicador é INTOCÁVEL.
   *
   * A arte que vai ao ar é a cópia que está no Zernio, e nada aqui fala com
   * ele. Zerar `mediaUrls` de um post armado seria o pior dos dois mundos: a
   * publicação sairia com a arte antiga do mesmo jeito, e o post local
   * ficaria sem mídia — quebrando a capa na agenda e o recover manual, que
   * reconstrói a publicação a partir de `mediaUrls`.
   *
   * Antes da janela de congelamento isso alcançava quase todo post agendado
   * (a entrega acontecia ~39s após o agendamento). Agora só alcança quem está
   * nos últimos minutos antes do horário.
   */
  const congeladosRows = await client.socialPost.findMany({
    where: { ...base, laterPostId: { not: null } },
    select: { id: true },
  })

  /**
   * Post com VÁRIAS mídias não volta para a fila de render. `renderPostArt`
   * grava `mediaUrls: [url]`, então devolver à fila o carrossel que nasceu da
   * página e ganhou fotos na agenda o reduziria à arte da página, apagando os
   * outros slides. Medido em 10/09/2026: o carrossel de sexta da Real
   * Gelateria (4 fotos, RENDERED, com `pageId`) estava a uma edição da página
   * de virar uma imagem só. O slide que é arte da página continua alcançado
   * pela recomposição, que troca apenas a posição dele.
   */
  const candidatos = await client.socialPost.findMany({
    where: { ...base, laterPostId: null },
    select: { id: true, mediaUrls: true, videoDaPagina: true },
  })
  // Post de VÍDEO nunca volta à fila de render, nem com a mídia limpa: a marca
  // persistida (`postDeVideo`) diz que ele é o vídeo da página, não um render dela.
  const alvos = candidatos
    .filter((p) => renderDaPaginaCobreAMidia(p.mediaUrls) && !postDeVideo(p))
    .map((p) => p.id)
  if (alvos.length < candidatos.length) {
    console.warn(
      `[invalidate-renders] ${candidatos.length - alvos.length} post(s) com várias mídias ficaram fora da fila de render`,
    )
  }
  // B1d (checkpoint f): antes de qualquer saída — a recuperação semântica tem filtro e CAS próprios.
  const reabertos = await reabrirFalhasSemanticas(client, alvo)
  if (alvos.length === 0) {
    return { invalidados: 0, congelados: congeladosRows.map((p) => p.id), reabertos }
  }

  const result = await client.socialPost.updateMany({
    where: { ...base, laterPostId: null, id: { in: alvos } },
    data: {
      renderStatus: RenderStatus.PENDING,
      renderedImageUrl: null,
      renderedAt: null,
      renderAttempts: 0,
      renderError: null,
      nextRenderAt: new Date(),
      mediaUrls: [],
    },
  })

  return { invalidados: result.count, congelados: congeladosRows.map((p) => p.id), reabertos }
}

/**
 * B1d (checkpoint f): a edição da página RECUPERA uma falha semântica de render — e só ela.
 *
 * `RENDER_FAILED` não entra no `base` da invalidação: lá ele reabriria falha de fonte, Blob, Canvas e legado
 * quebrado. Aqui reabre apenas quem tem o envelope semântico (confirmado pelo leitor estrito, não só pelo prefixo),
 * o contrato `_slots`/`_papeis`, `laterPostId` nulo, DRAFT ou SCHEDULED com horário FUTURO (post vencido não
 * ressuscita: o executor o publicaria atrasado), sem vídeo, mídia coberta pelo render da página, nenhum retry de
 * publicação ativo (ele enviaria cedo a arte nova) — e cujo pedido agora casa com a página ATUAL, pela MESMA
 * admissão do agendamento, com `mediaUrls: []` (a mídia velha vai ser descartada, não é "mídia pronta").
 *
 * A escrita é CAS por post sobre a linha lida (status, envelope, página, `updatedAt`): entrega, nova falha ou
 * edição no meio do caminho vencem. Só os campos da arte mudam — pedido, página e `PostRenderProof` ficam (a prova
 * da URL antiga deixa de autorizar sozinha: a mídia atual some). Nenhum retry, nenhum envio, nenhum aviso.
 */
async function reabrirFalhasSemanticas(client: DbClient, alvo: Prisma.SocialPostWhereInput): Promise<number> {
  const agora = new Date()
  const recuperavel = {
    laterPostId: null,
    OR: [{ status: PostStatus.DRAFT }, { status: PostStatus.SCHEDULED, scheduledDatetime: { gt: agora } }],
    retries: { none: { status: { in: [RetryStatus.PENDING, RetryStatus.PROCESSING] } } },
  } satisfies Prisma.SocialPostWhereInput
  const falhas = await client.socialPost.findMany({
    where: { ...alvo, ...recuperavel, renderStatus: RenderStatus.RENDER_FAILED, renderError: { startsWith: PREFIXO_DO_ENVELOPE } },
    select: { id: true, projectId: true, postType: true, pageId: true, slotValues: true, mediaUrls: true, videoDaPagina: true, renderError: true, updatedAt: true },
  })

  let reabertos = 0
  for (const p of falhas) {
    if (!lerErroRenderSemantico(p.renderError) || !temContratoSemantico(p.slotValues)) continue
    if (!renderDaPaginaCobreAMidia(p.mediaUrls) || postDeVideo(p)) continue
    try {
      await admitirPedidoSemantico(client as unknown as ClienteDeAdmissao, { projectId: p.projectId, postType: p.postType, pageId: p.pageId, mediaUrls: [], slotValues: p.slotValues })
    } catch (erro) {
      if (erro instanceof ErroAdmissaoSemantica) continue // ainda não casa: fica RENDER_FAILED, sem nova tentativa nem aviso
      throw erro
    }
    const r = await client.socialPost.updateMany({
      where: { id: p.id, ...recuperavel, renderStatus: RenderStatus.RENDER_FAILED, renderError: p.renderError, pageId: p.pageId, updatedAt: p.updatedAt },
      data: { renderStatus: RenderStatus.PENDING, renderAttempts: 0, renderError: null, nextRenderAt: agora, renderedImageUrl: null, renderedAt: null, mediaUrls: [] },
    })
    reabertos += r.count
  }
  return reabertos
}

