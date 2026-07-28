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

type DbClient = PrismaClient | Prisma.TransactionClient

export type InvalidateTarget = { templateId: number } | { pageIds: string[] } | { postIds: string[] }

export async function invalidateScheduledRenders(
  client: DbClient,
  target: InvalidateTarget,
): Promise<number> {
  if ('pageIds' in target && target.pageIds.length === 0) return 0
  if ('postIds' in target && target.postIds.length === 0) return 0

  const result = await client.socialPost.updateMany({
    where: {
      status: PostStatus.SCHEDULED,
      renderStatus: { in: [RenderStatus.RENDERED, RenderStatus.PENDING, RenderStatus.RENDERING] },
      ...('templateId' in target
        ? { templateId: target.templateId, pageId: { not: null } }
        : 'pageIds' in target
          ? { pageId: { in: target.pageIds } }
          : { id: { in: target.postIds }, pageId: { not: null } }),
    },
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

  return result.count
}

/**
 * Normaliza `Page.layers` (array, string JSON ou string dupla-codificada)
 * para uma string canônica de comparação. `null` quando ilegível.
 *
 * Serve para detectar mudança real antes de invalidar: o PATCH da página
 * também recebe autosave e thumbnails do PageSync a cada troca de página —
 * invalidar sem comparar re-renderizaria os agendados toda vez que alguém
 * abre o editor.
 */
export function normalizeLayersString(raw: unknown): string | null {
  let value = raw
  let depth = 0
  while (typeof value === 'string' && depth < 3) {
    try {
      value = JSON.parse(value)
      depth++
    } catch {
      return null
    }
  }
  if (!Array.isArray(value)) return null
  return JSON.stringify(value)
}
