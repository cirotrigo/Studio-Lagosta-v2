export const KONVA_TEMPLATE_SCHEMA_VERSION = 2 as const

export const KONVA_CHANNELS = {
  TEMPLATE_LIST: 'konva:template:list',
  TEMPLATE_GET: 'konva:template:get',
  TEMPLATE_SAVE: 'konva:template:save',
  TEMPLATE_DELETE: 'konva:template:delete',
  SYNC_PULL: 'konva:sync:pull',
  SYNC_PUSH: 'konva:sync:push',
  SYNC_STATUS: 'konva:sync:status',
} as const

export type KonvaChannel = (typeof KONVA_CHANNELS)[keyof typeof KONVA_CHANNELS]

export type ArtFormat = 'STORY' | 'FEED_PORTRAIT' | 'SQUARE'
export type SlotFieldKey =
  | 'pre_title'
  | 'title'
  | 'description'
  | 'cta'
  | 'badge'
  | 'footer_info_1'
  | 'footer_info_2'

export type SlotOverflowBehavior = 'scale-down' | 'ellipsis' | 'clip'

export interface SlotBinding {
  id: string
  layerId: string
  fieldKey: SlotFieldKey
  label: string
  constraints?: {
    maxLines?: number
    maxCharsPerLine?: number
    minFontSize?: number
    maxFontSize?: number
    overflowBehavior?: SlotOverflowBehavior
  }
}

export interface KonvaLayer {
  id: string
  type: string
  [key: string]: unknown
}

export interface KonvaPage {
  id: string
  name: string
  width: number
  height: number
  background?: string
  order: number
  layers: KonvaLayer[]
  thumbnailPath?: string
}

export interface KonvaTemplateDocument {
  schemaVersion: typeof KONVA_TEMPLATE_SCHEMA_VERSION
  id: string
  projectId: number
  engine: 'KONVA'
  name: string
  format: ArtFormat
  source: 'local' | 'synced'
  design: {
    pages: KonvaPage[]
    currentPageId: string
  }
  identity: {
    brandName?: string
    logoUrl?: string
    colors: string[]
    fonts: Array<{ name: string; fontFamily: string; fileUrl?: string }>
    textColorPreferences?: {
      titleColor?: string
      subtitleColor?: string
      infoColor?: string
      ctaColor?: string
    }
  }
  slots: SlotBinding[]
  meta: {
    fingerprint?: string
    createdAt: string
    updatedAt: string
    syncedAt?: string
    isDirty: boolean
    thumbnailPath?: string
  }
}

export interface TemplateSaveResult {
  ok: true
  id: string
}

export interface TemplateDeleteResult {
  ok: true
}

export type SyncEntity = 'template' | 'generation'
export type SyncOperationType = 'create' | 'update' | 'delete'

export interface SyncQueueItem {
  operationId: string
  projectId: number
  entity: SyncEntity
  entityId: string
  op: SyncOperationType
  queuedAt: string
}

export type SyncState = 'idle' | 'offline' | 'syncing' | 'conflict' | 'error'

export interface SyncStatus {
  projectId: number
  state: SyncState
  pending: number
  lastSyncAt?: string
  lastError?: string
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
