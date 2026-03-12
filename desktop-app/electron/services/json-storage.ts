import { createHash, randomUUID } from 'crypto'
import { app } from 'electron'
import { promises as fs } from 'fs'
import path from 'path'

import {
  KONVA_TEMPLATE_SCHEMA_VERSION,
  type ConflictResolution,
  type KonvaTemplateDocument,
  type SyncConflict,
  type SyncOperationType,
  type SyncQueueItem,
  type SyncState,
  type SyncStatus,
} from '../ipc/konva-ipc-types'

const STORAGE_APP_FOLDER = 'LagostaTools'
const PROJECTS_FOLDER = 'projects'
const TEMPLATES_FOLDER = 'templates'
const SYNC_FOLDER = 'sync'
const SYNC_QUEUE_FILE = 'queue.json'
const SYNC_LAST_FILE = 'last-sync.json'
const SYNC_CONFLICTS_FILE = 'conflicts.json'
const SYNC_STATE_FILE = 'state.json'

type LastSyncMap = Record<string, string>

interface ProjectSyncState {
  state: SyncState
  lastError?: string
  isOnline: boolean
}

export class JsonStorageService {
  private readonly rootDir: string

  constructor(rootDir = path.join(app.getPath('appData'), STORAGE_APP_FOLDER)) {
    this.rootDir = rootDir
  }

  getRootDir(): string {
    return this.rootDir
  }

  async ensureBaseStructure(): Promise<void> {
    await Promise.all([
      fs.mkdir(this.rootDir, { recursive: true }),
      fs.mkdir(path.join(this.rootDir, PROJECTS_FOLDER), { recursive: true }),
      fs.mkdir(path.join(this.rootDir, 'gallery'), { recursive: true }),
      fs.mkdir(this.getSyncDir(), { recursive: true }),
    ])

    if (!(await this.exists(this.getSyncQueuePath()))) {
      await this.writeJsonAtomic(this.getSyncQueuePath(), [])
    }

    if (!(await this.exists(this.getLastSyncPath()))) {
      await this.writeJsonAtomic(this.getLastSyncPath(), {})
    }

    if (!(await this.exists(this.getConflictsPath()))) {
      await this.writeJsonAtomic(this.getConflictsPath(), [])
    }

    if (!(await this.exists(this.getSyncStatePath()))) {
      await this.writeJsonAtomic(this.getSyncStatePath(), {})
    }
  }

  // ─────────────────────────────────────────────────────────────────
  // Hash calculation for conflict detection
  // ─────────────────────────────────────────────────────────────────

  calculateDocumentHash(doc: KonvaTemplateDocument): string {
    // Normalize document by removing volatile fields
    const normalized = {
      ...doc,
      meta: {
        ...doc.meta,
        updatedAt: undefined,
        createdAt: undefined,
        syncedAt: undefined,
        isDirty: undefined,
      },
    }
    const content = JSON.stringify(normalized, Object.keys(normalized).sort())
    return createHash('sha256').update(content).digest('hex').slice(0, 16)
  }

  async listTemplates(projectId: number): Promise<KonvaTemplateDocument[]> {
    const templatesDir = this.getTemplatesDir(projectId)
    await fs.mkdir(templatesDir, { recursive: true })

    const entries = await fs.readdir(templatesDir, { withFileTypes: true })
    const docs: KonvaTemplateDocument[] = []

    for (const entry of entries) {
      if (!entry.isFile() || !entry.name.endsWith('.json')) continue

      const filePath = path.join(templatesDir, entry.name)
      try {
        const parsed = await this.readJsonFile<KonvaTemplateDocument>(filePath)
        if (!parsed) continue
        this.validateTemplateDocument(projectId, parsed)
        docs.push(parsed)
      } catch (error) {
        console.warn('[Konva Storage] Ignoring invalid template file:', filePath, error)
      }
    }

    docs.sort((a, b) => b.meta.updatedAt.localeCompare(a.meta.updatedAt))
    return docs
  }

  async getTemplate(projectId: number, templateId: string): Promise<KonvaTemplateDocument | null> {
    const filePath = this.getTemplateFilePath(projectId, templateId)
    const parsed = await this.readJsonFile<KonvaTemplateDocument>(filePath)
    if (!parsed) return null

    this.validateTemplateDocument(projectId, parsed)
    return parsed
  }

