import { randomUUID } from 'crypto'

import {
  type ConflictResolution,
  type KonvaTemplateDocument,
  type RemoteSyncResponse,
  type RemoteTemplateMetadata,
  type SyncConflict,
  type SyncForceResult,
  type SyncPullResult,
  type SyncPushResult,
  type SyncQueueItem,
  type SyncResolveConflictResult,
} from '../ipc/konva-ipc-types'
import { JsonStorageService } from './json-storage'
import {
  normalizeForWeb,
  normalizeForLocal,
  logNormalizationWarnings,
} from './sync/template-normalizer'
import { validateWebPayload } from './sync/template-validator'

interface ExecuteRequestResult {
  isHtml: boolean
  text: string
  status: number
  statusText: string
  ok: boolean
  responseUrl?: string
}

interface AuthHtmlResult {
  isHtml: boolean
  text: string
  status: number
  responseUrl?: string
}

export interface SyncServiceDeps {
  webAppBaseUrl: string
  getFreshCookies: () => Promise<string | null>
  refreshClerkSession: () => Promise<boolean>
  executeRequest: (
    url: string,
    options: RequestInit,
    cookies: string | null,
  ) => Promise<ExecuteRequestResult>
  isAuthHtmlResponse: (result: AuthHtmlResult) => boolean
  extractErrorMessage: (payload: unknown, fallback: string) => string
}

const MAX_RETRY_COUNT = 3
const SYNC_TIMEOUT_MS = 30_000

function asObject(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object') return {}
  return value as Record<string, unknown>
}

export class SyncService {
  private readonly storage: JsonStorageService
  private readonly deps: SyncServiceDeps
  private isOnline = true
  private isSyncing = false

  constructor(storage: JsonStorageService, deps: SyncServiceDeps) {
    this.storage = storage
    this.deps = deps
  }

  setOnlineStatus(online: boolean): void {
    this.isOnline = online
  }

  getOnlineStatus(): boolean {
    return this.isOnline
  }

  // ─────────────────────────────────────────────────────────────────
  // Pull: fetch remote templates and detect conflicts
  // ─────────────────────────────────────────────────────────────────

