import type { ArtFormat } from './template'

export interface ReeditDraft {
  sourceArtId: string
  prompt: string
  format: ArtFormat
  photoUrl?: string
  photoSource?: 'ai' | 'drive' | 'upload' | 'history'
}
