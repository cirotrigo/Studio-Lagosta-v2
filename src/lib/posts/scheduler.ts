import { db } from '@/lib/db'
import {
  Prisma,
  PostType,
  ScheduleType,
  RecurrenceFrequency,
  PostStatus,
  PostLogEvent,
  PublishType,
} from '../../../prisma/generated/client'
import { LaterPostScheduler } from './later-scheduler'
import { handlePublishFailure, notifyPublishFailure, RETRY_DELAY_MS } from './failure-handler'

interface RecurringConfig {
  frequency: RecurrenceFrequency
  daysOfWeek?: number[]
  time: string
  endDate?: string
}

interface CreatePostData {
  projectId: number
  userId: string
  generationId?: string // Optional now
  postType: PostType
  caption: string
  mediaUrls: string[]
  blobPathnames?: string[] // For cleanup
  scheduleType: ScheduleType
  scheduledDatetime?: string
  recurringConfig?: RecurringConfig
  altText?: string[]
  firstComment?: string
  publishType?: PublishType
  reminderExtraInfo?: string
  // Template-based scheduling (Stories only)
  pageId?: string
  templateId?: number
  slotValues?: Record<string, unknown>
}

export class PostScheduler {
  private laterScheduler: LaterPostScheduler | null = null

  /**
   * Get or create LaterPostScheduler instance (lazy loading)
   */
  private getLaterScheduler(): LaterPostScheduler {
    if (!this.laterScheduler) {
      this.laterScheduler = new LaterPostScheduler()
    }
    return this.laterScheduler
  }

  async createPost(data: CreatePostData) {
    console.log('[PostScheduler] ====================================')
    console.log('[PostScheduler] 📝 Creating post via Later scheduler')
    console.log('[PostScheduler] Post type:', data.postType)
    console.log('[PostScheduler] Schedule type:', data.scheduleType)
    console.log('[PostScheduler] Media URLs count:', data.mediaUrls.length)
    console.log('[PostScheduler] ====================================')

    const result = await this.getLaterScheduler().createPost(data)

    console.log('[PostScheduler] ====================================')
    console.log('[PostScheduler] ✅ Post creation completed')
    console.log('[PostScheduler] Result:', JSON.stringify(result))
    console.log('[PostScheduler] ====================================')

    return result
  }

  /**
   * Send an existing post to Later API
   * Used by cron job to send scheduled posts
   */
  async sendToLater(postId: string) {
    return this.getLaterScheduler().sendToLater(postId)
  }

  async scheduleRetry(postId: string, attemptNumber: number = 1) {
    // Nova tentativa 1 minuto depois (o cron de posts roda a cada minuto)
    const scheduledFor = new Date(Date.now() + RETRY_DELAY_MS)

    await db.postRetry.create({
      data: {
        postId,
        attemptNumber,
        scheduledFor,
        status: 'PENDING',
      },
    })
  }

  async createLog(postId: string, event: PostLogEvent, message: string, metadata?: unknown) {
    await db.postLog.create({
      data: {
        postId,
        event,
        message,
        metadata: metadata as Prisma.InputJsonValue | undefined,
      },
    })
  }