  async pull(projectId: number): Promise<SyncPullResult> {
    if (!this.isOnline) {
      await this.storage.setSyncState(projectId, 'offline')
      return { ok: false, pulled: 0, conflicts: 0, updatedAt: '', error: 'offline' }
    }

    if (this.isSyncing) {
      return { ok: false, pulled: 0, conflicts: 0, updatedAt: '', error: 'sync_in_progress' }
    }

    this.isSyncing = true
    await this.storage.setSyncState(projectId, 'syncing')

    try {
      const remoteTemplates = await this.fetchRemoteTemplates(projectId)
      const localTemplates = await this.storage.listTemplates(projectId)

      console.log(`[SyncService] Pull: ${remoteTemplates.length} remote templates, ${localTemplates.length} local templates`)

      let pulled = 0
      let conflicts = 0
      let skipped = 0

      for (const remote of remoteTemplates) {
        // Find matching local template by remote ID stored in meta
        const local = localTemplates.find(
          (t) => t.meta.remoteId === remote.id || t.id === remote.localId
        )

        console.log(`[SyncService] Remote template ${remote.id} "${remote.name}": localId=${remote.localId || 'null'}, matched local: ${local?.id || 'none'}`)

        if (!local) {
          // New remote template, create locally
          console.log(`[SyncService] Creating local template from remote ${remote.id} "${remote.name}"`)
          const newDoc = this.remoteToLocal(projectId, remote)
          await this.storage.saveTemplate(projectId, newDoc)
          pulled++
          continue
        }

        // Check for conflicts
        const localHash = this.storage.calculateDocumentHash(local)
        const remoteHash = remote.hash ?? ''

        const localTime = new Date(local.meta.updatedAt).getTime()
        const remoteTime = new Date(remote.updatedAt).getTime()

        // Conflict: both changed (remote newer OR hashes differ after local change)
        if (local.meta.isDirty && remoteTime > localTime) {
          // Create conflict entry
          const conflict: SyncConflict = {
            id: randomUUID(),
            projectId,
            entityType: 'template',
            entityId: local.id,
            localVersion: {
              updatedAt: local.meta.updatedAt,
              hash: localHash,
              document: local,
            },
            remoteVersion: {
              updatedAt: remote.updatedAt,
              hash: remoteHash,
              document: this.remoteToLocal(projectId, remote),
            },
            detectedAt: new Date().toISOString(),
          }
          await this.storage.addConflict(conflict)
          conflicts++
          continue
        }

        // Remote is newer and local is clean - update local
        if (remoteTime > localTime && !local.meta.isDirty) {
          console.log(`[SyncService] Updating local template ${local.id} from remote ${remote.id}`)
          const updated = this.remoteToLocal(projectId, remote, local.id)
          await this.storage.saveTemplate(projectId, { ...updated, meta: { ...updated.meta, isDirty: false } })
          pulled++
        } else {
          console.log(`[SyncService] Skipping ${remote.id}: remoteTime=${remoteTime}, localTime=${localTime}, isDirty=${local.meta.isDirty}`)
          skipped++
        }
      }

      console.log(`[SyncService] Pull complete: pulled=${pulled}, conflicts=${conflicts}, skipped=${skipped}`)
      const now = new Date().toISOString()
      await this.storage.setLastSync(projectId, now)

      const newState = conflicts > 0 ? 'conflict' : 'idle'
      await this.storage.setSyncState(projectId, newState)

      return { ok: true, pulled, conflicts, updatedAt: now }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'pull_failed'
      await this.storage.setSyncState(projectId, 'error', errorMsg)
      return { ok: false, pulled: 0, conflicts: 0, updatedAt: '', error: errorMsg }
    } finally {
      this.isSyncing = false
    }
  }

  // ─────────────────────────────────────────────────────────────────
  // Push: send local changes to server
  // ─────────────────────────────────────────────────────────────────

  async push(projectId: number): Promise<SyncPushResult> {
    if (!this.isOnline) {
      await this.storage.setSyncState(projectId, 'offline')
      return { ok: false, pushed: 0, pending: 0, updatedAt: '', error: 'offline' }
    }

    if (this.isSyncing) {
      return { ok: false, pushed: 0, pending: 0, updatedAt: '', error: 'sync_in_progress' }
    }

    this.isSyncing = true
    await this.storage.setSyncState(projectId, 'syncing')

    try {
      const queue = await this.storage.listSyncQueue(projectId)
      let pushed = 0
      const failedOps: SyncQueueItem[] = []

      for (const op of queue) {
        try {
          const success = await this.pushOperation(op)
          if (success) {
            await this.storage.removeSyncOperation(op.operationId)
            pushed++

            // Mark template as synced
            if (op.entity === 'template' && op.op !== 'delete') {
              const template = await this.storage.getTemplate(projectId, op.entityId)
              if (template) {
                await this.storage.saveTemplate(projectId, {
                  ...template,
                  meta: { ...template.meta, isDirty: false, syncedAt: new Date().toISOString() },
                })
              }
            }
          } else {
            failedOps.push(op)
          }
        } catch (error) {
          const errorMsg = error instanceof Error ? error.message : 'push_op_failed'
          await this.storage.updateSyncOperation(op.operationId, {
            retryCount: op.retryCount + 1,
            lastError: errorMsg,
          })

          if (op.retryCount + 1 >= MAX_RETRY_COUNT) {
            failedOps.push(op)
          }
        }
      }

      const now = new Date().toISOString()
      await this.storage.setLastSync(projectId, now)

      const pendingCount = await this.storage.getPendingSyncCount(projectId)
      const conflictCount = await this.storage.getConflictCount(projectId)

      let newState: 'idle' | 'conflict' | 'error' = 'idle'
      if (conflictCount > 0) newState = 'conflict'
      else if (failedOps.length > 0) newState = 'error'

      await this.storage.setSyncState(projectId, newState, failedOps.length > 0 ? 'some_operations_failed' : undefined)

      return { ok: failedOps.length === 0, pushed, pending: pendingCount, updatedAt: now }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'push_failed'
      await this.storage.setSyncState(projectId, 'error', errorMsg)
      const pending = await this.storage.getPendingSyncCount(projectId)
      return { ok: false, pushed: 0, pending, updatedAt: '', error: errorMsg }
    } finally {
      this.isSyncing = false
    }
  }

