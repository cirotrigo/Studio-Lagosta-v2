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
  /** Navigate to editor with specific template loaded (by remote/server ID) */
  openTemplateRemoteId?: number
  /** Focus on specific page within the template */
  openPageId?: string
}
