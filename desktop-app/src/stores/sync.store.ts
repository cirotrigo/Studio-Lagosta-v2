import { create } from 'zustand'

export type SyncState = 'idle' | 'offline' | 'syncing' | 'conflict' | 'error'
export type ConflictResolution = 'keep-local' | 'keep-remote' | 'duplicate-local'

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
  entityType: 'template' | 'generation' | 'settings'
  entityId: string
  localVersion: {
    updatedAt: string
    hash: string
    document: unknown
  }
  remoteVersion: {
    updatedAt: string
    hash: string
    document: unknown
  }
  detectedAt: string
  resolution?: ConflictResolution
  resolvedAt?: string
}

export interface SyncQueueItem {
  operationId: string
  projectId: number
  entity: 'template' | 'generation' | 'settings'
  entityId: string
  op: 'create' | 'update' | 'delete'
  queuedAt: string
  retryCount: number
  lastError?: string
}

interface SyncStoreState {
  // Status per project
  statusByProject: Record<number, SyncStatus>

  // Global state
  isOnline: boolean
  isSyncing: boolean

  // Conflicts
  conflicts: SyncConflict[]

  // Queue
  queue: SyncQueueItem[]

  // UI state
  showConflictDialog: boolean
  selectedConflict: SyncConflict | null

  // Actions
  setStatus: (projectId: number, status: SyncStatus) => void
  setOnline: (online: boolean) => void
  setSyncing: (syncing: boolean) => void
  setConflicts: (conflicts: SyncConflict[]) => void
  addConflict: (conflict: SyncConflict) => void
  removeConflict: (conflictId: string) => void
  setQueue: (queue: SyncQueueItem[]) => void
  openConflictDialog: (conflict: SyncConflict) => void
  closeConflictDialog: () => void

  // Async actions (call Electron IPC)
  refreshStatus: (projectId: number) => Promise<void>
  triggerPull: (projectId: number) => Promise<void>
  triggerPush: (projectId: number) => Promise<void>
  triggerForceSync: (projectId: number) => Promise<void>
  resolveConflict: (conflictId: string, resolution: ConflictResolution) => Promise<boolean>
  loadConflicts: (projectId?: number) => Promise<void>
  loadQueue: (projectId?: number) => Promise<void>
}

const getElectronAPI = () => {
  if (typeof window !== 'undefined' && window.electronAPI) {
    return window.electronAPI
  }
  return null
}

export const useSyncStore = create<SyncStoreState>((set, get) => ({
  statusByProject: {},
  isOnline: true,
  isSyncing: false,
  conflicts: [],
  queue: [],
  showConflictDialog: false,
  selectedConflict: null,

  setStatus: (projectId, status) => {
    set((state) => ({
      statusByProject: {
        ...state.statusByProject,
        [projectId]: status,
      },
    }))
  },

  setOnline: (online) => set({ isOnline: online }),
  setSyncing: (syncing) => set({ isSyncing: syncing }),
  setConflicts: (conflicts) => set({ conflicts }),

  addConflict: (conflict) => {
    set((state) => ({
      conflicts: [...state.conflicts.filter((c) => c.id !== conflict.id), conflict],
    }))
  },

  removeConflict: (conflictId) => {
    set((state) => ({
      conflicts: state.conflicts.filter((c) => c.id !== conflictId),
      selectedConflict: state.selectedConflict?.id === conflictId ? null : state.selectedConflict,
    }))
  },

  setQueue: (queue) => set({ queue }),

  openConflictDialog: (conflict) => set({ showConflictDialog: true, selectedConflict: conflict }),
  closeConflictDialog: () => set({ showConflictDialog: false, selectedConflict: null }),

  // Async actions
  refreshStatus: async (projectId) => {
    const api = getElectronAPI()
    if (!api) return

    try {
      const status = await api.konvaSync.status(projectId)
      get().setStatus(projectId, status)

      // Update online state based on status
      if (status.state === 'offline') {
        set({ isOnline: false })
      }
    } catch (error) {
      console.error('[SyncStore] Failed to refresh status:', error)
    }
  },

  triggerPull: async (projectId) => {
    const api = getElectronAPI()
    if (!api) return

    set({ isSyncing: true })
    try {
      const result = await api.konvaSync.pull(projectId)
      if (result.ok) {
        await get().refreshStatus(projectId)
        if (result.conflicts > 0) {
          await get().loadConflicts(projectId)
        }
      } else if (result.error === 'offline') {
        set({ isOnline: false })
      }
    } catch (error) {
      console.error('[SyncStore] Pull failed:', error)
    } finally {
      set({ isSyncing: false })
    }
  },

  triggerPush: async (projectId) => {
    const api = getElectronAPI()
    if (!api) return

    set({ isSyncing: true })
    try {
      const result = await api.konvaSync.push(projectId)
      if (result.ok) {
        await get().refreshStatus(projectId)
      } else if (result.error === 'offline') {
        set({ isOnline: false })
      }
    } catch (error) {
      console.error('[SyncStore] Push failed:', error)
    } finally {
      set({ isSyncing: false })
    }
  },

  triggerForceSync: async (projectId) => {
    const api = getElectronAPI()
    if (!api) return

    set({ isSyncing: true })
    try {
      const result = await api.konvaSync.force(projectId)
      if (result.ok || result.conflicts > 0) {
        await get().refreshStatus(projectId)
        if (result.conflicts > 0) {
          await get().loadConflicts(projectId)
        }
      } else if (result.error === 'offline') {
        set({ isOnline: false })
      }
    } catch (error) {
      console.error('[SyncStore] Force sync failed:', error)
    } finally {
      set({ isSyncing: false })
    }
  },

  resolveConflict: async (conflictId, resolution) => {
    const api = getElectronAPI()
    if (!api) return false

    try {
      const result = await api.konvaSync.resolveConflict(conflictId, resolution)
      if (result.ok) {
        get().removeConflict(conflictId)
        return true
      }
      return false
    } catch (error) {
      console.error('[SyncStore] Resolve conflict failed:', error)
      return false
    }
  },

  loadConflicts: async (projectId) => {
    const api = getElectronAPI()
    if (!api) return

    try {
      const conflicts = await api.konvaSync.listConflicts(projectId)
      set({ conflicts })
    } catch (error) {
      console.error('[SyncStore] Load conflicts failed:', error)
    }
  },

  loadQueue: async (projectId) => {
    const api = getElectronAPI()
    if (!api) return

    try {
      const queue = await api.konvaSync.listQueue(projectId)
      set({ queue })
    } catch (error) {
      console.error('[SyncStore] Load queue failed:', error)
    }
  },
}))

// Selectors
export const useSyncStatus = (projectId: number | undefined) =>
  useSyncStore((state) => (projectId ? state.statusByProject[projectId] : undefined))

export const useIsOnline = () => useSyncStore((state) => state.isOnline)
export const useIsSyncing = () => useSyncStore((state) => state.isSyncing)
export const useSyncConflicts = () => useSyncStore((state) => state.conflicts)
export const useSyncQueue = () => useSyncStore((state) => state.queue)
export const useHasConflicts = () => useSyncStore((state) => state.conflicts.length > 0)
export const useShowConflictDialog = () => useSyncStore((state) => state.showConflictDialog)
export const useSelectedConflict = () => useSyncStore((state) => state.selectedConflict)