  // ─────────────────────────────────────────────────────────────────
  // Force sync: pull then push
  // ─────────────────────────────────────────────────────────────────

  async forceSync(projectId: number): Promise<SyncForceResult> {
    const pullResult = await this.pull(projectId)
    if (!pullResult.ok && pullResult.error !== 'no_changes') {
      return {
        ok: false,
        pulled: 0,
        pushed: 0,
        conflicts: pullResult.conflicts,
        error: pullResult.error,
      }
    }

    const pushResult = await this.push(projectId)

    return {
      ok: pushResult.ok,
      pulled: pullResult.pulled,
      pushed: pushResult.pushed,
      conflicts: pullResult.conflicts + (pushResult.ok ? 0 : 0),
      error: pushResult.error,
    }
  }

  // ─────────────────────────────────────────────────────────────────
  // Conflict resolution
  // ─────────────────────────────────────────────────────────────────

  async resolveConflict(
    conflictId: string,
    resolution: ConflictResolution,
  ): Promise<SyncResolveConflictResult> {
    const conflicts = await this.storage.listConflicts()
    const conflict = conflicts.find((c) => c.id === conflictId)

    if (!conflict) {
      return { ok: false, resolution, entityId: '', error: 'conflict_not_found' }
    }

    try {
      switch (resolution) {
        case 'keep-local': {
          // Enqueue local version to overwrite remote on next push
          await this.storage.enqueueSyncOperation({
            projectId: conflict.projectId,
            entity: conflict.entityType,
            entityId: conflict.entityId,
            op: 'update',
            payload: conflict.localVersion.document,
          })
          break
        }

        case 'keep-remote': {
          // Replace local with remote version
          const remoteDoc = conflict.remoteVersion.document
          await this.storage.saveTemplate(conflict.projectId, {
            ...remoteDoc,
            id: conflict.entityId,
            meta: { ...remoteDoc.meta, isDirty: false },
          })
          break
        }

        case 'duplicate-local': {
          // Create a copy of local with new ID, keep remote as primary
          const localCopy: KonvaTemplateDocument = {
            ...conflict.localVersion.document,
            id: randomUUID(),
            name: `${conflict.localVersion.document.name} (copia local)`,
            meta: {
              ...conflict.localVersion.document.meta,
              isDirty: true,
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
            },
          }
          await this.storage.saveTemplate(conflict.projectId, localCopy)

          // Replace original with remote
          const remoteDoc = conflict.remoteVersion.document
          await this.storage.saveTemplate(conflict.projectId, {
            ...remoteDoc,
            id: conflict.entityId,
            meta: { ...remoteDoc.meta, isDirty: false },
          })
          break
        }
      }

      // Mark conflict as resolved and remove
      await this.storage.resolveConflict(conflictId, resolution)
      await this.storage.removeConflict(conflictId)

      // Update sync state
      const remainingConflicts = await this.storage.getConflictCount(conflict.projectId)
      if (remainingConflicts === 0) {
        await this.storage.setSyncState(conflict.projectId, 'idle')
      }

      return { ok: true, resolution, entityId: conflict.entityId }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'resolve_failed'
      return { ok: false, resolution, entityId: conflict.entityId, error: errorMsg }
    }
  }

  // ─────────────────────────────────────────────────────────────────
  // Private helpers
  // ─────────────────────────────────────────────────────────────────

