import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

export const runtime = 'nodejs'

/**
 * Buffer Post Confirmation Webhook (SIMPLIFIED)
 *
 * Recebe confirmação do Zapier quando um post foi enviado via Buffer.
 *
 * ESTRATÉGIA SIMPLIFICADA:
 * - Identifica o post pelo último post com status POSTING
 * - Atualiza para POSTED (sucesso) ou FAILED (falha)
 * - Usa campo Success do Buffer (true/false)
 *
 * Payload esperado do Zapier (apenas 3 campos!):
 * - success: true ou false (OBRIGATÓRIO) - do campo "Success" do Buffer
 * - buffer_update_id: ID do update no Buffer (opcional, para log)
 * - sent_at: Unix timestamp (opcional, para registro preciso)
 */
export async function POST(req: NextRequest) {
  try {
    // 1. Validate webhook secret
    const secret = req.headers.get('x-webhook-secret')
    if (secret !== process.env.BUFFER_WEBHOOK_SECRET) {
      console.error('❌ Buffer webhook: Invalid secret')
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // 2. Parse payload
    const payload = await req.json()
    const {
      success,
      buffer_update_id,
      sent_at,
      message,
    } = payload

    console.log('📩 Buffer webhook received:', {
      success,
      buffer_update_id,
      sent_at,
      message,
    })

    // 3. Validate required fields
    if (success === undefined || success === null) {
      console.error('❌ Buffer webhook: Missing success field')
      return NextResponse.json({ error: 'Missing success field' }, { status: 400 })
    }

    // 4. Find the most recent POSTING post
    // Busca pelo último post que está aguardando confirmação
    const post = await db.socialPost.findFirst({
      where: {
        status: 'POSTING',
      },
      orderBy: {
        createdAt: 'desc',
      },
      select: {
        id: true,
        status: true,
        postType: true,
        createdAt: true,
        Project: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    })

    if (!post) {
      console.error('❌ Buffer webhook: No POSTING post found')
      return NextResponse.json(
        {
          error: 'No pending post found',
          hint: 'Post may have already been processed or does not exist'
        },
        { status: 404 }
      )
    }

    console.log(`📍 Found post: ${post.id} from project ${post.Project.name}`)

    // 5. Handle failed posts (success = false)
    if (success === false) {
      await db.socialPost.update({
        where: { id: post.id },
        data: {
          status: 'FAILED',
          failedAt: new Date(),
          errorMessage: message || 'Failed to publish via Buffer',
          bufferId: buffer_update_id,
        },
      })

      console.log(`❌ Post ${post.id} marked as FAILED`)
      console.log(`   Error: ${message}`)
      return NextResponse.json({
        success: true,
        message: 'Post marked as failed',
        postId: post.id,
      })
    }

    // 6. Handle successful posts (success = true)
    await db.socialPost.update({
      where: { id: post.id },
      data: {
        status: 'POSTED',
        sentAt: sent_at ? new Date(sent_at * 1000) : new Date(),
        bufferId: buffer_update_id,
        bufferSentAt: sent_at ? new Date(sent_at * 1000) : new Date(),
      },
    })

    console.log(`✅ Post ${post.id} confirmed as POSTED`)

    // 7. Return success response
    return NextResponse.json({
      success: true,
      message: 'Post marked as published',
      postId: post.id,
      projectName: post.Project.name,
    })
  } catch (error) {
    console.error('❌ Buffer webhook error:', error)
    return NextResponse.json(
      {
        error: 'Internal server error',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    )
  }
}
