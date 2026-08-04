import { db } from '@/lib/db'
import { PostScheduler } from './scheduler'
import {
  PostStatus,
  RetryStatus,
  PostLogEvent,
  PostType,
  PublishType,
  RenderStatus,
  VerificationStatus,
} from '../../../prisma/generated/client'
import { getLaterClient } from '@/lib/later/client'
import { LaterNotFoundError } from '@/lib/later/errors'
import { NOTIFY_AFTER_ATTEMPT, notifyPublishFailure } from './failure-handler'
import { FREEZE_WINDOW_MS } from './freeze-window'
import { renderPostArt } from './render-post-art'

export class PostExecutor {
  private scheduler: PostScheduler

  constructor() {
    this.scheduler = new PostScheduler()
  }

  /**
   * Registra falha de arte: log SEMPRE, aviso no grupo no máximo uma vez a
   * cada 15 minutos.
   *
   * O post vencido continua elegível pelo catch-up a cada minuto, e cada
   * execução do cron abre um batch novo — o `dedupeByPost` do
   * `withFailureNotificationBatch` só protege dentro de um batch. Sem esta
   * trava, um único post com um único problema renderia um aviso por minuto.
   * É a mesma solução que o cron de lembretes já usa.
   */
  private async registrarFalhaDeArte(
    postId: string,
    mensagemLog: string,
    mensagemAviso: string,
  ) {
    const quinzeMinutosAtras = new Date(Date.now() - 15 * 60 * 1000)

    const jaAvisado = await db.postLog.findFirst({
      where: {
        postId,
        event: PostLogEvent.FAILED,
        createdAt: { gte: quinzeMinutosAtras },
      },
      select: { id: true },
    })

    await db.postLog.create({
      data: { postId, event: PostLogEvent.FAILED, message: mensagemLog },
    })

    if (!jaAvisado) {
      await notifyPublishFailure(postId, mensagemAviso)
    }
  }