  private async fetchRemoteTemplates(projectId: number): Promise<RemoteTemplateMetadata[]> {
    const endpoint = `${this.deps.webAppBaseUrl}/api/projects/${projectId}/templates?includeDesign=true`

    let cookies = await this.deps.getFreshCookies()
    let result = await this.deps.executeRequest(endpoint, { method: 'GET' }, cookies)

    // Retry with refreshed session if auth failed
    if (result.isHtml && this.deps.isAuthHtmlResponse(result)) {
      const refreshed = await this.deps.refreshClerkSession()
      if (refreshed) {
        cookies = await this.deps.getFreshCookies()
        result = await this.deps.executeRequest(endpoint, { method: 'GET' }, cookies)
      }
    }

    if (result.isHtml && this.deps.isAuthHtmlResponse(result)) {
      throw new Error('auth_expired')
    }

    if (!result.ok) {
      throw new Error(`fetch_failed_${result.status}`)
    }

    let parsed: unknown
    try {
      parsed = JSON.parse(result.text)
    } catch {
      throw new Error('invalid_response')
    }

    if (!Array.isArray(parsed)) {
      throw new Error('invalid_response_format')
    }

    console.log(`[SyncService] Fetched ${parsed.length} templates from server`)

    // Log first template to debug structure
    if (parsed.length > 0) {
      const first = parsed[0]
      console.log(`[SyncService] First template sample:`, {
        id: first.id,
        name: first.name,
        localId: first.localId,
        hasDesignData: !!first.designData,
        designDataKeys: first.designData ? Object.keys(first.designData) : [],
        pagesCount: first.designData?.pages?.length ?? 0,
      })
    }

    return parsed.map((item) => this.normalizeRemoteTemplate(item))
  }

  private normalizeRemoteTemplate(raw: unknown): RemoteTemplateMetadata {
    const obj = asObject(raw)
    return {
      id: Number(obj.id) || 0,
      localId: typeof obj.localId === 'string' ? obj.localId : undefined,
      name: typeof obj.name === 'string' ? obj.name : 'Sem nome',
      updatedAt: typeof obj.updatedAt === 'string' ? obj.updatedAt : new Date().toISOString(),
      hash: typeof obj.hash === 'string' ? obj.hash : undefined,
      designData: obj.designData,
    }
  }

  private remoteToLocal(
    projectId: number,
    remote: RemoteTemplateMetadata,
    existingId?: string,
  ): KonvaTemplateDocument {
    // Use the centralized normalizer for web → local conversion
    const result = normalizeForLocal(
      {
        id: remote.id,
        name: remote.name,
        type: this.extractRemoteType(remote),
        updatedAt: remote.updatedAt,
        designData: remote.designData,
        localId: remote.localId,
      },
      projectId,
      existingId
    )

    if (!result.success) {
      console.error('[SyncService] Normalization failed:', result.errors)
      // Fall back to basic conversion on error
      return this.remoteToLocalFallback(projectId, remote, existingId)
    }

    // Log warnings for debugging
    if (result.warnings.length > 0) {
      logNormalizationWarnings('pull', remote.localId ?? String(remote.id), result.warnings)
    }

    return result.data
  }

  private extractRemoteType(remote: RemoteTemplateMetadata): string {
    const designData = asObject(remote.designData)
    // Try to extract type from various possible locations
    if (typeof designData.type === 'string') return designData.type
    const canvas = asObject(designData.canvas)
    const width = Number(canvas.width) || 1080
    const height = Number(canvas.height) || 1920
    const ratio = width / height
    if (Math.abs(ratio - 1) < 0.1) return 'SQUARE'
    if (ratio < 1 && height / width > 1.3) return 'STORY'
    return 'FEED'
  }

