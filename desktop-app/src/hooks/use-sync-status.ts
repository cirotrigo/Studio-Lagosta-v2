import { useCallback, useEffect, useRef } from 'react'
import { useProjectStore } from '@/stores/project.store'
import {
  useSyncStore,
  useSyncStatus as useSyncStatusStore,
  useIsOnline,
  useIsSyncing,
  useHasConflicts,
  useSyncConflicts,
  type SyncState,
  type ConflictResolution,
} from '@/stores/sync.store'

const POLL_INTERVAL_MS = 30_000 // 30 seconds
const OFFLINE_CHECK_INTERVAL_MS = 5_000 // 5 seconds when offline

export interface UseSyncStatusResult {
  state: SyncState
  isOnline: boolean
  isSyncing: boolean
  pending: number
  conflictCount: number
  hasConflicts: boolean
  lastSyncAt: string | undefined
  lastError: string | undefined

  // Actions
  sync: () => Promise<void>
  pull: () => Promise<void>
  push: () => Promise<void>
  resolveConflict: (conflictId: string, resolution: ConflictResolution) => Promise<boolean>
  openConflictDialog: () => void
}

export function useSyncStatus(): UseSyncStatusResult {
  const currentProject = useProjectStore((state) => state.currentProject)
  const projectId = currentProject?.id

  const status = useSyncStatusStore(projectId)
  const isOnline = useIsOnline()
  const isSyncing = useIsSyncing()
  const hasConflicts = useHasConflicts()
  const conflicts = useSyncConflicts()

  const refreshStatus = useSyncStore((state) => state.refreshStatus)
  const triggerForceSync = useSyncStore((state) => state.triggerForceSync)
  const triggerPull = useSyncStore((state) => state.triggerPull)
  const triggerPush = useSyncStore((state) => state.triggerPush)
  const resolveConflictAction = useSyncStore((state) => state.resolveConflict)
  const loadConflicts = useSyncStore((state) => state.loadConflicts)
  const openConflictDialogAction = useSyncStore((state) => state.openConflictDialog)

  const pollIntervalRef = useRef<NodeJS.Timeout | null>(null)

  // Poll for status updates
  useEffect(() => {
    if (!projectId) return

    // Initial fetch
    refreshStatus(projectId)
    loadConflicts(projectId)

    // Setup polling
    const interval = isOnline ? POLL_INTERVAL_MS : OFFLINE_CHECK_INTERVAL_MS
    pollIntervalRef.current = setInterval(() => {
      refreshStatus(projectId)
    }, interval)

    return () => {
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current)
      }
    }
  }, [projectId, isOnline, refreshStatus, loadConflicts])

  // Handle online/offline events
  useEffect(() => {
    const handleOnline = () => {
      useSyncStore.getState().setOnline(true)
      if (projectId) {
        refreshStatus(projectId)
      }
    }

    const handleOffline = () => {
      useSyncStore.getState().setOnline(false)
    }

    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)

    // Check initial state
    if (!navigator.onLine) {
      handleOffline()
    }

    return () => {
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
    }
  }, [projectId, refreshStatus])

  const sync = useCallback(async () => {
    if (!projectId) return
    await triggerForceSync(projectId)
  }, [projectId, triggerForceSync])

  const pull = useCallback(async () => {
    if (!projectId) return
    await triggerPull(projectId)
  }, [projectId, triggerPull])

  const push = useCallback(async () => {
    if (!projectId) return
    await triggerPush(projectId)
  }, [projectId, triggerPush])

  const resolveConflict = useCallback(
    async (conflictId: string, resolution: ConflictResolution) => {
      return resolveConflictAction(conflictId, resolution)
    },
    [resolveConflictAction],
  )

  const openConflictDialog = useCallback(() => {
    const firstConflict = conflicts[0]
    if (firstConflict) {
      openConflictDialogAction(firstConflict)
    }
  }, [conflicts, openConflictDialogAction])

  return {
    state: status?.state ?? (isOnline ? 'idle' : 'offline'),
    isOnline,
    isSyncing,
    pending: status?.pending ?? 0,
    conflictCount: status?.conflictCount ?? conflicts.length,
    hasConflicts,
    lastSyncAt: status?.lastSyncAt,
    lastError: status?.lastError,
    sync,
    pull,
    push,
    resolveConflict,
    openConflictDialog,
  }
}

// Hook for watching network status
export function useNetworkStatus(): boolean {
  const isOnline = useIsOnline()

  useEffect(() => {
    const handleOnline = () => useSyncStore.getState().setOnline(true)
    const handleOffline = () => useSyncStore.getState().setOnline(false)

    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)

    // Check initial state
    useSyncStore.getState().setOnline(navigator.onLine)

    return () => {
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
    }
  }, [])

  return isOnline
}
