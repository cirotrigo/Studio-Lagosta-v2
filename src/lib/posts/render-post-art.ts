/**
 * Render da arte de um post a partir da sua página, com a reserva e o
 * descarte-em-voo que o resultado exige.
 *
 * Isto vivia inline no cron `render-stories`. Passou a ser função porque a
 * janela de congelamento precisa do MESMO comportamento: quando o post entra
 * na janela e a arte ainda está PENDING, o executor renderiza na hora em vez
 * de pular o post em silêncio — que era o que acontecia antes e fazia o post
 * simplesmente não sair.
 *
 * Duplicar essa lógica seria repetir o erro que já custou caro nesta base: a
 * regra de invalidação escrita em dois lugares foi exatamente o que deixou a
 * rota de página de fora por meses.
 */
import { db } from '@/lib/db'
import { renderStoryImage } from '@/lib/posts/story-renderer'
import { RenderStatus } from '../../../prisma/generated/client'

/**
 * Shape único em vez de união discriminada: o tsconfig do projeto roda com
 * `strict: false`, e sem `strictNullChecks` o narrowing por `ok: true` não
 * acontece — os consumidores não conseguiriam ler `motivo` depois de checar
 * `ok`. Quem chama sempre testa `ok` antes de olhar o resto.
 */
export interface RenderPostArtResult {
  ok: boolean
  url?: string
  motivo?: 'sem-pagina' | 'ocupado' | 'invalidado' | 'falhou'
  erro?: string
}

export interface RenderablePost {
  id: string
  pageId: string | null
  slotValues: unknown
  renderAttempts: number
}

/**
 * Renderiza e grava a arte do post.
 *
 * A reserva é compare-and-set (PENDING → RENDERING) em vez de update cru: o
 * update incondicional deixava duas execuções concorrentes renderizarem o
 * mesmo post e a última a terminar sobrescrevia a outra.
 *
 * A gravação do sucesso também é condicional. Se uma edição invalidou o
 * render no meio do voo (o status voltou a PENDING), gravar aqui ressuscitaria
 * a arte velha por cima da invalidação — o certo é descartar este resultado e
 * deixar o próximo ciclo renderizar de novo.
 */
export async function renderPostArt(post: RenderablePost): Promise<RenderPostArtResult> {
  if (!post.pageId) {
    return { ok: false, motivo: 'sem-pagina' }
  }

  const reserva = await db.socialPost.updateMany({
    where: { id: post.id, renderStatus: RenderStatus.PENDING },
    data: { renderStatus: RenderStatus.RENDERING },
  })

  if (reserva.count === 0) {
    // Outra execução já pegou (ou o post saiu de PENDING). Não é erro —
    // quem chamou tenta de novo no próximo ciclo.
    return { ok: false, motivo: 'ocupado' }
  }

  try {
    const result = await renderStoryImage(
      post.pageId,
      post.id,
      post.slotValues as Record<string, unknown> | undefined,
    )

    const confirmed = await db.socialPost.updateMany({
      where: { id: post.id, renderStatus: RenderStatus.RENDERING },
      data: {
        renderStatus: RenderStatus.RENDERED,
        renderedImageUrl: result.url,
        renderedAt: new Date(),
        renderError: null,
        // Também alimenta o executor, que publica a partir de mediaUrls
        mediaUrls: [result.url],
      },
    })

    if (confirmed.count === 0) {
      return { ok: false, motivo: 'invalidado' }
    }

    return { ok: true, url: result.url }
  } catch (error) {
    const erro = error instanceof Error ? error.message : 'Unknown error'
    const newAttempts = post.renderAttempts + 1

    if (newAttempts >= 3) {
      await db.socialPost.updateMany({
        where: { id: post.id, renderStatus: RenderStatus.RENDERING },
        data: {
          renderStatus: RenderStatus.RENDER_FAILED,
          renderAttempts: newAttempts,
          renderError: erro,
        },
      })
    } else {
      // Backoff exponencial: 2^tentativas * 2 minutos
      const backoffMs = Math.pow(2, newAttempts) * 2 * 60 * 1000
      await db.socialPost.updateMany({
        where: { id: post.id, renderStatus: RenderStatus.RENDERING },
        data: {
          renderStatus: RenderStatus.PENDING,
          renderAttempts: newAttempts,
          renderError: erro,
          nextRenderAt: new Date(Date.now() + backoffMs),
        },
      })
    }

    return { ok: false, motivo: 'falhou', erro }
  }
}
