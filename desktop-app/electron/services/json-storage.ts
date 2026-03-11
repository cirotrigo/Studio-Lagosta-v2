import { randomUUID } from 'crypto'
import { app } from 'electron'
import { promises as fs } from 'fs'
import path from 'path'

import {
  KONVA_TEMPLATE_SCHEMA_VERSION,
  type KonvaTemplateDocument,
  type SyncOperationType,
  type SyncQueueItem,
  type SyncStatus,
} from '../ipc/konva-ipc-types'

const STORAGE_APP_FOLDER = 'LagostaTools'
const PROJECTS_FOLDER = 'projects'
const TEMPLATES_FOLDER = 'templates'
const SYNC_FOLDER = 'sync'
const SYNC_QUEUE_FILE = 'queue.json'
const SYNC_LAST_FILE = 'last-sync.json'

type LastSyncMap = Record<string, string>

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
  }): Promise<SyncQueueItem[]> {
    const queue = await this.readQueue()
    const now = new Date().toISOString()
    const dedupeKey = this.buildQueueDedupeKey(input.projectId, input.entityId, input.op)
    const existingIndex = queue.findIndex((item) =>
      this.buildQueueDedupeKey(item.projectId, item.entityId, item.op) === dedupeKey
    )

    const nextItem: SyncQueueItem = {
      operationId: randomUUID(),
      projectId: input.projectId,
      entity: input.entity,
      entityId: input.entityId,
      op: input.op,
      queuedAt: now,
    }

    if (existingIndex >= 0) {
      queue[existingIndex] = {
        ...queue[existingIndex],
        ...nextItem,
      }
    } else {
      queue.push(nextItem)
    }

    await this.writeQueue(queue)
    return queue
  }

  async getSyncStatus(projectId: number): Promise<SyncStatus> {
    const queue = await this.readQueue()
    const pending = queue.filter((item) => item.projectId === projectId).length
    const lastSyncAt = await this.getLastSync(projectId)

    return {
      projectId,
      state: 'idle',
      pending,
      lastSyncAt,
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