  private remoteToLocalFallback(
    projectId: number,
    remote: RemoteTemplateMetadata,
    existingId?: string,
  ): KonvaTemplateDocument {
    // Legacy fallback for when normalization fails
    const designData = asObject(remote.designData)
    const canvas = asObject(designData.canvas)
    const pages = Array.isArray(designData.pages) ? designData.pages : []

    const konvaPages = pages.map((page, index) => {
      const pageObj = asObject(page)
      return {
        id: typeof pageObj.id === 'string' ? pageObj.id : randomUUID(),
        name: typeof pageObj.name === 'string' ? pageObj.name : `Pagina ${index + 1}`,
        width: Number(pageObj.width) || Number(canvas.width) || 1080,
        height: Number(pageObj.height) || Number(canvas.height) || 1920,
        background: typeof pageObj.background === 'string' ? pageObj.background : '#ffffff',
        order: index,
        layers: Array.isArray(pageObj.layers) ? pageObj.layers : [],
      }
    })

    if (konvaPages.length === 0) {
      konvaPages.push({
        id: randomUUID(),
        name: 'Pagina 1',
        width: Number(canvas.width) || 1080,
        height: Number(canvas.height) || 1920,
        background: typeof canvas.backgroundColor === 'string' ? canvas.backgroundColor : '#ffffff',
        order: 0,
        layers: [],
      })
    }

    const format = this.detectFormat(konvaPages[0].width, konvaPages[0].height)

    return {
      schemaVersion: 2,
      id: existingId ?? randomUUID(),
      projectId,
      engine: 'KONVA',
      name: remote.name,
      format,
      source: 'synced',
      design: {
        pages: konvaPages,
        currentPageId: konvaPages[0].id,
      },
      identity: {
        colors: [],
        fonts: [],
      },
      slots: [],
      meta: {
        createdAt: new Date().toISOString(),
        updatedAt: remote.updatedAt,
        syncedAt: new Date().toISOString(),
        isDirty: false,
        remoteId: remote.id,
      },
    }
  }

  private detectFormat(width: number, height: number): 'STORY' | 'FEED_PORTRAIT' | 'SQUARE' {
    const ratio = width / height
    if (Math.abs(ratio - 1) < 0.1) return 'SQUARE'
    if (ratio < 1 && height / width > 1.3) return 'STORY'
    return 'FEED_PORTRAIT'
  }

  private async pushOperation(op: SyncQueueItem): Promise<boolean> {
    if (op.entity !== 'template') {
      // For now, only templates are synced
      return true
    }

    // For update/delete, we need the remoteId (numeric ID from server)
    const remoteId = op.payload?.meta?.remoteId
    if ((op.op === 'update' || op.op === 'delete') && !remoteId) {
      // No remoteId means this was never synced - convert update to create
      if (op.op === 'update') {
        op = { ...op, op: 'create' }
      } else {
        // Can't delete something that doesn't exist on server
        return true
      }
    }

    // Skip operations without valid payload for create/update
    if (op.op !== 'delete' && !op.payload) {
      console.warn('[SyncService] Skipping operation without payload:', op.operationId)
      return true // Return true to remove from queue
    }

    const endpoint = this.getEndpointForOperation(op, remoteId)
    const method = this.getMethodForOperation(op)
    const payload = op.op === 'delete' ? null : this.localToRemotePayload(op)
    const body = payload ? JSON.stringify(payload) : undefined

    console.log(`[SyncService] Push ${op.op} to ${endpoint}`)

    let cookies = await this.deps.getFreshCookies()
    let result = await this.deps.executeRequest(
      endpoint,
      { method, body, headers: { 'Content-Type': 'application/json' } },
      cookies,
    )

    // Retry with refreshed session if auth failed
    if (result.isHtml && this.deps.isAuthHtmlResponse(result)) {
      const refreshed = await this.deps.refreshClerkSession()
      if (refreshed) {
        cookies = await this.deps.getFreshCookies()
        result = await this.deps.executeRequest(
          endpoint,
          { method, body, headers: { 'Content-Type': 'application/json' } },
          cookies,
        )
      }
    }

    if (result.isHtml && this.deps.isAuthHtmlResponse(result)) {
      throw new Error('auth_expired')
    }

    // Log failures for debugging
    if (!result.ok) {
      console.error(`[SyncService] Push failed: ${result.status} ${result.statusText}`)
      console.error('[SyncService] Response:', result.text.slice(0, 500))
    }

    // On successful create, save the remoteId to local template
    if (result.ok && op.op === 'create') {
      try {
        const responseData = JSON.parse(result.text)
        const newRemoteId = responseData?.id
        if (typeof newRemoteId === 'number' && op.payload) {
          const template = await this.storage.getTemplate(op.projectId, op.entityId)
          if (template) {
            await this.storage.saveTemplate(op.projectId, {
              ...template,
              meta: { ...template.meta, remoteId: newRemoteId },
            })
          }
        }
      } catch {
        // Failed to parse response, but operation was successful
        console.warn('[SyncService] Could not save remoteId after create')
      }
    }

    return result.ok
  }

