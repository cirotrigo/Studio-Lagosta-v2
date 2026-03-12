import type {
  ApprovePayload,
  ExportBatchPayload,
  ExportSinglePayload,
  GenerationPayload,
  KnowledgeQueryPayload,
  KnowledgeSnippet,
  PreparedVariation,
  SyncPullResult,
  SyncPushResult,
  SyncStatus,
} from './generation'
import type { KonvaTemplateDocument } from './template'

export const KONVA_IPC_CHANNELS = {
  TEMPLATE_LIST: 'konva:template:list',
  TEMPLATE_GET: 'konva:template:get',
  TEMPLATE_SAVE: 'konva:template:save',
  TEMPLATE_DELETE: 'konva:template:delete',
  GENERATION_PREPARE: 'konva:generation:prepare',
  GENERATION_APPROVE: 'konva:generation:approve',
  GENERATION_KNOWLEDGE_PREVIEW: 'konva:generation:knowledge-preview',
  EXPORT_SINGLE: 'konva:export:single',
  EXPORT_BATCH: 'konva:export:batch',
  SYNC_PULL: 'konva:sync:pull',
  SYNC_PUSH: 'konva:sync:push',
  SYNC_STATUS: 'konva:sync:status',
} as const

export type KonvaIpcChannel =
  (typeof KONVA_IPC_CHANNELS)[keyof typeof KONVA_IPC_CHANNELS]

export interface KonvaIpcArgsMap {
  'konva:template:list': [projectId: number]
  'konva:template:get': [projectId: number, templateId: string]
  'konva:template:save': [projectId: number, doc: KonvaTemplateDocument]
  'konva:template:delete': [projectId: number, templateId: string]

  'konva:generation:prepare': [payload: GenerationPayload]
  'konva:generation:approve': [payload: ApprovePayload]
  'konva:generation:knowledge-preview': [payload: KnowledgeQueryPayload]

  'konva:export:single': [payload: ExportSinglePayload]
  'konva:export:batch': [payload: ExportBatchPayload]

  'konva:sync:pull': [projectId: number]
  'konva:sync:push': [projectId: number]
  'konva:sync:status': [projectId: number]
}

export interface KonvaIpcResultMap {
  'konva:template:list': KonvaTemplateDocument[]
  'konva:template:get': KonvaTemplateDocument | null
  'konva:template:save': { ok: true; id: string }
  'konva:template:delete': { ok: true }

  'konva:generation:prepare': PreparedVariation[]
  'konva:generation:approve': { ok: true; files: string[] }
  'konva:generation:knowledge-preview': { ok: true; snippets: KnowledgeSnippet[] }

  'konva:export:single': { ok: true; filePath: string }
  'konva:export:batch': { ok: true; files: string[] }

  'konva:sync:pull': SyncPullResult
  'konva:sync:push': SyncPushResult
  'konva:sync:status': SyncStatus
}

export type KonvaIpcInvoke = <TChannel extends KonvaIpcChannel>(
  channel: TChannel,
  ...args: KonvaIpcArgsMap[TChannel]
) => Promise<KonvaIpcResultMap[TChannel]>

export interface KonvaTemplateIpcClient {
  list(projectId: number): Promise<KonvaTemplateDocument[]>
  get(projectId: number, templateId: string): Promise<KonvaTemplateDocument | null>
  save(projectId: number, doc: KonvaTemplateDocument): Promise<{ ok: true; id: string }>
  delete(projectId: number, templateId: string): Promise<{ ok: true }>
}

export interface KonvaSyncQueueItem {
  operationId: string
  projectId: number
  entity: 'template' | 'generation'
  entityId: string
  op: 'create' | 'update' | 'delete'
  queuedAt: string
}