  async executeScheduledPosts() {
    try {
      const now = new Date()
      const windowStart = new Date(now.getTime() - 60000) // -1 minute
      const windowEnd = new Date(now.getTime() + 60000) // +1 minute

      // Find posts scheduled for this time window
      // EXCLUDE REMINDER posts - they should ONLY trigger webhook, not be sent automatically
      const postsInWindow = await db.socialPost.findMany({
        where: {
          status: PostStatus.SCHEDULED,
          laterPostId: null,
          scheduledDatetime: {
            gte: windowStart,
            lte: windowEnd,
          },
          publishType: {
            not: 'REMINDER', // ⚠️ REMINDER posts are handled by /api/cron/reminders
          },
        },
        include: {
          Project: {
            select: {
              id: true,
              name: true,
            },
          },
        },
      })

      // CATCH-UP: Find overdue posts (scheduled in the past but not sent)
      // Limit to last 6 hours to avoid processing very old posts
      // EXCLUDE REMINDER posts - they should ONLY trigger webhook, not be sent automatically
      const sixHoursAgo = new Date(now.getTime() - 6 * 60 * 60 * 1000)
      const overduePosts = await db.socialPost.findMany({
        where: {
          status: PostStatus.SCHEDULED,
          laterPostId: null,
          scheduledDatetime: {
            gte: sixHoursAgo,
            lt: windowStart, // Before the current window
          },
          publishType: {
            not: 'REMINDER', // ⚠️ REMINDER posts are handled by /api/cron/reminders
          },
        },
        include: {
          Project: {
            select: {
              id: true,
              name: true,
            },
          },
        },
        take: 5, // Process max 5 overdue posts per execution
        orderBy: {
          scheduledDatetime: 'asc', // Oldest first
        },
      })

      /**
       * CONGELAMENTO: entrega ao Zernio os posts que entraram na janela.
       *
       * O Zernio cuida do agendamento nativo, então o post é entregue alguns
       * minutos antes e publica no horário. O que mudou em 03/08/2026 foi o
       * TETO: antes não havia nenhum, e todo post futuro era entregue assim
       * que ficava renderizado — mediana de 39 segundos após o agendamento,
       * com posts congelados por até 27 dias. Como nada no funil de render
       * fala com o Zernio, editar a arte depois disso não mudava mais o que
       * ia ao ar: 29 posts em 33 dias publicaram a versão velha, em silêncio.
       *
       * Com o teto, a arte no banco é a fonte de verdade até FREEZE_WINDOW_MS
       * antes do horário. É o `lte` abaixo que sustenta essa promessa — quem
       * mexer aqui precisa mexer também em `descreverJanela` e nos guards de
       * edição, ou a interface passa a prometer o que o executor não cumpre.
       */
      const freezeCutoff = new Date(now.getTime() + FREEZE_WINDOW_MS)
      const futurePosts = await db.socialPost.findMany({
        where: {
          status: PostStatus.SCHEDULED,
          laterPostId: null,
          scheduledDatetime: {
            gt: windowEnd, // Future posts (beyond current window)
            lte: freezeCutoff, // ...mas só os que já entraram na janela
          },
          publishType: {
            not: 'REMINDER',
          },
          OR: [
            // Template-based posts that are fully rendered
            { renderStatus: RenderStatus.RENDERED },
            // Non-template posts (renderStatus = NOT_NEEDED) ready to go
            { renderStatus: RenderStatus.NOT_NEEDED },
          ],
        },
        include: {
          Project: {
            select: {
              id: true,
              name: true,
            },
          },
        },
        // Com o teto, esta lista deixou de ser "todos os posts futuros" e
        // passou a ser "os que congelam nos próximos minutos" — o take vira
        // proteção contra rajada, não corte de fila. Máximo medido em 90
        // dias: 10 posts no mesmo minuto.
        take: 25,
        orderBy: {
          scheduledDatetime: 'asc',
        },
      })

      // Combine all lists
      const postsToSend = [...postsInWindow, ...overduePosts, ...futurePosts]

      if (postsToSend.length === 0) {
        return { processed: 0, catchUp: 0 }
      }

      if (overduePosts.length > 0) {
        console.log(`⏰ CATCH-UP: Encontrados ${overduePosts.length} posts atrasados`)
      }
      if (futurePosts.length > 0) {
        console.log(`📅 PRE-SEND: Encontrados ${futurePosts.length} posts futuros prontos para agendar no Zernio`)
      }
      console.log(`📨 Total de ${postsToSend.length} posts para enviar (${postsInWindow.length} na janela, ${overduePosts.length} atrasados, ${futurePosts.length} pré-agendamento)`)

      let successCount = 0
      let failureCount = 0
      let catchUpCount = 0

      // SOLUÇÃO 4: Send each post com rate limiting para posts atrasados
      for (const post of postsToSend) {
        const isOverdue = post.scheduledDatetime < windowStart
        if (isOverdue) {
          catchUpCount++
          console.log(`⏰ Processando post atrasado: ${post.id} (agendado para ${post.scheduledDatetime.toISOString()})`)

          // Adicionar delay de 2 segundos entre posts atrasados para evitar rate limit
          if (catchUpCount > 1) {
            console.log(`⏸️ Aguardando 2 segundos antes de processar próximo post atrasado (rate limiting)...`)
            await new Promise(resolve => setTimeout(resolve, 2000))
          }
        }

        // Guard: template-based Stories must be rendered before sending
        if (post.postType === PostType.STORY && post.pageId) {
          if (post.renderStatus === RenderStatus.PENDING || post.renderStatus === RenderStatus.RENDERING) {
            /**
             * Arte ainda não pronta na hora de publicar.
             *
             * Antes isto era `console.log` + `continue`: o post sumia da
             * rodada sem log no banco e sem aviso. Quem edita a arte perto do
             * horário deixa o post exatamente nesse estado, e a versão antiga
             * fazia essa edição virar "o post não saiu".
             *
             * Este ramo alcança quem está na janela de publicação (T±1min) ou
             * atrasado — o congelamento em si exige RENDERED/NOT_NEEDED, então
             * quem prepara a arte a tempo é o cron `render-stories`, que
             * prioriza os próximos 15 minutos. Aqui é o último recurso.
             *
             * RENDERING é de outra execução: não dá para atropelar. PENDING é
             * nosso — mas só respeitando o backoff (ver abaixo).
             */
            if (post.renderStatus === RenderStatus.PENDING) {
              /**
               * O orçamento de `renderAttempts` é COMPARTILHADO com o cron
               * `render-stories`, e `renderPostArt` reserva apenas por
               * `renderStatus: PENDING` — os portões de `renderAttempts < 3` e
               * `nextRenderAt <= agora` vivem na query do cron, não na função.
               *
               * Sem repeti-los aqui, este laço (que roda a cada minuto)
               * queimaria as 3 tentativas em 3 minutos e marcaria RENDER_FAILED
               * — que é terminal, nada volta de lá automaticamente. Uma
               * instabilidade passageira do Blob mataria o post.
               *
               * A primeira tentativa continua imediata, porque a invalidação
               * grava `nextRenderAt: agora` — é o caso de uso da janela. Só as
               * seguintes esperam os 4 e 8 minutos do backoff.
               */
              const podeTentarAgora =
                post.renderAttempts < 3 &&
                (!post.nextRenderAt || post.nextRenderAt <= now)

              if (!podeTentarAgora) {
                console.log(
                  `⏳ ${post.id} — aguardando backoff do render (tentativas: ${post.renderAttempts})`
                )
                continue
              }

              console.log(`🎨 Post ${post.id} sem arte pronta na hora — renderizando agora`)
              const render = await renderPostArt({
                id: post.id,
                pageId: post.pageId,
                slotValues: post.slotValues,
                renderAttempts: post.renderAttempts,
              })

              if (render.ok) {
                console.log(`🎨 ✓ ${post.id} renderizado na hora → ${render.url}`)
                // sendToLater relê do banco; a mutação local é só para manter
                // o objeto coerente com o que já foi gravado.
                post.mediaUrls = [render.url]
                post.renderStatus = RenderStatus.RENDERED
              } else if (render.motivo === 'falhou') {
                // Vencido e sem arte é falha de publicação, não silêncio.
                if (isOverdue) {
                  await this.registrarFalhaDeArte(
                    post.id,
                    `Arte não ficou pronta a tempo: ${render.erro ?? 'erro no render'}`,
                    'A arte não ficou pronta a tempo da publicação'
                  )
                  failureCount++
                }
                continue
              } else {
                // 'ocupado' ou 'invalidado': outra execução está cuidando, ou
                // a página mudou de novo. Volta na próxima rodada.
                console.log(`⏳ ${post.id} — render ${render.motivo}, tentando na próxima rodada`)
                continue
              }
            } else {
              console.log(`⏳ Skipping post ${post.id} — still rendering (${post.renderStatus})`)
              continue
            }
          }
          if (post.renderStatus === RenderStatus.RENDER_FAILED) {
            console.log(`❌ Post ${post.id} — render failed after 3 attempts, marking FAILED`)
            await db.socialPost.update({
              where: { id: post.id },
              data: {
                status: PostStatus.FAILED,
                errorMessage: 'Story image rendering failed after 3 attempts',
                failedAt: new Date(),
              },
            })
            // Sem retry: a arte já falhou nas 3 tentativas de render, reenviar
            // não muda nada. Avisa a equipe — pela mesma trava de 15 min, para
            // não emendar num aviso que o render de última hora acabou de
            // mandar sobre este mesmo post.
            await this.registrarFalhaDeArte(
              post.id,
              'Story image rendering failed after 3 attempts',
              'Não foi possível gerar a arte do story depois de 3 tentativas'
            )
            failureCount++
            continue
          }
          // renderStatus === RENDERED → proceed normally
        }

        try {
          console.log(`📤 Sending post ${post.id} to Later API...`)
          await this.scheduler.sendToLater(post.id)
          successCount++
        } catch (error) {
          console.error(`❌ Erro ao enviar post ${post.id}:`, error)
          failureCount++

          // Se for rate limit error, parar o processamento de posts atrasados
          if (error instanceof Error && (
            error.name === 'RateLimitError' ||
            error.message.includes('rate limit') ||
            error.message.includes('Rate limit')
          )) {
            console.error('🛑 Rate limit atingido, parando catch-up de posts atrasados')
            break // Para o loop para evitar mais erros
          }

          // Don't schedule retry if it's an insufficient credits error
          const isInsufficientCredits = error instanceof Error && error.name === 'InsufficientCreditsError'
          if (isInsufficientCredits) {
            console.log(`💳 Post ${post.id} failed due to insufficient credits - retry already skipped by scheduler`)
          }
        }
      }

      console.log(`✅ Enviados: ${successCount} | ❌ Falhas: ${failureCount} | ⏰ Catch-up: ${catchUpCount}`)

      return {
        processed: postsToSend.length,
        success: successCount,
        failed: failureCount,
        catchUp: catchUpCount
      }
    } catch (error) {
      console.error('Erro no cron job:', error)
      throw error
    }
  }

