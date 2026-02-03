'use client'

import * as React from 'react'
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api, apiClient } from '@/lib/api-client'
import type { DriveFolderType, DriveListResponse, DriveDownloadResponse } from '@/types/drive'
import { useProjects } from '@/hooks/use-project'
import { useDriveStore } from '@/stores/drive-store'
import { downloadFolderAsZip } from '@/lib/zip-generator'
import type { FileToDownload } from '@/lib/zip-generator'
import { toast } from 'sonner'

export function useDriveFiles(
  projectId?: number | null,
  folderType: DriveFolderType = 'images',
  folderId?: string | null,
  search?: string,
) {
  return useInfiniteQuery<DriveListResponse>({
    queryKey: ['drive', 'files', projectId, folderType, folderId, search],
    enabled: Boolean(projectId),
    initialPageParam: undefined as string | undefined,
    queryFn: async ({ pageParam }) => {
      if (!projectId) {
        return Promise.reject(new Error('Projeto inválido'))
      }

      const params = new URLSearchParams({
        projectId: String(projectId),
        folder: folderType,
      })

      if (folderId) params.set('folderId', folderId)
      if (search) params.set('search', search)
      if (typeof pageParam === 'string' && pageParam.length > 0) {
        params.set('pageToken', pageParam)
      }

      return api.get<DriveListResponse>(`/api/drive/list?${params.toString()}`)
    },
    getNextPageParam: (lastPage) => lastPage.nextPageToken ?? undefined,
  })
}

export function useFolderBreadcrumbs(projectId?: number | null, folderId?: string | null) {
  return useQuery({
    queryKey: ['drive', 'breadcrumbs', projectId, folderId],
    enabled: Boolean(projectId && folderId),
    queryFn: async () => {
      if (!projectId || !folderId) return { breadcrumbs: [] }
      const params = new URLSearchParams({
        projectId: String(projectId),
        folderId,
      })
      return api.get<{ breadcrumbs: { id: string; name: string }[] }>(`/api/drive/breadcrumbs?${params.toString()}`)
    },
  })
}

export function useDriveProjects() {
  const projectsQuery = useProjects()
  const projectsWithDrive = React.useMemo(() => {
    return (
      projectsQuery.data?.filter((project) =>
        Boolean(
          project.googleDriveImagesFolderId ||
            project.googleDriveVideosFolderId ||
            project.googleDriveFolderId,
        ),
      ) ?? []
    )
  }, [projectsQuery.data])

  return {
    ...projectsQuery,
    data: projectsWithDrive,
  }
}

interface CreateFolderInput {
  name: string
  parentId?: string
  projectId: number
  folderType?: DriveFolderType
}

export function useCreateFolder() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: CreateFolderInput) => api.post('/api/drive/folders/create', input),
    onSuccess: (_result, variables) => {
      queryClient.invalidateQueries({ queryKey: ['drive', 'files', variables.projectId] })
    },
  })
}

interface MoveFilesInput {
  fileIds: string[]
  targetFolderId: string
  projectId: number
}

export function useMoveFiles() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: MoveFilesInput) => api.post('/api/drive/files/move', input),
    onSuccess: (_result, variables) => {
      queryClient.invalidateQueries({ queryKey: ['drive', 'files', variables.projectId] })
    },
  })
}

interface DeleteFilesInput {
  fileIds: string[]
  projectId: number
}

export function useDeleteFiles() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: DeleteFilesInput) =>
      apiClient('/api/drive/files/delete', {
        method: 'DELETE',
        body: JSON.stringify(input),
      }),
    onSuccess: (_result, variables) => {
      queryClient.invalidateQueries({ queryKey: ['drive', 'files', variables.projectId] })
    },
  })
}

interface UploadFilesInput {
  files: File[]
  folderId: string
  projectId: number
}