  /**
   * Mark posts as FAILED when:
   *   (a) POSTING for 30+ min with no laterPostId (never reached Zernio), OR
   *   (b) POSTING/SCHEDULED past their time + 30 min grace with a laterPostId
   *       that no longer resolves on Zernio (Zernio dropped the post).
   * Case (b) is the silent-failure path: Zernio deletes failed/expired drafts
   * and our sync cron only imports scheduled/published, so these posts would
   * otherwise stay stuck forever.
   */
  async checkStuckPosts() {
    const thirtyMinutesAgo = new Date(Date.now() - 30 * 60 * 1000)

    // Case (a): POSTING without laterPostId — never sent to Zernio
    const stuckPosts = await db.socialPost.findMany({
      where: {
        status: PostStatus.POSTING,
        laterPostId: null,
        OR: [
          { processingStartedAt: { lt: thirtyMinutesAgo } },
          { processingStartedAt: null, updatedAt: { lt: thirtyMinutesAgo } },
        ],
      },
    })

    // Case (b): orphaned laterPostId — present locally, gone on Zernio.
    // Use scheduledDatetime OR processingStartedAt — IMMEDIATE posts may have a near-future
    // scheduledDatetime (set to "now" at creation) or none, so we'd miss them otherwise.
    const orphanCandidates = await db.socialPost.findMany({
      where: {
        laterPostId: { not: null },
        status: { in: [PostStatus.POSTING, PostStatus.SCHEDULED] },
        OR: [
          { scheduledDatetime: { lt: thirtyMinutesAgo } },
          { processingStartedAt: { lt: thirtyMinutesAgo } },
          {
            processingStartedAt: null,
            scheduledDatetime: null,
            updatedAt: { lt: thirtyMinutesAgo },
          },
        ],
      },
      select: { id: true, laterPostId: true, scheduledDatetime: true },
    })

    /**
     * Case (c): SCHEDULED que passou do horário e nunca foi entregue.
     *
     * Enquanto o PRE-SEND entregava todo post futuro assim que ficava pronto,
     * uma queda do nosso cron era irrelevante — o post já estava no publicador
     * e saía sozinho. Com a janela de congelamento a entrega acontece nos
     * minutos finais, então o cron passou a ser o único responsável pelo
     * horário: se ele estiver fora do ar nesses minutos, ninguém publica.
     *
     * O catch-up do executor cobre 6 horas. Passado esse piso, nenhum caminho
     * enxergava o post: o caso (a) exige POSTING e o caso (b) exige
     * laterPostId. Havia 19 posts assim no banco (o mais recente de
     * 01/01/2026), parados em silêncio — o ralo é anterior a esta mudança,
     * mas a janela amplia muito quem cai nele.
     *
     * O limite inferior de 7 dias não é detalhe: sem ele, esses 19 zumbis
     * antigos virariam uma enxurrada no grupo do WhatsApp na primeira rodada.
     */
    const seisHorasAtras = new Date(Date.now() - 6 * 60 * 60 * 1000)
    const umaSemanaAtras = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
    const naoEntregues = await db.socialPost.findMany({
      where: {
        status: PostStatus.SCHEDULED,
        laterPostId: null,
        publishType: { not: PublishType.REMINDER },
        scheduledDatetime: { lt: seisHorasAtras, gt: umaSemanaAtras },
      },
      select: { id: true },
    })

    const orphans: string[] = []
    if (orphanCandidates.length > 0) {
      const { getLaterClient } = await import('@/lib/later')
      const { LaterNotFoundError } = await import('@/lib/later/errors')
      const client = getLaterClient()
      for (const candidate of orphanCandidates) {
        try {
          await client.getPost(candidate.laterPostId!)
        } catch (err) {
          if (err instanceof LaterNotFoundError) {
            orphans.push(candidate.id)
          }
        }
      }
    }

    if (stuckPosts.length === 0 && orphans.length === 0 && naoEntregues.length === 0) {
      console.log('✅ No stuck posts found')
      return { updated: 0 }
    }

    let updatedCount = 0

    if (stuckPosts.length > 0) {
      const ids = stuckPosts.map((p) => p.id)
      const result = await db.socialPost.updateMany({
        where: { id: { in: ids } },
        data: {
          status: PostStatus.FAILED,
          errorMessage: 'Post travado em POSTING por mais de 30 minutos - criação no Zernio não confirmada',
          failedAt: new Date(),
        },
      })
      updatedCount += result.count
      await Promise.all(
        stuckPosts.map((post) =>
          this.createLog(
            post.id,
            PostLogEvent.FAILED,
            'Post travado em POSTING por 30+ minutos - marcado como FAILED automaticamente'
          )
        )
      )

      // Nunca chegaram ao Zernio (laterPostId null), então reenviar é seguro.
      // Rodar só depois do updateMany: enquanto o status for POSTING o
      // sendToLater do retry sairia pelo guard de duplicidade.
      for (const post of stuckPosts) {
        await handlePublishFailure(
          post.id,
          new Error('O envio ficou travado e não foi confirmado pelo agendador')
        )
      }
    }

    if (orphans.length > 0) {
      const result = await db.socialPost.updateMany({
        where: { id: { in: orphans } },
        data: {
          status: PostStatus.FAILED,
          errorMessage: 'Post no Zernio não encontrado (404) após prazo agendado - provavelmente falhou ou foi removido',
          failedAt: new Date(),
        },
      })
      updatedCount += result.count
      await Promise.all(
        orphans.map((id) =>
          this.createLog(
            id,
            PostLogEvent.FAILED,
            'laterPostId não encontrado no Zernio após prazo - marcado como FAILED'
          )
        )
      )

      // Estes já têm laterPostId — handlePublishFailure avisa a equipe em vez
      // de reenviar, porque não dá para saber se o Zernio chegou a publicar.
      for (const id of orphans) {
        await handlePublishFailure(
          id,
          new Error('O agendador descartou o post e não publicou')
        )
      }
    }

    if (naoEntregues.length > 0) {
      const ids = naoEntregues.map((p) => p.id)
      const result = await db.socialPost.updateMany({
        where: { id: { in: ids } },
        data: {
          status: PostStatus.FAILED,
          errorMessage:
            'Passou do horário e nunca foi entregue ao agendador - o cron de publicação não alcançou este post',
          failedAt: new Date(),
        },
      })
      updatedCount += result.count
      await Promise.all(
        ids.map((id) =>
          this.createLog(
            id,
            PostLogEvent.FAILED,
            'Passou mais de 6h do horário sem ser entregue ao agendador - marcado como FAILED'
          )
        )
      )

      /**
       * `notifyPublishFailure`, não `handlePublishFailure`: publicar de
       * madrugada um story que era para as 20h é pior que não publicar. O
       * horário faz parte do conteúdo — quem decide republicar é gente.
       */
      for (const id of ids) {
        await notifyPublishFailure(
          id,
          'Passou do horário sem ser publicado — o agendamento não chegou a ser enviado'
        )
      }
    }

    console.log(`✅ Updated ${updatedCount} stuck posts to FAILED (direct: ${stuckPosts.length}, orphans: ${orphans.length})`)
    return { updated: updatedCount }
  }
}
