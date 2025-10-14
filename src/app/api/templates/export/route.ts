import { NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { deductCreditsForFeature, validateCreditsForFeature } from '@/lib/credits/deduct'
import { InsufficientCreditsError } from '@/lib/credits/errors'

export const runtime = 'nodejs'

/**
 * POST /api/templates/export
 * Valida e deduz créditos para exportação de template
 */
export async function POST(req: Request) {
  try {
    const { userId, orgId } = await auth()
    if (!userId) {
      return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
    }

    const body = await req.json()
    const { templateId, format } = body

    console.log('[TEMPLATE_EXPORT] Starting export for user:', userId, 'format:', format)

    // Validar créditos disponíveis
    try {
      await validateCreditsForFeature(userId, 'creative_download', 1, {
        organizationId: orgId ?? undefined,
      })
    } catch (error) {
      if (error instanceof InsufficientCreditsError) {
        return NextResponse.json(
          {
            error: 'Créditos insuficientes',
            required: error.required,
            available: error.available
          },
          { status: 402 },
        )
      }
      throw error
    }

    // Deduzir créditos
    const result = await deductCreditsForFeature({
      clerkUserId: userId,
      feature: 'creative_download',
      details: {
        templateId,
        format,
        exportType: 'local_konva',
      },
      organizationId: orgId ?? undefined,
    })

    console.log('[TEMPLATE_EXPORT] Credits deducted successfully. Remaining:', result.creditsRemaining)

    return NextResponse.json({
      success: true,
      creditsRemaining: result.creditsRemaining,
    })
  } catch (error) {
    console.error('[TEMPLATE_EXPORT] Failed to process export:', error)
    return NextResponse.json(
      { error: 'Erro ao processar exportação' },
      { status: 500 },
    )
  }
}
