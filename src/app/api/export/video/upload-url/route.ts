import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { handleUpload, type HandleUploadBody } from '@vercel/blob/client'
import { fetchProjectWithShares, hasProjectWriteAccess } from '@/lib/projects/access'

type LegacyUploadBody = {
  pathname?: string
  type?: string
}

function normalizeHandleUploadBody(body: unknown): {
  normalized: HandleUploadBody | null
  isLegacy: boolean
} {
  if (body && typeof body === 'object' && 'type' in body && 'payload' in body) {
    return { normalized: body as HandleUploadBody, isLegacy: false }
  }

  if (body && typeof body === 'object' && typeof (body as LegacyUploadBody).pathname === 'string') {
    return { normalized: null, isLegacy: true }
  }

  return { normalized: null, isLegacy: false }
}

export const runtime = 'nodejs'
export const maxDuration = 60

/**
 * POST /api/export/video/upload-url
 * Gera URL de upload assinada para Vercel Blob (client upload direto)
 *
 * Body: o do `upload()` de `@vercel/blob/client`, com
 * `clientPayload: JSON.stringify({ projectId })`.
 *
 * O token sai preso a um projeto em que quem pede tem escrita, e só para
 * caminhos `videos/<projectId>/…`.
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const rawBody = await request.json()
    const { normalized, isLegacy } = normalizeHandleUploadBody(rawBody)

    if (!normalized) {
      if (isLegacy) {
        console.warn('[UPLOAD_URL] Legacy payload detected - client bundle is outdated')
        return NextResponse.json(
          {
            error: 'Fluxo de upload desatualizado',
            help: 'Recarregue o app (CTRL/CMD + Shift + R) para baixar a versão mais recente.',
          },
          { status: 400 }
        )
      }

      console.warn('[UPLOAD_URL] Invalid request body received')
      return NextResponse.json(
        { error: 'Payload inválido', help: 'Atualize a página e tente novamente.' },
        { status: 400 }
      )
    }

    const isGenerateTokenEvent = normalized.type === 'blob.generate-client-token'
    let userId: string | null = null
    let projectId: number | null = null

    if (isGenerateTokenEvent) {
      const authResult = await auth()
      userId = authResult.userId

      if (!userId) {
        return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
      }

      const { pathname, clientPayload } = normalized.payload
      try {
        const lido = JSON.parse(clientPayload || '{}') as { projectId?: unknown }
        projectId = Number.isInteger(lido.projectId) ? (lido.projectId as number) : null
      } catch {
        projectId = null
      }
      if (!projectId) {
        return NextResponse.json({ error: 'projectId é obrigatório' }, { status: 400 })
      }
      if (!hasProjectWriteAccess(await fetchProjectWithShares(projectId), { userId, orgId: authResult.orgId })) {
        return NextResponse.json({ error: 'Projeto não encontrado' }, { status: 404 })
      }
      if (!pathname.startsWith(`videos/${projectId}/`)) {
        return NextResponse.json({ error: 'Invalid pathname' }, { status: 400 })
      }

      if (isLegacy) {
        console.warn('[UPLOAD_URL] Legacy upload payload detected for user:', userId)
      }
    }

    const jsonResponse = await handleUpload({
      body: normalized,
      request,
      onBeforeGenerateToken: async (pathname) => {
        if (!userId) {
          console.error('[UPLOAD_URL] Missing userId during token generation')
          throw new Error('Usuário não autenticado')
        }

        if (!projectId || !pathname.startsWith(`videos/${projectId}/`)) {
          console.warn('[UPLOAD_URL] Invalid pathname attempt:', pathname, 'user:', userId)
          throw new Error('Invalid pathname')
        }

        console.log('[UPLOAD_URL] Generating upload token for:', pathname, 'user:', userId)

        return {
          allowedContentTypes: [
            'video/mp4',
            'video/webm',
            'video/quicktime',
            'image/jpeg',
            'image/png',
          ],
          maximumSizeInBytes: 500 * 1024 * 1024, // 500MB max
          tokenPayload: JSON.stringify({
            userId,
            projectId,
            uploadedAt: new Date().toISOString(),
          }),
        }
      },
      onUploadCompleted: async ({ blob, tokenPayload }) => {
        // Callback opcional quando upload completa
        console.log('[UPLOAD_URL] Upload completed:', blob.url)

        try {
          const payload = JSON.parse(tokenPayload || '{}')
          console.log('[UPLOAD_URL] Upload by user:', payload.userId)
        } catch (e) {
          console.error('[UPLOAD_URL] Failed to parse token payload:', e)
        }
      },
    })

    return NextResponse.json(jsonResponse)
  } catch (error) {
    console.error('[UPLOAD_URL] Failed to generate upload URL:', error)
    return NextResponse.json(
      {
        error: 'Erro ao gerar URL de upload',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    )
  }
}
