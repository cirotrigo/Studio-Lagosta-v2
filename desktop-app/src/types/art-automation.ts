import type { ArtFormat, KonvaTemplateDocument } from './template'

export interface ReeditDraft {
  sourceArtId: string
  prompt: string
  format: ArtFormat
  photoUrl?: string
  photoSource?: 'ai' | 'drive' | 'upload' | 'history'
}

export interface ApprovedVariationEditorDraft {
  jobId: string
  variationId: string
  variationIndex: number
  prompt: string
  sourceTemplateId?: string
  sourceTemplateName?: string
  document: KonvaTemplateDocument
}

export interface EditorPageLocationState {
  approvedVariationDraft?: ApprovedVariationEditorDraft
}