  async saveTemplate(projectId: number, doc: KonvaTemplateDocument): Promise<{ id: string }> {
    const now = new Date().toISOString()
    const normalized: KonvaTemplateDocument = {
      ...doc,
      schemaVersion: KONVA_TEMPLATE_SCHEMA_VERSION,
      projectId,
      engine: 'KONVA',
      source: doc.source ?? 'local',
      meta: {
        ...doc.meta,
        createdAt: doc.meta?.createdAt || now,
        updatedAt: now,
        isDirty: doc.meta?.isDirty ?? true,
      },
    }

    this.validateTemplateDocument(projectId, normalized)
    const filePath = this.getTemplateFilePath(projectId, normalized.id)
    await this.writeJsonAtomic(filePath, normalized)
    return { id: normalized.id }
  }

  async deleteTemplate(projectId: number, templateId: string): Promise<boolean> {
    const filePath = this.getTemplateFilePath(projectId, templateId)
    try {
      await fs.unlink(filePath)
      return true
    } catch (error) {
      if (this.isErrnoException(error) && error.code === 'ENOENT') {
        return false
      }
      throw error
    }
  }

  async enqueueSyncOperation(input: {
    projectId: number
    entity: SyncQueueItem['entity']
    entityId: string
    op: SyncOperationType
    payload?: KonvaTemplateDocument
  }): Promise<SyncQueueItem[]> {
    const queue = await this.readQueue()
    const now = new Date().toISOString()
    const dedupeKey = this.buildQueueDedupeKey(input.projectId, input.entityId, input.op)
    const existingIndex = queue.findIndex((item) =>
      this.buildQueueDedupeKey(item.projectId, item.entityId, item.op) === dedupeKey
    )

    const localHash = input.payload ? this.calculateDocumentHash(input.payload) : ''

    const nextItem: SyncQueueItem = {
      operationId: randomUUID(),
      projectId: input.projectId,
      entity: input.entity,
      entityId: input.entityId,
      op: input.op,
      queuedAt: now,
      payload: input.payload,
      localUpdatedAt: input.payload?.meta?.updatedAt ?? now,
      localHash,
      retryCount: 0,
    }

    if (existingIndex >= 0) {
      queue[existingIndex] = {
        ...queue[existingIndex],
        ...nextItem,
        retryCount: queue[existingIndex].retryCount,
      }
    } else {
      queue.push(nextItem)
    }

    await this.writeQueue(queue)
    return queue
  }

  async listSyncQueue(projectId?: number): Promise<SyncQueueItem[]> {
    const queue = await this.readQueue()
    if (projectId === undefined) return queue
    return queue.filter((item) => item.projectId === projectId)
  }

  async removeSyncOperation(operationId: string): Promise<void> {
    const queue = await this.readQueue()
    const filtered = queue.filter((item) => item.operationId !== operationId)
    await this.writeQueue(filtered)
  }

  async updateSyncOperation(operationId: string, update: Partial<SyncQueueItem>): Promise<void> {
    const queue = await this.readQueue()
    const index = queue.findIndex((item) => item.operationId === operationId)
    if (index >= 0) {
      queue[index] = { ...queue[index], ...update }
      await this.writeQueue(queue)
    }
  }

  async clearSyncQueue(projectId?: number): Promise<void> {
    if (projectId === undefined) {
      await this.writeQueue([])
    } else {
      const queue = await this.readQueue()
      const filtered = queue.filter((item) => item.projectId !== projectId)
      await this.writeQueue(filtered)
    }
  }

  // ─────────────────────────────────────────────────────────────────
  // Conflict management
  // ─────────────────────────────────────────────────────────────────

  async listConflicts(projectId?: number): Promise<SyncConflict[]> {
    const conflicts = await this.readConflicts()
    if (projectId === undefined) return conflicts
    return conflicts.filter((c) => c.projectId === projectId)
  }

  async addConflict(conflict: SyncConflict): Promise<void> {
    const conflicts = await this.readConflicts()
    const existingIndex = conflicts.findIndex((c) => c.id === conflict.id)
    if (existingIndex >= 0) {
      conflicts[existingIndex] = conflict
    } else {
      conflicts.push(conflict)
    }
    await this.writeConflicts(conflicts)
  }