  async executeRetries() {
    try {
      const now = new Date()

      // Find pending retries
      const retries = await db.postRetry.findMany({
        where: {
          status: RetryStatus.PENDING,
          scheduledFor: {
            lte: now,
          },
        },
        include: {
          post: {
            include: {
              Project: {
                select: {
                  id: true,
                  name: true,
                },
              },
            },
          },
        },
      })

      if (retries.length === 0) {
        return { processed: 0 }
      }

      console.log(`🔄 Executando ${retries.length} retries...`)

      for (const retry of retries) {
        try {
          // Update retry status
          await db.postRetry.update({
            where: { id: retry.id },
            data: { status: RetryStatus.PROCESSING, executedAt: new Date() },
          })

          // Try to send again - route to appropriate scheduler
          console.log(`🔄 Retrying post ${retry.postId} via Late API...`)
          await this.scheduler.sendToLater(retry.postId)

          // Mark retry as success
          await db.postRetry.update({
            where: { id: retry.id },
            data: { status: RetryStatus.SUCCESS },
          })
        } catch (error) {
          console.error(`❌ Retry ${retry.id} (attempt ${retry.attemptNumber}) failed:`, error)

          // Mark retry as failed
          await db.postRetry.update({
            where: { id: retry.id },
            data: {
              status: RetryStatus.FAILED,
              errorMessage: error instanceof Error ? error.message : 'Unknown error',
            },
          })

          // Schedule next retry ONLY if:
          // 1. Still has attempts left (max 3 attempts)
          // 2. Error is NOT InsufficientCreditsError (no point retrying)
          const isInsufficientCredits = error instanceof Error && error.name === 'InsufficientCreditsError'

          // A equipe é avisada quando a primeira nova tentativa também falha
          // (ou seja, 2 falhas no total). As tentativas seguintes não avisam
          // de novo — o time já sabe e a mensagem viraria repetição.
          if (retry.attemptNumber === NOTIFY_AFTER_ATTEMPT) {
            await notifyPublishFailure(
              retry.postId,
              error instanceof Error ? error.message : 'Erro desconhecido',
              { attempts: retry.attemptNumber + 1 }
            )
          }

          if (retry.attemptNumber < 3 && !isInsufficientCredits) {
            await this.scheduler.scheduleRetry(retry.postId, retry.attemptNumber + 1)
            console.log(`🔄 Scheduled retry ${retry.attemptNumber + 1}/3 for post ${retry.postId}`)
          } else if (isInsufficientCredits) {
            console.log(`💳 Post ${retry.postId} failed due to insufficient credits - not retrying`)
          } else {
            console.log(`⚠️ Post ${retry.postId} exceeded max retries (3)`)
          }
        }
      }

      return { processed: retries.length }
    } catch (error) {
      console.error('Erro ao executar retries:', error)
      throw error
    }
  }

