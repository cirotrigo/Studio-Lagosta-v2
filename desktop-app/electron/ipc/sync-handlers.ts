import { ipcMain } from 'electron'

import {
  KONVA_CHANNELS,
  type SyncPullResult,
  type SyncPushResult,
  type SyncStatus,
} from './konva-ipc-types'
import { JsonStorageService } from '../services/json-storage'

type SyncHandlerResult = SyncPullResult | SyncPushResult | SyncStatus

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
  channel:
    | typeof KONVA_CHANNELS.SYNC_PULL
    | typeof KONVA_CHANNELS.SYNC_PUSH
    | typeof KONVA_CHANNELS.SYNC_STATUS,
  handler: (...args: any[]) => Promise<SyncHandlerResult>,
): void {
  ipcMain.removeHandler(channel)
  ipcMain.handle(channel, handler)
}

export function registerSyncHandlers(storage: JsonStorageService): void {
  registerSyncHandler(KONVA_CHANNELS.SYNC_STATUS, async (_event, rawProjectId: unknown) => {
    try {
      const projectId = parseProjectId(rawProjectId)
      return await storage.getSyncStatus(projectId)
    } catch (error) {
      return handleSyncError('status', error)
    }
  })

  registerSyncHandler(KONVA_CHANNELS.SYNC_PULL, async (_event, rawProjectId: unknown) => {
    try {
      const projectId = parseProjectId(rawProjectId)
      const updatedAt = new Date().toISOString()
      await storage.setLastSync(projectId, updatedAt)
      return {
        ok: true,
        pulled: 0,
        conflicts: 0,
        updatedAt,
      }
    } catch (error) {
      return handleSyncError('pull', error)
    }
  })

  registerSyncHandler(KONVA_CHANNELS.SYNC_PUSH, async (_event, rawProjectId: unknown) => {
    try {
      const projectId = parseProjectId(rawProjectId)
      const pending = await storage.getPendingSyncCount(projectId)
      const updatedAt = new Date().toISOString()
      await storage.setLastSync(projectId, updatedAt)

      return {
        ok: true,
        pushed: 0,
        pending,
        updatedAt,
      }
    } catch (error) {
      return handleSyncError('push', error)
    }
  })

  console.info('[Konva Sync IPC] Handlers registrados')
}
