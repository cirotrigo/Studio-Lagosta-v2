import { NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { generateThumbnail } from '@/lib/render-engine'
import type { DesignData } from '@/types/template'

export const runtime = 'nodejs'
export const maxDuration = 60

/**
 * POST /api/templates/generate-thumbnail
 * Gera um thumbnail para um design
 *
 * Body:
 * - designData: DesignData
 * - width: número (padrão: 400)
 * - height: número (padrão: 300)
 */
export async function POST(req: Request) {
  const { userId } = await auth()
  if (!userId) {
    return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  }

  try {
    const body = await req.json()
    const { designData, width = 400, height = 300 } = body

    if (!designData) {
      return NextResponse.json({ error: 'designData é obrigatório' }, { status: 400 })
    }

    // Gerar thumbnail usando RenderEngine
    const buffer = await generateThumbnail(designData as DesignData, {}, { width, height })

    // Converter para base64 data URL
    const base64 = buffer.toString('base64')
    const dataUrl = `data:image/png;base64,${base64}`

    return NextResponse.json({ thumbnailUrl: dataUrl })
  } catch (error) {
    console.error('Error generating thumbnail:', error)
    return NextResponse.json({ error: 'Erro ao gerar thumbnail' }, { status: 500 })
  }
}
