import { auth } from '@clerk/nextjs/server'
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { put } from '@vercel/blob'
import { validateCreditsForFeature, deductCreditsForFeature } from '@/lib/credits/deduct'
import { getPhotoroomClient, PhotoroomAPIError } from '@/lib/photoroom/client'

export const runtime = 'nodejs'
export const maxDuration = 60

const BACKGROUND_REMOVAL_CREDITS = 3

const removeBackgroundSchema = z.object({
  imageUrl: z.string().url('URL de imagem invalida'),
  projectId: z.number().int().positive(),
})

export async function POST(request: Request) {
  const { userId, orgId } = await auth()
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const body = await request.json()
    const { imageUrl, projectId } = removeBackgroundSchema.parse(body)

    console.log('[Remove Background] Starting for user:', userId, 'imageUrl:', imageUrl)

    // Validate credits
    await validateCreditsForFeature(userId, 'background_removal', BACKGROUND_REMOVAL_CREDITS, {
      organizationId: orgId ?? undefined,
    })

    // Call Photoroom API
    const photoroom = getPhotoroomClient()
    const resultBlob = await photoroom.removeBackground(imageUrl)

    console.log('[Remove Background] Photoroom processing complete, uploading to Blob...')

    // Upload to Vercel Blob
    const fileName = `bg-removed-${Date.now()}.png`
    const blob = await put(
      `background-removed/${userId}/${fileName}`,
      resultBlob,
      {
        access: 'public',
        contentType: 'image/png',
        addRandomSuffix: true,
      }
    )

    console.log('[Remove Background] Uploaded to:', blob.url)

    // Deduct credits
    await deductCreditsForFeature({
      clerkUserId: userId,
      feature: 'background_removal',
      quantity: 1,
      details: {
        originalUrl: imageUrl,
        resultUrl: blob.url,
        projectId,
      },
      organizationId: orgId ?? undefined,
      projectId,
    })

    console.log('[Remove Background] Credits deducted successfully')

    return NextResponse.json({
      success: true,
      url: blob.url,
    })
  } catch (error) {
    console.error('[Remove Background] Error:', error)

    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Dados invalidos', details: error.errors },
        { status: 400 }
      )
    }

    if (error instanceof PhotoroomAPIError) {
      return NextResponse.json(
        { error: `Erro ao processar imagem: ${error.message}` },
        { status: error.statusCode >= 500 ? 502 : error.statusCode }
      )
    }

    const errorMessage = error instanceof Error ? error.message : String(error)

    if (errorMessage.includes('creditos') || errorMessage.includes('credits') || errorMessage.includes('Insufficient')) {
      return NextResponse.json({ error: errorMessage }, { status: 402 })
    }

    return NextResponse.json(
      { error: 'Falha ao remover fundo. Tente novamente.' },
      { status: 500 }
    )
  }
}