  async resolveConflict(conflictId: string, resolution: ConflictResolution): Promise<SyncConflict | null> {
    const conflicts = await this.readConflicts()
    const index = conflicts.findIndex((c) => c.id === conflictId)
    if (index < 0) return null

    const resolved: SyncConflict = {
      ...conflicts[index],
      resolution,
      resolvedAt: new Date().toISOString(),
    }
    conflicts[index] = resolved
    await this.writeConflicts(conflicts)
    return resolved
  }

  async removeConflict(conflictId: string): Promise<void> {
    const conflicts = await this.readConflicts()
    const filtered = conflicts.filter((c) => c.id !== conflictId)
    await this.writeConflicts(filtered)
  }

  async getConflictCount(projectId: number): Promise<number> {
    const conflicts = await this.readConflicts()
    return conflicts.filter((c) => c.projectId === projectId && !c.resolvedAt).length
  }

  // ─────────────────────────────────────────────────────────────────
  // Sync state management
  // ─────────────────────────────────────────────────────────────────

  async setSyncState(projectId: number, state: SyncState, lastError?: string): Promise<void> {
    const stateMap = await this.readSyncStateMap()
    stateMap[String(projectId)] = { state, lastError, isOnline: state !== 'offline' }
    await this.writeJsonAtomic(this.getSyncStatePath(), stateMap)
  }

  async getSyncState(projectId: number): Promise<ProjectSyncState> {
    const stateMap = await this.readSyncStateMap()
    return stateMap[String(projectId)] ?? { state: 'idle', isOnline: true }
  }

  async getSyncStatus(projectId: number): Promise<SyncStatus> {
    const queue = await this.readQueue()
    const pending = queue.filter((item) => item.projectId === projectId).length
    const lastSyncAt = await this.getLastSync(projectId)
    const conflictCount = await this.getConflictCount(projectId)
    const { state, lastError } = await this.getSyncState(projectId)

    // Determine effective state based on pending/conflicts
    let effectiveState: SyncState = state
    if (conflictCount > 0 && state === 'idle') {
      effectiveState = 'conflict'
    }

    return {
      projectId,
      state: effectiveState,
      pending,
      conflictCount,
      lastSyncAt,
      lastError,
    }
  }

  async getPendingSyncCount(projectId: number): Promise<number> {
    const queue = await this.readQueue()
    return queue.filter((item) => item.projectId === projectId).length
  }

  async setLastSync(projectId: number, timestamp: string): Promise<void> {
    const map = await this.readLastSyncMap()
    map[String(projectId)] = timestamp
    await this.writeJsonAtomic(this.getLastSyncPath(), map)
  }

  private getProjectsDir(): string {
    return path.join(this.rootDir, PROJECTS_FOLDER)
  }

  private getProjectDir(projectId: number): string {
    return path.join(this.getProjectsDir(), String(projectId))
  }

  private getTemplatesDir(projectId: number): string {
    return path.join(this.getProjectDir(projectId), TEMPLATES_FOLDER)
  }

  private getTemplateFilePath(projectId: number, templateId: string): string {
    return path.join(this.getTemplatesDir(projectId), `${templateId}.json`)
  }

  private getSyncDir(): string {
    return path.join(this.rootDir, SYNC_FOLDER)
  }

  private getSyncQueuePath(): string {
    return path.join(this.getSyncDir(), SYNC_QUEUE_FILE)
  }

  private getLastSyncPath(): string {
    return path.join(this.getSyncDir(), SYNC_LAST_FILE)
  }

  private getConflictsPath(): string {
    return path.join(this.getSyncDir(), SYNC_CONFLICTS_FILE)
  }

  private getSyncStatePath(): string {
    return path.join(this.getSyncDir(), SYNC_STATE_FILE)
  }

  private async readQueue(): Promise<SyncQueueItem[]> {
    const raw = await this.readJsonFile<unknown>(this.getSyncQueuePath())
    if (!raw) return []

    if (Array.isArray(raw)) {
      return raw.filter((item): item is SyncQueueItem => this.isSyncQueueItem(item))
    }

    return []
  }

  private async writeQueue(queue: SyncQueueItem[]): Promise<void> {
    await this.writeJsonAtomic(this.getSyncQueuePath(), queue)
  }

