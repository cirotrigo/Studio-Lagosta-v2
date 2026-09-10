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
import { PostStatus, RenderStatus, type Prisma, type PrismaClient } from '../../../prisma/generated/client'
import { renderDaPaginaCobreAMidia } from './render-da-pagina'

/**
 * `normalizeLayersString` mudou de casa para `page-layers.ts` — um módulo SEM
 * Prisma, para que o diff de copy do aprendizado (que precisa da MESMA leitura
 * de camadas) possa importá-lo sem arrastar o banco. Continua exportada daqui:
 * os chamadores existentes não mudam.
 */
export { normalizeLayersString } from './page-layers'

type DbClient = PrismaClient | Prisma.TransactionClient

export type InvalidateTarget = { templateId: number } | { pageIds: string[] } | { postIds: string[] }

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
}

export async function invalidateScheduledRenders(
  client: DbClient,
  target: InvalidateTarget,
): Promise<InvalidateResult> {
  const vazio: InvalidateResult = { invalidados: 0, congelados: [] }
  if ('pageIds' in target && target.pageIds.length === 0) return vazio
  if ('postIds' in target && target.postIds.length === 0) return vazio

  const alvo =
    'templateId' in target
      ? { templateId: target.templateId, pageId: { not: null } }
      : 'pageIds' in target
        ? { pageId: { in: target.pageIds } }
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
    select: { id: true, mediaUrls: true },
  })
  const alvos = candidatos.filter((p) => renderDaPaginaCobreAMidia(p.mediaUrls)).map((p) => p.id)
  if (alvos.length < candidatos.length) {
    console.warn(
      `[invalidate-renders] ${candidatos.length - alvos.length} post(s) com várias mídias ficaram fora da fila de render`,
    )
  }
  if (alvos.length === 0) {
    return { invalidados: 0, congelados: congeladosRows.map((p) => p.id) }
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

  return { invalidados: result.count, congelados: congeladosRows.map((p) => p.id) }
}

