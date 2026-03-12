export type ArtFormat = 'STORY' | 'FEED_PORTRAIT' | 'SQUARE'
export type VariationStatus = 'reviewing' | 'approved' | 'rendering' | 'rendered' | 'failed'
export type JobStatus = 'draft' | 'reviewing' | 'rendering' | 'completed' | 'failed'

export interface ArtTextFields {
  pre_title?: string
  title?: string
  description?: string
  cta?: string
  badge?: string
  footer_info_1?: string
  footer_info_2?: string
}

export interface ArtVariation {
  id: string
  templateId: string
  status: VariationStatus
  text: ArtTextFields
  htmlSnapshot?: string
  imageUrl?: string
  warnings: string[]
}

export interface ArtJob {
  id: string
  projectId: number
  status: JobStatus
  format: ArtFormat
  includeLogo: boolean
  usePhoto: boolean
  compositionEnabled: boolean
  prompt: string
  references: string[]
  modelPrimary: string
  modelFallback: string
  fallbackUsed: boolean
  variations: ArtVariation[]
  sourceArtId?: string
  version: number
  createdAt: string
  updatedAt: string
}
