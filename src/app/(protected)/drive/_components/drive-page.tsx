'use client'

import * as React from 'react'
import { useRouter, useSearchParams, usePathname } from 'next/navigation'
import { useUser } from '@clerk/nextjs'
import { toast } from 'sonner'
import { useDebouncedValue } from '@/hooks/use-debounced-value'
import { useDriveStore } from '@/stores/drive-store'
import {
  useDriveFiles,
  useDriveProjects,
  useFolderBreadcrumbs,
  useSelectedFiles,
  useDownloadZip,
  useDeleteFiles,
  useUploadFiles,
  useMoveFiles,
} from '@/hooks/use-drive'
import { useTemplates } from '@/hooks/use-templates'
import { DriveHeader, type DriveFilterType } from './drive-header'
import { DriveFolderToggle } from './drive-folder-toggle'
import { DriveToolbar } from './drive-toolbar'
import { DriveGallery } from './drive-gallery'
import { DriveDropZone } from './drive-drop-zone'
import { FolderCreateDialog } from './folder-create-dialog'
import { FileUploadDialog } from './file-upload-dialog'
import { DownloadZipDialog } from './download-zip-dialog'
import { MoveFilesDialog } from './move-files-dialog'
import { AIEditModal, type PendingGeneration } from './ai-edit-modal'
import { PendingGenerationCard } from './pending-generation-card'
import type { GoogleDriveItem } from '@/types/google-drive'
import type { DriveFolderType, DriveBreadcrumbEntry } from '@/types/drive'
import { Card } from '@/components/ui/card'

interface DrivePageProps {
  initialProjectId?: number
  showProjectSelector?: boolean
  disableUrlSync?: boolean
}

function useQueryUpdater() {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const searchString = searchParams.toString()

  return React.useCallback(
    (updates: Record<string, string | null | undefined>) => {
      const params = new URLSearchParams(searchString)
      Object.entries(updates).forEach(([key, value]) => {
        if (value == null || value === '') {
          params.delete(key)
        } else {
          params.set(key, value)
        }
      })
      const query = params.toString()
      router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false })
    },
    [pathname, router, searchString],
  )
}

