import { ipcMain } from 'electron'

import {
  KONVA_CHANNELS,
  type ConflictResolution,
  type SyncConflict,
  type SyncForceResult,
  type SyncPullResult,
  type SyncPushResult,
  type SyncQueueItem,
  type SyncResolveConflictResult,
  type SyncStatus,
} from './konva-ipc-types'
import { JsonStorageService } from '../services/json-storage'
import { SyncService, type SyncServiceDeps } from '../services/sync-service'

type SyncHandlerResult =
  | SyncPullResult
  | SyncPushResult
  | SyncStatus
  | SyncForceResult
  | SyncResolveConflictResult
  | SyncConflict[]
  | SyncQueueItem[]
  | { ok: boolean; error?: string }

function parseProjectId(value: unknown): number {
  const parsed = Number(value)
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error('projectId invalido')
  }
  return parsed
}

function handleSyncError(action: string, error: unknown): never {
  console.error(`[Konva Sync IPC] ${action} falhou:`, error)
  throw error instanceof Error ? error : new Error(`${action} falhou`)
}

function registerSyncHandler(
  channel: string,
  handler: (...args: unknown[]) => Promise<SyncHandlerResult>,
): void {
  ipcMain.removeHandler(channel)
  ipcMain.handle(channel, handler)
}

export function registerSyncHandlers(
  storage: JsonStorageService,
  deps: SyncServiceDeps,
): SyncService {
  const syncService = new SyncService(storage, deps)

  // ─────────────────────────────────────────────────────────────────
  // Sync Status
  // ─────────────────────────────────────────────────────────────────

  registerSyncHandler(KONVA_CHANNELS.SYNC_STATUS, async (_event, rawProjectId: unknown) => {
    try {
      const projectId = parseProjectId(rawProjectId)
      return await storage.getSyncStatus(projectId)
    } catch (error) {
      return handleSyncError('status', error)
    }
  })

  // ─────────────────────────────────────────────────────────────────
  // Pull (fetch remote and detect conflicts)
  // ─────────────────────────────────────────────────────────────────

  registerSyncHandler(KONVA_CHANNELS.SYNC_PULL, async (_event, rawProjectId: unknown) => {
    try {
      const projectId = parseProjectId(rawProjectId)
      return await syncService.pull(projectId)
    } catch (error) {
      return handleSyncError('pull', error)
    }
  })

  // ─────────────────────────────────────────────────────────────────
  // Push (send local changes to server)
  // ─────────────────────────────────────────────────────────────────

  registerSyncHandler(KONVA_CHANNELS.SYNC_PUSH, async (_event, rawProjectId: unknown) => {
    try {
      const projectId = parseProjectId(rawProjectId)
      return await syncService.push(projectId)
    } catch (error) {
      return handleSyncError('push', error)
    }
  })

  // ─────────────────────────────────────────────────────────────────
  // Force Sync (pull + push)
  // ─────────────────────────────────────────────────────────────────

  registerSyncHandler(KONVA_CHANNELS.SYNC_FORCE, async (_event, rawProjectId: unknown) => {
    try {
      const projectId = parseProjectId(rawProjectId)
      return await syncService.forceSync(projectId)
    } catch (error) {
      return handleSyncError('force-sync', error)
    }
  })

  // ─────────────────────────────────────────────────────────────────
  // Resolve Conflict
  // ─────────────────────────────────────────────────────────────────

  registerSyncHandler(
    KONVA_CHANNELS.SYNC_RESOLVE_CONFLICT,
    async (_event, conflictId: unknown, resolution: unknown) => {
      try {
        if (typeof conflictId !== 'string' || !conflictId) {
          throw new Error('conflictId invalido')
        }

        const validResolutions: ConflictResolution[] = ['keep-local', 'keep-remote', 'duplicate-local']
        if (!validResolutions.includes(resolution as ConflictResolution)) {
          throw new Error('resolution invalida')
        }

        return await syncService.resolveConflict(conflictId, resolution as ConflictResolution)
      } catch (error) {
        return handleSyncError('resolve-conflict', error)
      }
    },
  )

  // ─────────────────────────────────────────────────────────────────
  // List Conflicts
  // ─────────────────────────────────────────────────────────────────

  registerSyncHandler(
    KONVA_CHANNELS.SYNC_LIST_CONFLICTS,
    async (_event, rawProjectId: unknown) => {
      try {
        const projectId = rawProjectId === undefined ? undefined : parseProjectId(rawProjectId)
        return await storage.listConflicts(projectId)
      } catch (error) {
        return handleSyncError('list-conflicts', error)
      }
    },
  )

  // ─────────────────────────────────────────────────────────────────
  // List Sync Queue
  // ─────────────────────────────────────────────────────────────────

  registerSyncHandler(
    KONVA_CHANNELS.SYNC_QUEUE_LIST,
    async (_event, rawProjectId: unknown) => {
      try {
        const projectId = rawProjectId === undefined ? undefined : parseProjectId(rawProjectId)
        return await storage.listSyncQueue(projectId)
      } catch (error) {
        return handleSyncError('queue-list', error)
      }
    },
  )

  // ─────────────────────────────────────────────────────────────────
  // Clear Sync Queue
  // ─────────────────────────────────────────────────────────────────

  registerSyncHandler(
    KONVA_CHANNELS.SYNC_QUEUE_CLEAR,
    async (_event, rawProjectId: unknown) => {
      try {
        const projectId = rawProjectId === undefined ? undefined : parseProjectId(rawProjectId)
        await storage.clearSyncQueue(projectId)
        return { ok: true }
      } catch (error) {
        return handleSyncError('queue-clear', error)
      }
    },
  )

  console.info('[Konva Sync IPC] Handlers registrados')

  return syncService
}
