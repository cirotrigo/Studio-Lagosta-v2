/**
 * Test webhook endpoint
 * Sends a test payload to the configured webhook URL
 */

import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { fetchProjectWithShares, hasProjectWriteAccess } from '@/lib/projects/access'

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  try {
    const { userId, orgId } = await auth()
    if (!userId) {
      return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
    }

    const { projectId } = await params
    const projectIdNum = Number(projectId)
    if (Number.isNaN(projectIdNum)) {
      return NextResponse.json({ error: 'Projeto inválido' }, { status: 400 })
    }

    const project = await fetchProjectWithShares(projectIdNum)

    if (!project || !hasProjectWriteAccess(project, { userId, orgId })) {
      return NextResponse.json({ error: 'Projeto não encontrado' }, { status: 404 })
    }

    if (!project.webhookReminderUrl) {
      return NextResponse.json(
        { error: 'Webhook URL não configurada' },
        { status: 400 }
      )
    }

    // Create test payload
    const testPayload = {
      type: 'test',
      message: 'Este é um teste do webhook de lembretes do Studio Lagosta',
      timestamp: new Date().toISOString(),
      post: {
        id: 'test-post-id',
        content: 'Este é um post de teste para validar o webhook',
        scheduledFor: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
        platform: 'instagram',
        postType: 'STORY',
        mediaUrls: ['https://example.com/test-image.jpg'],
        extraInfo: 'Link de teste: https://example.com',
        firstComment: null
      },
      project: {
        id: project.id,
        name: project.name,
        instagramUsername: project.instagramUsername
      }
    }

    // Send test webhook
    const startTime = Date.now()

    try {
      const response = await fetch(project.webhookReminderUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'Studio-Lagosta-Reminders/1.0'
        },
        body: JSON.stringify(testPayload),
        signal: AbortSignal.timeout(10000) // 10s timeout
      })

      const responseTime = Date.now() - startTime

      // Try to get response body (for debugging)
      let responseBody = null
      try {
        const contentType = response.headers.get('content-type')
        if (contentType?.includes('application/json')) {
          responseBody = await response.json()
        } else {
          responseBody = await response.text()
        }
      } catch {
        // Ignore if can't parse body
      }

      if (!response.ok) {
        return NextResponse.json({
          success: false,
          error: `Webhook retornou status ${response.status}: ${response.statusText}`,
          statusCode: response.status,
          responseTime,
          responseBody
        }, { status: 200 }) // Return 200 but with error details
      }

      return NextResponse.json({
        success: true,
        message: 'Webhook enviado com sucesso',
        statusCode: response.status,
        responseTime,
        responseBody
      })

    } catch (error: any) {
      const responseTime = Date.now() - startTime

      // Handle different error types
      if (error.name === 'AbortError') {
        return NextResponse.json({
          success: false,
          error: 'Timeout: webhook não respondeu em 10 segundos',
          responseTime
        }, { status: 200 })
      }

      if (error.cause?.code === 'ENOTFOUND') {
        return NextResponse.json({
          success: false,
          error: 'URL não encontrada (verifique se o domínio está correto)',
          responseTime
        }, { status: 200 })
      }

      if (error.cause?.code === 'ECONNREFUSED') {
        return NextResponse.json({
          success: false,
          error: 'Conexão recusada (verifique se o servidor está rodando)',
          responseTime
        }, { status: 200 })
      }

      return NextResponse.json({
        success: false,
        error: error.message || 'Erro desconhecido ao enviar webhook',
        responseTime
      }, { status: 200 })
    }

  } catch (error) {
    console.error('[API] Failed to test webhook', error)
    return NextResponse.json(
      { error: 'Erro ao testar webhook' },
      { status: 500 }
    )
  }
}
