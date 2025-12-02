import { NextResponse } from 'next/server'
import { getAvailableModels } from '@/lib/ai/image-models-config'

/**
 * GET /api/ai/models
 * Retorna a lista de modelos de IA disponíveis para geração de imagens
 */
export async function GET() {
  try {
    const models = getAvailableModels()
    return NextResponse.json(models)
  } catch (error) {
    console.error('[AI Models] Error:', error)
    return NextResponse.json(
      { error: 'Failed to fetch AI models' },
      { status: 500 }
    )
  }
}
