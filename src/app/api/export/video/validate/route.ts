import { NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { z } from 'zod'
import { validateCreditsForFeature } from '@/lib/credits/deduct'

const validateVideoSchema = z.object({
  layerId: z.string(),
})

export async function POST(request: Request) {
  const { userId, orgId } = await auth()
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const body = validateVideoSchema.parse(await request.json())

    // Validar créditos ANTES de processar
    const validation = await validateCreditsForFeature(userId, 'video_export', 1, {
      organizationId: orgId ?? undefined,
    })

    return NextResponse.json({
      success: true,
      available: validation.available,
      needed: validation.needed,
      layerId: body.layerId,
    })
  } catch (error) {
    console.error('Video export validation error:', error)

    if (error instanceof Error && error.message.includes('créditos insuficientes')) {
      return NextResponse.json(
        { error: 'Créditos insuficientes para exportar vídeo' },
        { status: 402 }
      )
    }

    return NextResponse.json({ error: 'Falha ao validar exportação de vídeo' }, { status: 500 })
  }
}