  /**
   * Sync Late post status (fallback for webhook)
   * Runs every 1 HOUR as backup
   */
  async syncLateStatus() {
    const laterClient = getLaterClient()

    // Find posts with laterPostId that haven't been finalized
    const postsToSync = await db.socialPost.findMany({
      where: {
        laterPostId: { not: null },
        status: { in: [PostStatus.SCHEDULED, PostStatus.POSTING] },
        OR: [
          { lastSyncAt: null }, // Never synced
          { lastSyncAt: { lt: new Date(Date.now() - 5 * 60 * 1000) } } // >5min
        ]
      },
      take: 50, // Max 50 per run (rate limit)
      orderBy: { scheduledDatetime: 'desc' }
    })

    if (postsToSync.length === 0) {
      console.log('✅ [Late Sync] No posts to sync')
      return { synced: 0, updated: 0, failed: 0 }
    }

    console.log(`🔄 [Late Sync] Syncing ${postsToSync.length} posts (fallback)...`)

    let updated = 0
    let failed = 0

    for (const post of postsToSync) {
      try {
        // Query status from Late
        const laterPost = await laterClient.getPost(post.laterPostId!)

        // Update local status
        const wasUpdated = await this.updateFromLateStatus(post.id, laterPost)
        if (wasUpdated) updated++

      } catch (error: any) {
        console.error(`❌ [Late Sync] Failed to sync post ${post.id}:`, error)
        failed++

        // 404: Zernio removes failed posts (and old/expired ones). Without this branch
        // the local row stays POSTING/SCHEDULED forever — check-stuck-posts only kicks
        // in 30 min after scheduledDatetime, which doesn't help IMMEDIATE posts.
        const is404 =
          error instanceof LaterNotFoundError ||
          error?.statusCode === 404 ||
          error?.name === 'LaterNotFoundError'

        if (
          is404 &&
          (post.status === PostStatus.POSTING || post.status === PostStatus.SCHEDULED)
        ) {
          try {
            await db.socialPost.update({
              where: { id: post.id },
              data: {
                status: PostStatus.FAILED,
                errorMessage:
                  'Post não encontrado no Zernio (404) durante sync — provavelmente falhou e foi removido pelo Zernio',
                failedAt: new Date(),
                processingStartedAt: null,
                lastSyncAt: new Date(),
              },
            })
            await db.postLog.create({
              data: {
                postId: post.id,
                event: PostLogEvent.FAILED,
                message: '404 do Zernio durante syncLateStatus — marcado como FAILED',
                metadata: {
                  laterPostId: post.laterPostId,
                  prevStatus: post.status,
                },
              },
            })
            // Sem retry: o post chegou a existir no Zernio e sumiu, então não
            // dá para saber se ele publicou. Reenviar arriscaria post dobrado.
            await notifyPublishFailure(
              post.id,
              'O agendador descartou o post e ele não foi publicado'
            )
            updated++
            failed--
          } catch (dbErr) {
            console.error(`❌ [Late Sync] Failed to mark post ${post.id} FAILED after 404:`, dbErr)
          }
          continue
        }

        // Handle rate limit
        if (error.statusCode === 429) {
          const resetTime = error.rateLimitInfo?.reset
          console.warn(`⚠️ [Late Sync] Rate limit exceeded. Reset at: ${resetTime}`)
          break // Stop execution
        }
      }

      // Small delay to respect rate limits
      await new Promise(resolve => setTimeout(resolve, 100))
    }

    console.log(`✅ [Late Sync] Complete: ${updated} updated, ${failed} failed`)

    return { synced: postsToSync.length, updated, failed }
  }