  private getEndpointForOperation(op: SyncQueueItem, remoteId?: number): string {
    const base = `${this.deps.webAppBaseUrl}/api/templates`
    if (op.op === 'create') return base
    // For update/delete, use the numeric remoteId
    return `${base}/${remoteId}`
  }

  private getMethodForOperation(op: SyncQueueItem): string {
    switch (op.op) {
      case 'create':
        return 'POST'
      case 'update':
        return 'PUT'
      case 'delete':
        return 'DELETE'
      default:
        return 'POST'
    }
  }

  private localToRemotePayload(op: SyncQueueItem): Record<string, unknown> {
    if (!op.payload) {
      console.warn('[SyncService] localToRemotePayload: no payload')
      return {}
    }

    const doc = op.payload

    // Use the centralized normalizer for local → web conversion
    const result = normalizeForWeb(doc)

    if (!result.success) {
      console.error('[SyncService] Normalization failed:', result.errors)
      // Fall back to basic conversion on error
      return this.localToRemotePayloadFallback(op)
    }

    // Log warnings for debugging
    if (result.warnings.length > 0) {
      logNormalizationWarnings('push', doc.id, result.warnings)
    }

    // Validate the payload before sending
    const validation = validateWebPayload(result.data)
    if (!validation.valid) {
      console.warn('[SyncService] Web payload validation warnings:', validation.errors)
      // Continue anyway, the server will validate
    }

    console.log('[SyncService] Push payload (normalized):', {
      name: result.data.name,
      type: result.data.type,
      dimensions: result.data.dimensions,
      projectId: result.data.projectId,
      hasDesignData: !!result.data.designData,
      pagesCount: result.data.designData.pages.length,
      warnings: result.warnings.length,
    })

    return result.data as unknown as Record<string, unknown>
  }

  private localToRemotePayloadFallback(op: SyncQueueItem): Record<string, unknown> {
    // Legacy fallback for when normalization fails
    const doc = op.payload!
    const firstPage = doc.design?.pages?.[0]

    const name = doc.name || 'Template sem nome'
    const type = doc.format === 'FEED_PORTRAIT' ? 'FEED' : doc.format || 'STORY'
    const width = firstPage?.width ?? 1080
    const height = firstPage?.height ?? 1920
    const projectId = doc.projectId ?? op.projectId

    const payload = {
      name,
      type,
      dimensions: `${width}x${height}`,
      designData: {
        canvas: {
          width,
          height,
          backgroundColor: firstPage?.background ?? '#ffffff',
        },
        pages: doc.design?.pages ?? [],
      },
      localId: doc.id,
      projectId,
    }

    console.log('[SyncService] Push payload (fallback):', {
      name: payload.name,
      type: payload.type,
      dimensions: payload.dimensions,
      projectId: payload.projectId,
      hasDesignData: !!payload.designData,
      pagesCount: payload.designData.pages.length,
    })

    return payload
  }
}
