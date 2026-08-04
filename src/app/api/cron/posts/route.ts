import { NextRequest, NextResponse } from 'next/server'
import { PostExecutor } from '@/lib/posts/executor'
import { withFailureNotificationBatch } from '@/lib/notifications/post-failure-notifier'

/**
 * Declarado AQUI, não no vercel.json: o glob de lá é `app/api/**` e este
 * projeto é `src/app/**`, então nenhuma entrada daquele arquivo casa com as
 * rotas. É por isso que 11 crons declaram `maxDuration` inline — este, o mais
 * crítico do sistema, era um dos que não declaravam e rodava no default da
 * plataforma.
 *
 * Precisa de folga porque o envio é serial e, dentro da janela de
 * congelamento, pode incluir render de última hora. Rajada máxima medida em
 * 90 dias: 10 posts no mesmo minuto.
 */
export const maxDuration = 120

export async function GET(req: NextRequest) {
  try {
    // Verify cron authentication (Vercel Cron secret)
    const authHeader = req.headers.get('authorization')
    if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const executor = new PostExecutor()

    // Um só aviso no WhatsApp por rodada, cobrindo envios e novas tentativas —
    // sem isso, 5 posts falhando viram 5 mensagens no grupo.
    const { scheduledResult, retryResult } = await withFailureNotificationBatch(
      async () => {
        // Execute scheduled posts
        const scheduledResult = await executor.executeScheduledPosts()

        // Execute retries
        const retryResult = await executor.executeRetries()

        return { scheduledResult, retryResult }
      }
    )

    return NextResponse.json({
      success: true,
      scheduled: scheduledResult,
      retries: retryResult,
    })

  } catch (error) {
    console.error('Cron job error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
