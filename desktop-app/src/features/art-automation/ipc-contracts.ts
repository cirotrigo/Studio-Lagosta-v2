import { ArtFormat, ArtTextFields } from './types'

export interface GenerateAiTextPayload {
  projectId: number
  prompt: string
  format: ArtFormat
  variations: 1 | 2 | 4
  templateIds?: string[]
  includeLogo: boolean
  usePhoto: boolean
  photoUrl?: string
  compositionEnabled?: boolean
  compositionPrompt?: string
  compositionReferenceUrls?: string[]
}

export interface GenerateAiTextResponse {
  variacoes: ArtTextFields[]
  knowledge?: {
    applied: boolean
    context: string
    categoriesUsed: string[]
    hits: Array<{
      entryId: string
      title: string
      category: string
      content: string
      score: number
      source: 'rag' | 'fallback-db'
    }>
  }
  warnings?: string[]
  conflicts?: string[]
}

export interface RenderImageBatchPayload {
  projectId: number
  format: ArtFormat
  frames: Array<{
    variationId: string
    html: string
    width: number
    height: number
  }>
}

export interface RenderedFrame {
  variationId: string
  buffer: ArrayBuffer
  mimeType: 'image/jpeg' | 'image/png'
}
