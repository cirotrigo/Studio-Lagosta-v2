/**
 * Webhook de confirmação de lembrete recebido
 *
 * O N8N deve chamar este endpoint quando receber um lembrete
 * para confirmar que foi recebido e marcar o badge como verde
 *
 * POST /api/webhooks/reminder-confirm
 * Body: { postId: string }
 */

import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { postId } = body

    if (!postId) {
      return NextResponse.json(
        { error: 'postId is required' },
        { status: 400 }
      )
    }

    console.log(`✅ [Reminder Confirmation] Received confirmation for post ${postId}`)

    // Buscar o post
    const post = await db.socialPost.findUnique({
      where: { id: postId },
      select: { id: true, publishType: true, reminderSentAt: true }
    })

    if (!post) {
      console.error(`❌ [Reminder Confirmation] Post ${postId} not found`)
      return NextResponse.json(
        { error: 'Post not found' },
        { status: 404 }
      )
    }

    if (post.publishType !== 'REMINDER') {
      console.error(`❌ [Reminder Confirmation] Post ${postId} is not a REMINDER`)
      return NextResponse.json(
        { error: 'Post is not a reminder' },
        { status: 400 }
      )
    }

    // Se já foi marcado, retornar sucesso sem atualizar
    if (post.reminderSentAt) {
      console.log(`ℹ️ [Reminder Confirmation] Post ${postId} already marked as sent`)
      return NextResponse.json({
        success: true,
        message: 'Already marked as sent',
        sentAt: post.reminderSentAt
      })
    }

    // Marcar como enviado
    const updated = await db.socialPost.update({
      where: { id: postId },
      data: { reminderSentAt: new Date() }
    })

    console.log(`✅ [Reminder Confirmation] Post ${postId} marked as sent at ${updated.reminderSentAt}`)

    return NextResponse.json({
      success: true,
      message: 'Reminder confirmed',
      sentAt: updated.reminderSentAt
    })

  } catch (error) {
    console.error('[Reminder Confirmation] Error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

// Allow OPTIONS for CORS
export async function OPTIONS() {
  return new NextResponse(null, {
    status: 200,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    },
  })
}
