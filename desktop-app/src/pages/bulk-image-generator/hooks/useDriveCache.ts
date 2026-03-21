import { useState, useCallback, useEffect } from 'react'
import { api } from '@/lib/api-client'
import { QUEUE_CONSTANTS, type DriveFile, type DriveFolderCache } from '@/lib/queue/types'
import { formatDistanceToNow } from 'date-fns'
import { ptBR } from 'date-fns/locale'

interface DriveListResponse {
  items: DriveFile[]
  nextPageToken?: string
  currentFolderId: string
  folderName?: string
}

interface UseDriveCacheOptions {
  projectId?: number
}

interface UseDriveCacheReturn {
  // State
  isRefreshing: boolean
  lastRefreshedAt: string | null
  lastRefreshedLabel: string | null

  // Methods
  getFolder: (folderId: string) => Promise<DriveFile[]>
  refreshFolder: (folderId: string) => Promise<DriveFile[]>
  invalidateFolder: (folderId: string) => void
  invalidateAll: () => void
  isCacheValid: (folderId: string) => boolean
  getCachedFolder: (folderId: string) => DriveFile[] | null
}

export function useDriveCache(options: UseDriveCacheOptions = {}): UseDriveCacheReturn {
  const { projectId } = options

  const [cache, setCache] = useState<Map<string, DriveFolderCache>>(new Map())
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [lastRefreshedAt, setLastRefreshedAt] = useState<string | null>(null)

  // Load cache from localStorage on mount
  useEffect(() => {
    try {
      const stored = localStorage.getItem('drive-picker-cache')
      if (stored) {
        const parsed = JSON.parse(stored) as Record<string, DriveFolderCache>
        const now = Date.now()

        // Filter out expired entries
        const validEntries = Object.entries(parsed).filter(
          ([, entry]) => new Date(entry.expiresAt).getTime() > now
        )

        if (validEntries.length > 0) {
          setCache(new Map(validEntries))
        }
      }
    } catch {
      // Ignore parse errors
    }
  }, [])

  // Persist cache to localStorage when it changes
  useEffect(() => {
    if (cache.size > 0) {
      const obj = Object.fromEntries(cache)
      localStorage.setItem('drive-picker-cache', JSON.stringify(obj))
    }
  }, [cache])

  const isCacheValid = useCallback(
    (folderId: string): boolean => {
      const cached = cache.get(folderId)
      if (!cached) return false
      return new Date(cached.expiresAt).getTime() > Date.now()
    },
    [cache]
  )

  const getCachedFolder = useCallback(
    (folderId: string): DriveFile[] | null => {
      if (!isCacheValid(folderId)) return null
      return cache.get(folderId)?.files ?? null
    },
    [cache, isCacheValid]
  )

  const fetchFolder = useCallback(
    async (folderId: string): Promise<DriveFile[]> => {
      if (!projectId) {
        throw new Error('Projeto nao selecionado')
      }

      const params = new URLSearchParams({
        projectId: String(projectId),
        folder: 'images',
        folderId,
      })

      const response = await api.get<DriveListResponse>(
        `/api/drive/list?${params}`
      )

      return response.items
    },
    [projectId]
  )

  const refreshFolder = useCallback(
    async (folderId: string): Promise<DriveFile[]> => {
      setIsRefreshing(true)

      try {
        const files = await fetchFolder(folderId)
        const now = new Date()
        const expiresAt = new Date(now.getTime() + QUEUE_CONSTANTS.CACHE_TTL_MS)

        const cacheEntry: DriveFolderCache = {
          folderId,
          files,
          cachedAt: now.toISOString(),
          expiresAt: expiresAt.toISOString(),
        }

        setCache((prev) => new Map(prev).set(folderId, cacheEntry))
        setLastRefreshedAt(now.toISOString())

        return files
      } finally {
        setIsRefreshing(false)
      }
    },
    [fetchFolder]
  )

  const getFolder = useCallback(
    async (folderId: string): Promise<DriveFile[]> => {
      const cached = getCachedFolder(folderId)
      if (cached) {
        return cached
      }

      return refreshFolder(folderId)
    },
    [getCachedFolder, refreshFolder]
  )

  const invalidateFolder = useCallback((folderId: string) => {
    setCache((prev) => {
      const next = new Map(prev)
      next.delete(folderId)
      return next
    })
  }, [])

  const invalidateAll = useCallback(() => {
    setCache(new Map())
    localStorage.removeItem('drive-picker-cache')
  }, [])

  const lastRefreshedLabel = lastRefreshedAt
    ? `ha ${formatDistanceToNow(new Date(lastRefreshedAt), { locale: ptBR })}`
    : null

  return {
    isRefreshing,
    lastRefreshedAt,
    lastRefreshedLabel,
    getFolder,
    refreshFolder,
    invalidateFolder,
    invalidateAll,
    isCacheValid,
    getCachedFolder,
  }
}
