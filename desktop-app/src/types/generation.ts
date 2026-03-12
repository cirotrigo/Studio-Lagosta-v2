import type { ArtFormat, KonvaTemplateDocument, SlotFieldKey } from './template'

export type VariationCount = 1 | 2 | 4
export type ExportMimeType = 'image/jpeg' | 'image/png'

export interface GenerationPayload {
  projectId: number
  prompt: string
  format: ArtFormat
  templateId: string
  variations: VariationCount
  includeLogo: boolean
  usePhoto: boolean
  photoUrl?: string
  referenceUrls?: string[]
}

export interface PreparedVariation {
  id: string
  templateId: string
  format: ArtFormat
  document: KonvaTemplateDocument
  fields: Partial<Record<SlotFieldKey, string>>
  warnings: string[]
}

export interface ApprovePayload {
  projectId: number
  generationId: string
  variationIds: string[]
  exportMimeType: ExportMimeType
  quality?: number
}

export interface KnowledgeQueryPayload {
  projectId: number
  query: string
  limit?: number
}

export interface KnowledgeSnippet {
  id: string
  category: string
  content: string
  score?: number
}

export interface ExportSinglePayload {
  projectId: number
  templateId: string
  pageId: string
  mimeType: ExportMimeType
  quality?: number
  outputFileName?: string
  bufferBase64: string
}

export interface ExportBatchPayload {
  projectId: number
  mimeType: ExportMimeType
  quality?: number
  items: Array<{
    variationId: string
    outputFileName?: string
    bufferBase64: string
  }>
}

export interface SyncPullResult {
  ok: boolean
  pulled: number
  conflicts: number
  updatedAt: string
}

export interface SyncPushResult {
  ok: boolean
  pushed: number
  pending: number
  updatedAt: string
}

export type SyncState = 'idle' | 'offline' | 'syncing' | 'conflict' | 'error'

export interface SyncStatus {
  projectId: number
  state: SyncState
  pending: number
  lastSyncAt?: string
  lastError?: string
}