  /**
   * Update post from Late status
   * Returns true if status changed
   */
  private async updateFromLateStatus(
    postId: string,
    laterPost: any
  ): Promise<boolean> {
    const currentPost = await db.socialPost.findUnique({
      where: { id: postId },
      select: {
        status: true,
        lateStatus: true,
        postType: true,
        publishType: true,
        verificationStatus: true,
        verificationAttempts: true,
      }
    })

    if (!currentPost) return false

    const updateData: any = {
      lateStatus: laterPost.status,
      lastSyncAt: new Date()
    }

    let statusChanged = false

    // Map Late status → Local status
    switch (laterPost.status) {
      case 'scheduled':
        // Keep current status
        break

      case 'publishing':
        if (currentPost.status !== PostStatus.POSTING) {
          updateData.status = PostStatus.POSTING
          statusChanged = true
        }
        break

      case 'published':
        if (currentPost.status !== PostStatus.POSTED) {
          updateData.status = PostStatus.POSTED
          statusChanged = true

          // Extract Instagram platform data (Zernio stores per-platform info)
          const igPlatform = laterPost.platforms?.find(
            (p: any) => p.platform === 'instagram'
          )
          // publishedAt is inside platform object on Zernio, fallback to top-level
          const publishedAtRaw = igPlatform?.publishedAt || laterPost.publishedAt
          const publishedAt = publishedAtRaw ? new Date(publishedAtRaw) : new Date()
          updateData.latePublishedAt = publishedAt
          updateData.sentAt = publishedAt

          const platformUrl = igPlatform?.platformPostUrl || laterPost.permalink
          if (platformUrl) {
            updateData.latePlatformUrl = platformUrl
            updateData.publishedUrl = platformUrl
          }
          const platformPostId = igPlatform?.platformPostId || laterPost.platformPostId
          if (platformPostId) {
            updateData.instagramMediaId = platformPostId
          }

          if (
            currentPost.postType === PostType.STORY &&
            currentPost.publishType === PublishType.DIRECT &&
            currentPost.verificationStatus !== VerificationStatus.VERIFIED
          ) {
            updateData.verificationStatus = VerificationStatus.VERIFIED
            updateData.verificationAttempts = Math.max(currentPost.verificationAttempts || 0, 1)
            updateData.verifiedByFallback = true
            updateData.verifiedStoryId = platformPostId || null
            updateData.verifiedPermalink = platformUrl || null
            updateData.verifiedTimestamp = updateData.latePublishedAt || new Date()
            updateData.lastVerificationAt = new Date()
            updateData.nextVerificationAt = null
            updateData.verificationError = null
          }

          // Create success log
          await db.postLog.create({
            data: {
              postId,
              event: PostLogEvent.SENT,
              message: 'Post published via Late (detected by sync)',
              metadata: {
                laterPostId: laterPost.id,
                publishedAt: laterPost.publishedAt,
                platformUrl: igPlatform?.platformPostUrl
              }
            }
          })
        }
        break

      case 'failed':
      case 'partial':
        if (currentPost.status !== PostStatus.FAILED) {
          const laterErrors = Array.isArray(laterPost.errors)
            ? laterPost.errors.filter((error: unknown) => typeof error === 'string')
            : []
          const fallbackError =
            laterPost.error || (laterErrors.length ? laterErrors.join(' | ') : null)
          updateData.status = PostStatus.FAILED
          updateData.failedAt = new Date()
          updateData.errorMessage = fallbackError || 'Failed via Late API'
          statusChanged = true

          // Create error log
          await db.postLog.create({
            data: {
              postId,
              event: PostLogEvent.FAILED,
              message: `Failed detected via Late: ${fallbackError || 'Unknown'}`,
              metadata: {
                laterPostId: laterPost.id,
                laterError: fallbackError || null,
                laterErrors,
              }
            }
          })

          // Sem retry: o post já tem laterPostId e `sendToLater` ignora esses
          // posts — a nova tentativa seria um no-op contado como sucesso.
          await notifyPublishFailure(
            postId,
            fallbackError || 'O agendador não conseguiu publicar'
          )
        }
        break
    }

    // Update DB
    await db.socialPost.update({
      where: { id: postId },
      data: updateData
    })

    return statusChanged
  }
}