export function DrivePage({
  initialProjectId,
  showProjectSelector = true,
  disableUrlSync = false,
}: DrivePageProps = {}) {
  const { user } = useUser()
  const isAdmin = (user?.publicMetadata as { role?: string } | undefined)?.role === 'admin'
  const updateQueryInternal = useQueryUpdater()
  const searchParams = useSearchParams()
  const shouldSyncUrl = !disableUrlSync
  const updateQuery = React.useCallback(
    (updates: Record<string, string | null | undefined>) => {
      if (!shouldSyncUrl) return
      updateQueryInternal(updates)
    },
    [shouldSyncUrl, updateQueryInternal],
  )

  const activeProject = useDriveStore((state) => state.activeProject)
  const setActiveProject = useDriveStore((state) => state.setActiveProject)
  const folderType = useDriveStore((state) => state.activeFolderType)
  const setActiveFolderType = useDriveStore((state) => state.setActiveFolderType)
  const currentFolderId = useDriveStore((state) => state.currentFolderId)
  const setCurrentFolderId = useDriveStore((state) => state.setCurrentFolderId)

  const [searchTerm, setSearchTerm] = React.useState(() => (shouldSyncUrl ? searchParams.get('search') ?? '' : ''))
  const [filter, setFilter] = React.useState<DriveFilterType>('all')
  const debouncedSearch = useDebouncedValue(searchTerm, 400)

  const { data: projects = [], isLoading: projectsLoading } = useDriveProjects()
  const projectIdForQuery = initialProjectId ?? activeProject ?? null
  const driveQuery = useDriveFiles(projectIdForQuery, folderType, currentFolderId ?? undefined, debouncedSearch || undefined)
  const breadcrumbQuery = useFolderBreadcrumbs(projectIdForQuery, currentFolderId)
  const { data: templateOptions = [] } = useTemplates({
    projectId: projectIdForQuery ?? undefined,
    limit: 100,
    enabled: Boolean(projectIdForQuery),
  })
  const { selectedFileIds, toggleFile, clearSelection, selectAll } = useSelectedFiles()
  const downloadZip = useDownloadZip()
  const deleteMutation = useDeleteFiles()
  const dropUploadMutation = useUploadFiles()
  const moveMutation = useMoveFiles()
  const lastProjectRef = React.useRef<number | null>(null)

  const [folderDialogOpen, setFolderDialogOpen] = React.useState(false)
  const [uploadDialogOpen, setUploadDialogOpen] = React.useState(false)
  const [downloadDialogOpen, setDownloadDialogOpen] = React.useState(false)
  const [moveDialogOpen, setMoveDialogOpen] = React.useState(false)
  const [moveFiles, setMoveFiles] = React.useState<string[]>([])

  // AI Edit Modal state
  const [aiEditModalOpen, setAiEditModalOpen] = React.useState(false)
  const [aiEditImage, setAiEditImage] = React.useState<GoogleDriveItem | null>(null)
  const [pendingGenerations, setPendingGenerations] = React.useState<PendingGeneration[]>([])

  const allItems = React.useMemo(() => {
    if (!driveQuery.data?.pages) return []
    const items = driveQuery.data.pages.flatMap((page) => page.items)

    // Sort items: folders first, then files, both sorted alphabetically by name
    return items.sort((a, b) => {
      const aIsFolder = a.kind === 'folder' || a.mimeType === 'application/vnd.google-apps.folder'
      const bIsFolder = b.kind === 'folder' || b.mimeType === 'application/vnd.google-apps.folder'

      // Folders come first
      if (aIsFolder && !bIsFolder) return -1
      if (!aIsFolder && bIsFolder) return 1

      // Within same type, sort alphabetically by name (case-insensitive)
      return a.name.localeCompare(b.name, 'pt-BR', { sensitivity: 'base' })
    })
  }, [driveQuery.data])

  // Filter items based on selected filter
  const items = React.useMemo(() => {
    if (filter === 'all') return allItems

    return allItems.filter((item) => {
      const isFolder = item.kind === 'folder' || item.mimeType === 'application/vnd.google-apps.folder'
      const isImage = item.mimeType?.startsWith('image/')
      const isVideo = item.mimeType?.startsWith('video/')
      const isAIGenerated = item.name.toLowerCase().includes('ia-')

      switch (filter) {
        case 'ai-generated':
          return isAIGenerated && !isFolder
        case 'images':
          return isImage && !isFolder
        case 'videos':
          return isVideo && !isFolder
        case 'folders':
          return isFolder
        default:
          return true
      }
    })
  }, [allItems, filter])

  const driveProject = driveQuery.data?.pages?.[0]?.project
  const folderName = driveQuery.data?.pages?.[0]?.folderName
  const effectiveFolderId = driveQuery.data?.pages?.[0]?.currentFolderId ?? currentFolderId ?? null
  const missingFolder = Boolean(projectIdForQuery && !effectiveFolderId && !driveQuery.isPending)
  const refetchDrive = driveQuery.refetch

  React.useEffect(() => {
    if (initialProjectId && activeProject !== initialProjectId) {
      setActiveProject(initialProjectId)
    }
  }, [initialProjectId, activeProject, setActiveProject])

  React.useEffect(() => {
    if (!projectIdForQuery) {
      lastProjectRef.current = null
      return
    }
    if (lastProjectRef.current !== projectIdForQuery) {
      setCurrentFolderId(null)
      clearSelection()
      lastProjectRef.current = projectIdForQuery
    }
  }, [projectIdForQuery, clearSelection, setCurrentFolderId])

  React.useEffect(() => {
    if (!shouldSyncUrl) return
    const projectParam = searchParams.get('project')
    const parsed = projectParam ? Number(projectParam) : null
    if (parsed && parsed !== activeProject) {
      setActiveProject(parsed)
    }
  }, [searchParams, activeProject, setActiveProject, shouldSyncUrl])

  React.useEffect(() => {
    if (!shouldSyncUrl) return
    const folderParam = searchParams.get('folder')
    const resolved: DriveFolderType = folderParam === 'videos' ? 'videos' : 'images'
    if (resolved !== folderType) {
      setActiveFolderType(resolved)
    }
  }, [searchParams, folderType, setActiveFolderType, shouldSyncUrl])

  React.useEffect(() => {
    if (!shouldSyncUrl) return
    const currentParam = searchParams.get('current')
    if (currentParam && currentParam !== currentFolderId) {
      setCurrentFolderId(currentParam)
    }
  }, [searchParams, currentFolderId, setCurrentFolderId, shouldSyncUrl])

  React.useEffect(() => {
    if (!shouldSyncUrl) return
    const param = searchParams.get('search') ?? ''
    setSearchTerm((prev) => (prev === param ? prev : param))
  }, [searchParams, shouldSyncUrl])

  React.useEffect(() => {
    if (!shouldSyncUrl) return
    if (!activeProject && projects.length && !searchParams.get('project')) {
      setActiveProject(projects[0].id)
      updateQuery({ project: String(projects[0].id) })
    }
  }, [activeProject, projects, setActiveProject, searchParams, updateQuery, shouldSyncUrl])

  React.useEffect(() => {
    if (!shouldSyncUrl) return
    if (debouncedSearch !== (searchParams.get('search') ?? '')) {
      updateQuery({ search: debouncedSearch || null })
    }
  }, [debouncedSearch, searchParams, updateQuery, shouldSyncUrl])

  React.useEffect(() => {
    if (!shouldSyncUrl) return
    const paramFolder = searchParams.get('folder') ?? 'images'
    if (paramFolder !== folderType) {
      updateQuery({ folder: folderType })
    }
  }, [folderType, searchParams, updateQuery, shouldSyncUrl])

  React.useEffect(() => {
    if (!shouldSyncUrl) return
    const currentParam = searchParams.get('current') ?? null
    if ((currentFolderId ?? null) !== currentParam) {
      updateQuery({ current: currentFolderId ?? null })
    }
  }, [currentFolderId, searchParams, updateQuery, shouldSyncUrl])

  const rootFolderInfo = React.useMemo(() => {
    if (!driveProject) {
      return { id: null, name: null }
    }
    const fallbackId = driveProject.googleDriveFolderId
    const fallbackName = driveProject.googleDriveFolderName ?? 'Drive'
    if (folderType === 'videos') {
      const id = driveProject.googleDriveVideosFolderId ?? fallbackId
      const name = driveProject.googleDriveVideosFolderName ?? fallbackName ?? 'Vídeos'
      return { id, name }
    }
    const id = driveProject.googleDriveImagesFolderId ?? fallbackId
    const name = driveProject.googleDriveImagesFolderName ?? fallbackName ?? 'Fotos'
    return { id, name }
  }, [driveProject, folderType])

  const relativeBreadcrumbs = React.useMemo(() => {
    const trail = breadcrumbQuery.data?.breadcrumbs ?? []
    const rootId = rootFolderInfo.id
    if (!rootId) return trail
    const rootIndex = trail.findIndex((crumb) => crumb.id === rootId)
    return rootIndex >= 0 ? trail.slice(rootIndex + 1) : trail
  }, [breadcrumbQuery.data?.breadcrumbs, rootFolderInfo.id])

  const breadcrumbs = React.useMemo(() => {
    const base: DriveBreadcrumbEntry[] = []
    if (rootFolderInfo.id && rootFolderInfo.name) {
      base.push({ id: rootFolderInfo.id, name: rootFolderInfo.name })
    }
    return [...base, ...relativeBreadcrumbs]
  }, [rootFolderInfo, relativeBreadcrumbs])

  React.useEffect(() => {
    const newFolderId = driveQuery.data?.pages?.[0]?.currentFolderId
    if (newFolderId && newFolderId !== currentFolderId) {
      setCurrentFolderId(newFolderId)
    }
  }, [driveQuery.data, currentFolderId, setCurrentFolderId])

  const handleProjectChange = (projectId: number | null) => {
    setActiveProject(projectId)
    clearSelection()
    updateQuery({ project: projectId ? String(projectId) : null })
    if (!projectId) {
      setCurrentFolderId(null)
    }
  }

  const handleFolderChange = (next: DriveFolderType) => {
    setActiveFolderType(next)
    setCurrentFolderId(null)
    clearSelection()
  }

  const handleOpenItem = (item: GoogleDriveItem) => {
    if (item.kind === 'folder') {
      setCurrentFolderId(item.id)
      clearSelection()
      return
    }
    const targetId = item.shortcutDetails?.targetId ?? item.id
    const url =
      item.webViewLink ??
      item.webContentLink ??
      (targetId ? `https://drive.google.com/file/d/${targetId}/view` : `https://drive.google.com/file/d/${item.id}/view`)
    window.open(url, '_blank', 'noopener')
  }

  const handleDownloadItem = (item: GoogleDriveItem) => {
    const targetId = item.shortcutDetails?.targetId ?? item.id
    if (!targetId) return
    const url = `/api/google-drive/image/${targetId}`
    window.open(url, '_blank', 'noopener')
  }

  const handleOpenInTemplate = React.useCallback((file: GoogleDriveItem, templateId: number) => {
    if (file.kind === 'folder') return
    const targetId = file.shortcutDetails?.targetId ?? file.id
    if (!targetId || typeof window === 'undefined') return
    const params = new URLSearchParams({ driveFileId: targetId })
    if (file.name) {
      params.set('driveFileName', file.name)
    }
    const url = `/templates/${templateId}/editor?${params.toString()}`
    window.open(url, '_blank', 'noopener,noreferrer')
  }, [])

  // Get selected images for AI edit (excluding the base image)
  const getSelectedImagesForAIEdit = React.useCallback((baseImageId: string) => {
    return items.filter((item) =>
      selectedFileIds.includes(item.id) &&
      item.id !== baseImageId &&
      item.mimeType?.startsWith('image/')
    )
  }, [items, selectedFileIds])

  const handleEditWithAI = React.useCallback((file: GoogleDriveItem) => {
    if (file.kind === 'folder') return
    if (!file.mimeType?.startsWith('image/')) {
      toast.error('Apenas imagens podem ser editadas com IA')
      return
    }
    setAiEditImage(file)
    setAiEditModalOpen(true)
  }, [])

  const handleGenerationStart = React.useCallback((generation: PendingGeneration) => {
    setPendingGenerations((prev) => [generation, ...prev])
  }, [])

  const handleGenerationComplete = React.useCallback((id: string, result: { fileUrl: string; name: string }) => {
    setPendingGenerations((prev) =>
      prev.map((g) =>
        g.id === id
          ? { ...g, status: 'completed' as const, resultImage: result }
          : g
      )
    )
    // Remove completed generation after a delay
    setTimeout(() => {
      setPendingGenerations((prev) => prev.filter((g) => g.id !== id))
      refetchDrive()
    }, 3000)
  }, [refetchDrive])

  const handleGenerationError = React.useCallback((id: string, error: string) => {
    setPendingGenerations((prev) =>
      prev.map((g) =>
        g.id === id
          ? { ...g, status: 'error' as const, error }
          : g
      )
    )
  }, [])

  const handleRemovePendingGeneration = React.useCallback((id: string) => {
    setPendingGenerations((prev) => prev.filter((g) => g.id !== id))
  }, [])

  const handleMoveFiles = (fileIds: string[]) => {
    setMoveFiles(fileIds)
    setMoveDialogOpen(true)
  }

  const handleDelete = async (fileIds: string[]) => {
    if (!projectIdForQuery || !fileIds.length) return
    try {
      await deleteMutation.mutateAsync({ projectId: projectIdForQuery, fileIds })
      toast.success('Arquivos enviados para a lixeira')
      clearSelection()
      refetchDrive()
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Erro ao deletar arquivos'
      toast.error(message)
    }
  }

  const handleMoveToFolder = React.useCallback(
    async (fileIds: string[], folderId: string) => {
      if (!projectIdForQuery || !fileIds.length) return
      try {
        await moveMutation.mutateAsync({ projectId: projectIdForQuery, targetFolderId: folderId, fileIds })
        toast.success('Arquivos movidos com sucesso!')
        clearSelection()
        refetchDrive()
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Erro ao mover arquivos'
        toast.error(message)
      }
    },
    [clearSelection, moveMutation, projectIdForQuery, refetchDrive],
  )

  const handleDownloadZip = () => {
    if (!projectIdForQuery || !effectiveFolderId) return
    setDownloadDialogOpen(true)
    downloadZip.startDownload({
      folderId: effectiveFolderId,
      projectId: projectIdForQuery,
      folderName: folderName ?? undefined,
      fileIds: selectedFileIds.length ? selectedFileIds : undefined,
    })
  }

  const handleSelectAll = () => {
    if (!items.length) return
    selectAll(items.map((item) => item.id))
  }

  const handleDropUpload = (files: File[]) => {
    if (!projectIdForQuery || !effectiveFolderId || !files.length) return
    dropUploadMutation.mutate(
      { files, folderId: effectiveFolderId, projectId: projectIdForQuery },
      {
        onSuccess: () => {
          toast.success('Upload iniciado!')
          refetchDrive()
        },
        onError: (error) => {
          const message = error instanceof Error ? error.message : 'Erro ao enviar arquivos'
          toast.error(message)
        },
      },
    )
  }

  const disabledToolbar = !projectIdForQuery || !effectiveFolderId

  return (
    <div className="flex flex-col gap-6">
      <DriveHeader
        projects={projects}
        selectedProjectId={projectIdForQuery ?? null}
        onProjectChange={handleProjectChange}
        search={searchTerm}
        onSearchChange={setSearchTerm}
        breadcrumbs={breadcrumbs}
        onBreadcrumbClick={(folderId) => {
          if (!folderId || folderId === rootFolderInfo.id) {
            setCurrentFolderId(null)
          } else {
            setCurrentFolderId(folderId)
          }
          clearSelection()
        }}
        isLoadingProjects={projectsLoading}
        showProjectSelector={showProjectSelector}
        filter={filter}
        onFilterChange={setFilter}
      />
      <div className="flex flex-wrap items-center gap-3">
        <DriveFolderToggle project={driveProject} value={folderType} onChange={handleFolderChange} />
      </div>
      <DriveToolbar
        disabled={disabledToolbar}
        isAdmin={isAdmin}
        selectedCount={selectedFileIds.length}
        totalItems={items.length}
        onCreateFolder={() => setFolderDialogOpen(true)}
        onUpload={() => setUploadDialogOpen(true)}
        onDownload={handleDownloadZip}
        onDelete={() => handleDelete(selectedFileIds)}
        onMove={() => handleMoveFiles(selectedFileIds)}
        onSelectAll={handleSelectAll}
        onClearSelection={clearSelection}
        onRefresh={() => driveQuery.refetch()}
      />
      {!projectIdForQuery ? (
        <Card className="flex min-h-[280px] items-center justify-center text-sm text-muted-foreground">
          Escolha um projeto com pastas do Google Drive configuradas para visualizar os arquivos.
        </Card>
      ) : missingFolder ? (
        <Card className="flex min-h-[280px] items-center justify-center text-sm text-muted-foreground">
          Configure as pastas de imagens/vídeos deste projeto antes de acessar o Drive.
        </Card>
      ) : (
        <DriveDropZone
        folderId={effectiveFolderId}
        projectId={projectIdForQuery}
          isAdmin={isAdmin}
          onFilesDropped={handleDropUpload}
          isUploading={dropUploadMutation.isPending}
        >
          <DriveGallery
            items={items}
            isLoading={driveQuery.isPending || (driveQuery.isFetching && !driveQuery.isFetchingNextPage && !items.length)}
            isFetchingNextPage={driveQuery.isFetchingNextPage}
            hasNextPage={Boolean(driveQuery.hasNextPage)}
            onLoadMore={() => driveQuery.fetchNextPage()}
            onOpenItem={handleOpenItem}
            onDownloadItem={handleDownloadItem}
            onMoveItem={(item) => handleMoveFiles([item.id])}
            onMoveToFolder={handleMoveToFolder}
            onDeleteItem={isAdmin ? (item) => handleDelete([item.id]) : undefined}
            selectedFileIds={selectedFileIds}
            onToggleSelect={toggleFile}
            templates={templateOptions}
            onOpenInTemplate={handleOpenInTemplate}
            onEditWithAI={handleEditWithAI}
            pendingGenerations={pendingGenerations}
            onRemovePendingGeneration={handleRemovePendingGeneration}
            hasActiveFilter={filter !== 'all'}
          />
      </DriveDropZone>
      )}

      <FolderCreateDialog
        open={folderDialogOpen}
        onOpenChange={setFolderDialogOpen}
        projectId={projectIdForQuery ?? undefined}
        folderType={folderType}
        parentId={effectiveFolderId}
      />
      <FileUploadDialog open={uploadDialogOpen} onOpenChange={setUploadDialogOpen} projectId={projectIdForQuery ?? undefined} folderId={effectiveFolderId} />
      <DownloadZipDialog
        open={downloadDialogOpen}
        onOpenChange={setDownloadDialogOpen}
        isDownloading={downloadZip.isDownloading}
        progress={downloadZip.progress}
        error={downloadZip.error}
        onCancel={() => {
          downloadZip.cancelDownload()
        }}
      />
      <MoveFilesDialog
        open={moveDialogOpen}
        onOpenChange={setMoveDialogOpen}
        projectId={projectIdForQuery ?? undefined}
        fileIds={moveFiles}
        onSuccess={() => {
          clearSelection()
          refetchDrive()
        }}
      />
      <AIEditModal
        open={aiEditModalOpen}
        onOpenChange={setAiEditModalOpen}
        image={aiEditImage}
        projectId={projectIdForQuery}
        folderId={effectiveFolderId}
        onGenerationStart={handleGenerationStart}
        onGenerationComplete={handleGenerationComplete}
        onGenerationError={handleGenerationError}
        initialReferenceImages={aiEditImage ? getSelectedImagesForAIEdit(aiEditImage.id) : []}
      />
    </div>
  )
}
