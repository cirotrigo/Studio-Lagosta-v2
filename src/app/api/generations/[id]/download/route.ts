import { NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { db } from '@/lib/db'
import { deductCreditsForFeature } from '@/lib/credits/deduct'
import { InsufficientCreditsError } from '@/lib/credits/errors'
import {
  fetchProjectWithShares,
  hasProjectReadAccess,
} from '@/lib/projects/access'

export const runtime = 'nodejs'

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { userId, orgId } = await auth()
    if (!userId) {
      return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
    }

    const { id } = await params

    // Buscar geração com verificação de ownership
    const generation = await db.generation.findFirst({
      where: { id },
      include: {
        Project: {
          select: {
            userId: true,
          },
        },
      },
    })

    if (!generation) {
      return NextResponse.json({ error: 'Criativo não encontrado' }, { status: 404 })
    }

    // Verificar acesso ao projeto considerando organizações
    const project = await fetchProjectWithShares(generation.projectId)

    if (!hasProjectReadAccess(project, { userId, orgId })) {
      return NextResponse.json({ error: 'Não autorizado' }, { status: 403 })
    }

    // Verificar se geração está completa
    if (generation.status !== 'COMPLETED' || !generation.resultUrl) {
      return NextResponse.json(
        { error: 'Criativo ainda não está pronto' },
        { status: 400 },
      )
    }

    // Deduzir créditos pelo download
    console.log('[DOWNLOAD] Attempting to deduct credits for user:', userId)
    try {
      const result = await deductCreditsForFeature({
        clerkUserId: userId,
        feature: 'creative_download',
        details: {
          generationId: generation.id,
          templateName: generation.templateName,
          projectName: generation.projectName,
        },
        organizationId: orgId ?? undefined,
        projectId: generation.projectId,
      })
      console.log('[DOWNLOAD] Credits deducted successfully. Remaining:', result.creditsRemaining)
    } catch (error) {
      console.error('[DOWNLOAD] Error deducting credits:', error)
      if (error instanceof InsufficientCreditsError) {
        return NextResponse.json(
          { error: 'Créditos insuficientes para fazer download' },
          { status: 402 },
        )
      }
      throw error
    }

    // Redirecionar para URL da imagem
    // O Vercel Blob já serve os arquivos publicamente
    return NextResponse.redirect(generation.resultUrl)
  } catch (error) {
    console.error('[API] Failed to download generation:', error)
    return NextResponse.json({ error: 'Erro ao fazer download' }, { status: 500 })
  }
}