  private async readConflicts(): Promise<SyncConflict[]> {
    const raw = await this.readJsonFile<unknown>(this.getConflictsPath())
    if (!raw) return []
    if (Array.isArray(raw)) {
      return raw.filter((item): item is SyncConflict => this.isSyncConflict(item))
    }
    return []
  }

  private async writeConflicts(conflicts: SyncConflict[]): Promise<void> {
    await this.writeJsonAtomic(this.getConflictsPath(), conflicts)
  }

  private async readSyncStateMap(): Promise<Record<string, ProjectSyncState>> {
    const raw = await this.readJsonFile<unknown>(this.getSyncStatePath())
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {}
    return raw as Record<string, ProjectSyncState>
  }

  private async readLastSyncMap(): Promise<LastSyncMap> {
    const raw = await this.readJsonFile<unknown>(this.getLastSyncPath())
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {}
    return raw as LastSyncMap
  }

  private async getLastSync(projectId: number): Promise<string | undefined> {
    const map = await this.readLastSyncMap()
    return map[String(projectId)]
  }

  private validateTemplateDocument(projectId: number, doc: KonvaTemplateDocument): void {
    if (!doc || typeof doc !== 'object') {
      throw new Error('Template document deve ser um objeto')
    }

    if (doc.schemaVersion !== KONVA_TEMPLATE_SCHEMA_VERSION) {
      throw new Error(`schemaVersion invalido: esperado ${KONVA_TEMPLATE_SCHEMA_VERSION}`)
    }

    if (doc.engine !== 'KONVA') {
      throw new Error('engine invalido para template Konva')
    }

    if (!doc.id || typeof doc.id !== 'string') {
      throw new Error('id do template invalido')
    }

    if (doc.projectId !== projectId) {
      throw new Error('projectId do template difere do projectId do handler')
    }

    if (!doc.design || !Array.isArray(doc.design.pages)) {
      throw new Error('design.pages invalido')
    }

    for (const page of doc.design.pages) {
      if (!Array.isArray(page.layers)) {
        throw new Error(`Pagina ${page.id} sem array de layers`)
      }
    }
  }

  private buildQueueDedupeKey(projectId: number, entityId: string, op: SyncOperationType): string {
    return `${projectId}:${entityId}:${op}`
  }

  private isSyncQueueItem(value: unknown): value is SyncQueueItem {
    if (!value || typeof value !== 'object') return false
    const raw = value as Record<string, unknown>
    return (
      typeof raw.operationId === 'string' &&
      typeof raw.projectId === 'number' &&
      typeof raw.entity === 'string' &&
      typeof raw.entityId === 'string' &&
      typeof raw.op === 'string' &&
      typeof raw.queuedAt === 'string'
    )
  }

  private isSyncConflict(value: unknown): value is SyncConflict {
    if (!value || typeof value !== 'object') return false
    const raw = value as Record<string, unknown>
    return (
      typeof raw.id === 'string' &&
      typeof raw.projectId === 'number' &&
      typeof raw.entityType === 'string' &&
      typeof raw.entityId === 'string' &&
      typeof raw.detectedAt === 'string' &&
      raw.localVersion !== undefined &&
      raw.remoteVersion !== undefined
    )
  }

  private async readJsonFile<T>(filePath: string): Promise<T | null> {
    try {
      const content = await fs.readFile(filePath, 'utf8')
      return JSON.parse(content) as T
    } catch (error) {
      if (this.isErrnoException(error) && error.code === 'ENOENT') {
        return null
      }
      throw error
    }
  }

  private async writeJsonAtomic(filePath: string, data: unknown): Promise<void> {
    const dirPath = path.dirname(filePath)
    await fs.mkdir(dirPath, { recursive: true })

    const tempPath = `${filePath}.tmp-${process.pid}-${Date.now()}-${Math.random().toString(16).slice(2)}`
    const serialized = `${JSON.stringify(data, null, 2)}\n`

    try {
      await fs.writeFile(tempPath, serialized, 'utf8')
      await fs.rename(tempPath, filePath)
    } catch (error) {
      await fs.rm(tempPath, { force: true }).catch(() => undefined)
      throw error
    }
  }

  private async exists(filePath: string): Promise<boolean> {
    try {
      await fs.access(filePath)
      return true
    } catch {
      return false
    }
  }

  private isErrnoException(error: unknown): error is NodeJS.ErrnoException {
    return Boolean(error && typeof error === 'object' && 'code' in error)
  }
}