export function useUploadFiles() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ files, folderId, projectId }: UploadFilesInput) => {
      const formData = new FormData()
      formData.set('folderId', folderId)
      formData.set('projectId', String(projectId))
      files.forEach((file) => formData.append('files', file))

      const response = await fetch('/api/drive/files/upload', {
        method: 'POST',
        body: formData,
      })

      if (!response.ok) {
        const message = await response.text()
        throw new Error(message || 'Erro ao fazer upload')
      }

      return response.json()
    },
    onSuccess: (_result, variables) => {
      queryClient.invalidateQueries({ queryKey: ['drive', 'files', variables.projectId] })
    },
  })
}

export function useSelectedFiles() {
  const selectedFileSet = useDriveStore((state) => state.selectedFileIds)
  const selectFile = useDriveStore((state) => state.selectFile)
  const deselectFile = useDriveStore((state) => state.deselectFile)
  const toggleFile = useDriveStore((state) => state.toggleFile)
  const clearSelection = useDriveStore((state) => state.clearSelection)
  const selectAll = useDriveStore((state) => state.selectAll)

  return {
    selectedFileIds: React.useMemo(() => Array.from(selectedFileSet), [selectedFileSet]),
    hasSelection: selectedFileSet.size > 0,
    selectFile,
    deselectFile,
    toggleFile,
    clearSelection,
    selectAll,
  }
}

interface UploadImageToDriveInput {
  imageUrl: string
  folderId: string
  fileName?: string
}

interface UploadImageToDriveResult {
  success: boolean
  fileId: string
  publicUrl: string
  webViewLink: string | null
  webContentLink: string | null
  fileName: string
}

export function useUploadImageToDrive() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (input: UploadImageToDriveInput): Promise<UploadImageToDriveResult> => {
      const response = await fetch('/api/drive/upload-image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
      })

      if (!response.ok) {
        const data = await response.json().catch(() => ({}))
        throw new Error(data.error || 'Erro ao enviar imagem para o Drive')
      }

      return response.json()
    },
    onSuccess: () => {
      // Invalidate all drive queries to refresh the file list
      queryClient.invalidateQueries({ queryKey: ['drive', 'files'] })
    },
  })
}

interface DownloadZipInput {
  folderId: string
  projectId: number
  folderName?: string
  fileIds?: string[]
}

export function useDownloadZip() {
  const [isDownloading, setIsDownloading] = React.useState(false)
  const [progress, setProgress] = React.useState({ current: 0, total: 0 })
  const [error, setError] = React.useState<string | null>(null)
  const controllerRef = React.useRef<AbortController | null>(null)

  const startDownload = React.useCallback(async ({ folderId, projectId, folderName, fileIds }: DownloadZipInput) => {
    if (isDownloading) {
      controllerRef.current?.abort()
    }

    const controller = new AbortController()
    controllerRef.current = controller
    setIsDownloading(true)
    setProgress({ current: 0, total: 0 })
    setError(null)

    try {
      const params = new URLSearchParams({
        folderId,
        projectId: String(projectId),
      })
      fileIds?.forEach((id) => params.append('fileIds', id))

      const payload = await api.get<DriveDownloadResponse>(`/api/drive/folders/download?${params.toString()}`)
      const downloads: FileToDownload[] = payload.files.map((file) => ({
        id: file.id,
        name: file.name,
        url: file.url,
        size: file.size,
      }))

      if (!downloads.length) {
        toast.info('Nenhum arquivo disponível para download')
        return
      }

      setProgress({ current: 0, total: downloads.length })

      await downloadFolderAsZip(downloads, folderName ?? payload.folderName ?? 'drive-download', {
        signal: controller.signal,
        onProgress: (current, total) => setProgress({ current, total }),
      })
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') {
        setError('Download cancelado')
      } else {
        const message = err instanceof Error ? err.message : 'Falha no download'
        setError(message)
        toast.error(message)
      }
    } finally {
      setIsDownloading(false)
    }
  }, [isDownloading])

  const cancelDownload = React.useCallback(() => {
    controllerRef.current?.abort()
  }, [])

  return {
    startDownload,
    cancelDownload,
    isDownloading,
    progress,
    error,
  }
}
