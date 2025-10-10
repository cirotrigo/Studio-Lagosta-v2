import { NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { z } from 'zod'
import { deductCreditsForFeature } from '@/lib/credits/deduct'

const confirmVideoSchema = z.object({
  layerId: z.string(),
  duration: z.number().positive(),
  fileSize: z.number().positive(),
})

export async function POST(request: Request) {
  const { userId } = await auth()
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const body = confirmVideoSchema.parse(await request.json())

    console.log('[Video Export Confirm] Iniciando confirmação:', {
      userId,
      layerId: body.layerId,
      duration: body.duration,
      fileSize: body.fileSize,
    })

    // Deduzir créditos APÓS sucesso da exportação
    const result = await deductCreditsForFeature({
      clerkUserId: userId,
      feature: 'video_export',
      details: {
        layerId: body.layerId,
        duration: body.duration,
        fileSize: body.fileSize,
        timestamp: new Date().toISOString(),
      },
    })

    console.log('[Video Export Confirm] Créditos deduzidos com sucesso:', {
      creditsRemaining: result.creditsRemaining,
    })

    return NextResponse.json({
      success: true,
      creditsRemaining: result.creditsRemaining,
      creditsDeducted: 10,
    })
  } catch (error) {
    console.error('[Video Export Confirm] Erro na confirmação:', {
      error: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined,
      userId,
    })

    if (error instanceof Error && error.message.includes('créditos insuficientes')) {
      return NextResponse.json(
        { error: 'Créditos insuficientes para confirmar exportação' },
        { status: 402 }
      )
    }

    // Retornar erro mais detalhado
    return NextResponse.json(
      {
        error: 'Falha ao confirmar exportação de vídeo',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    )
  }
}
