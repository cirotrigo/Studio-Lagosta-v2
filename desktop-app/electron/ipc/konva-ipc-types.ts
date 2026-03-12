export const KONVA_TEMPLATE_SCHEMA_VERSION = 2 as const

export const KONVA_CHANNELS = {
  TEMPLATE_LIST: 'konva:template:list',
  TEMPLATE_GET: 'konva:template:get',
  TEMPLATE_SAVE: 'konva:template:save',
  TEMPLATE_DELETE: 'konva:template:delete',
  SYNC_PULL: 'konva:sync:pull',
  SYNC_PUSH: 'konva:sync:push',
  SYNC_STATUS: 'konva:sync:status',
  SYNC_FORCE: 'konva:sync:force',
  SYNC_RESOLVE_CONFLICT: 'konva:sync:resolve-conflict',
  SYNC_LIST_CONFLICTS: 'konva:sync:list-conflicts',
  SYNC_QUEUE_LIST: 'konva:sync:queue-list',
  SYNC_QUEUE_CLEAR: 'konva:sync:queue-clear',
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
  tags?: string[]
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
    remoteId?: number
  }
}

export interface TemplateSaveResult {
  ok: true
  id: string
}

export interface TemplateDeleteResult {
  ok: true
}

export type SyncEntity = 'template' | 'generation' | 'settings'
export type SyncOperationType = 'create' | 'update' | 'delete'
export type ConflictResolution = 'keep-local' | 'keep-remote' | 'duplicate-local'

export interface SyncQueueItem {
  operationId: string
  projectId: number
  entity: SyncEntity
  entityId: string
  op: SyncOperationType
  queuedAt: string
  payload?: KonvaTemplateDocument
  localUpdatedAt: string
  localHash: string
  retryCount: number
  lastError?: string
}

export type SyncState = 'idle' | 'offline' | 'syncing' | 'conflict' | 'error'

export interface SyncStatus {
  projectId: number
  state: SyncState
  pending: number
  conflictCount: number
  lastSyncAt?: string
  lastError?: string
}

export interface SyncConflict {
  id: string
  projectId: number
  entityType: SyncEntity
  entityId: string
  localVersion: {
    updatedAt: string
    hash: string
    document: KonvaTemplateDocument
  }
  remoteVersion: {
    updatedAt: string
    hash: string
    document: KonvaTemplateDocument
  }
  detectedAt: string
  resolution?: ConflictResolution
  resolvedAt?: string
}

export interface SyncPullResult {
  ok: boolean
  pulled: number
  conflicts: number
  updatedAt: string
  error?: string
}

export interface SyncPushResult {
  ok: boolean
  pushed: number
  pending: number
  updatedAt: string
  error?: string
}

export interface SyncForceResult {
  ok: boolean
  pulled: number
  pushed: number
  conflicts: number
  error?: string
}

export interface SyncResolveConflictResult {
  ok: boolean
  resolution: ConflictResolution
  entityId: string
  error?: string
}

export interface RemoteTemplateMetadata {
  id: number
  localId?: string
  name: string
  updatedAt: string
  hash?: string
  designData?: unknown
}

export interface RemoteSyncResponse {
  templates: RemoteTemplateMetadata[]
  lastSync: string
}
