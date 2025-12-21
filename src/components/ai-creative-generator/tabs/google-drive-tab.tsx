'use client'

import React, { useState, useEffect, useRef, useCallback } from 'react'
import { Button } from '@/components/ui/button'
import { Loader2, ImageIcon, Check, FolderOpen, ChevronRight, ArrowLeft, Folder } from 'lucide-react'
import type { ImageSource } from '@/lib/ai-creative-generator/layout-types'

interface GoogleDriveItem {
  id: string
  name: string
  mimeType: string
  kind?: string
  thumbnailLink?: string
  webContentLink?: string
}

interface BreadcrumbItem {
  id: string
  name: string
}

interface GoogleDriveTabProps {
  projectId: number
  onImageSelected: (image: ImageSource) => void
}

export function GoogleDriveTab({
  projectId,
  onImageSelected,
}: GoogleDriveTabProps) {
  const [driveItems, setDriveItems] = useState<GoogleDriveItem[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [isLoadingMore, setIsLoadingMore] = useState(false)
  const [selectedImageId, setSelectedImageId] = useState<string | null>(null)
  const [importingImageId, setImportingImageId] = useState<string | null>(null)
  const [breadcrumbs, setBreadcrumbs] = useState<BreadcrumbItem[]>([])
  const [nextPageToken, setNextPageToken] = useState<string | undefined>(undefined)
  const [currentFolderId, setCurrentFolderId] = useState<string | null>(null)

  // Load initial folder ID from project
  useEffect(() => {
    async function loadInitialFolder() {
      try {
        const response = await fetch(`/api/projects/${projectId}`)
        if (response.ok) {
          const project = await response.json()
          const folderId = project.googleDriveImagesFolderId || project.googleDriveFolderId
          const folderName = project.googleDriveImagesFolderName || project.googleDriveFolderName || 'Google Drive'

          if (folderId) {
            setCurrentFolderId(folderId)
            setBreadcrumbs([{ id: folderId, name: folderName }])
            loadDriveFiles(folderId, folderName)
          }
        }
      } catch (error) {
        console.error('[GoogleDriveTab] Error loading project:', error)
      }
    }

    loadInitialFolder()
  }, [projectId])

  // Load Google Drive files
  const loadDriveFiles = useCallback(async (folderId: string, folderName?: string, pageToken?: string) => {
    const isLoadingMoreItems = Boolean(pageToken)

    if (isLoadingMoreItems) {
      setIsLoadingMore(true)
    } else {
      setIsLoading(true)
      setDriveItems([])
      setNextPageToken(undefined)
    }

    console.log('[GoogleDriveTab] Loading files from folder:', folderId, folderName, 'pageToken:', pageToken)

    try {
      // Build URL with pagination support
      const params = new URLSearchParams({
        folderId,
        mode: 'both', // Get both folders and images
      })
      if (pageToken) {
        params.append('pageToken', pageToken)
      }

      const url = `/api/google-drive/files?${params.toString()}`
      console.log('[GoogleDriveTab] Fetching:', url)

      const response = await fetch(url)

      if (!response.ok) {
        throw new Error('Falha ao carregar arquivos do Drive')
      }

      const data = await response.json()
      console.log('[GoogleDriveTab] Received:', data)

      const items = data.items || []
      const newNextPageToken = data.nextPageToken

      // Filter to only show folders and images
      const filteredItems = items.filter((item: GoogleDriveItem) => {
        return item.kind === 'folder' ||
               (item.mimeType && item.mimeType.startsWith('image/'))
      })

      setDriveItems(prev => isLoadingMoreItems ? [...prev, ...filteredItems] : filteredItems)
      setNextPageToken(newNextPageToken)
    } catch (error) {
      console.error('[GoogleDriveTab] Failed to load Drive files:', error)
      if (!isLoadingMoreItems) {
        setDriveItems([])
        setNextPageToken(undefined)
      }
    } finally {
      if (isLoadingMoreItems) {
        setIsLoadingMore(false)
      } else {
        setIsLoading(false)
      }
    }
  }, [])

  // Navigate to folder
  const navigateToFolder = useCallback((folderId: string, folderName: string) => {
    setBreadcrumbs(prev => {
      const existingIndex = prev.findIndex(item => item.id === folderId)
      if (existingIndex !== -1) {
        // Going back - trim breadcrumbs
        return prev.slice(0, existingIndex + 1)
      } else {
        // Going forward - add new breadcrumb
        return [...prev, { id: folderId, name: folderName }]
      }
    })
    setCurrentFolderId(folderId)
    loadDriveFiles(folderId, folderName)
  }, [loadDriveFiles])

  // Navigate back
  const navigateBack = useCallback(() => {
    if (breadcrumbs.length > 1) {
      const parentCrumb = breadcrumbs[breadcrumbs.length - 2]
      navigateToFolder(parentCrumb.id, parentCrumb.name)
    }
  }, [breadcrumbs, navigateToFolder])

  // Handle item click
  const handleDriveItemClick = useCallback(async (item: GoogleDriveItem) => {
    if (item.kind === 'folder') {
      // Navigate into folder
      navigateToFolder(item.id, item.name)
    } else {
      // Select image
      const url = item.thumbnailLink || item.webContentLink

      if (!url) {
        console.warn('[GoogleDriveTab] Image without URL:', item)
        return
      }

      console.log('[GoogleDriveTab] Selecting image:', {
        id: item.id,
        name: item.name,
        url: url,
      })

      // Import image from Drive
      setImportingImageId(item.id)
      try {
        const response = await fetch('/api/upload/google-drive', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ fileId: item.id }),
        })

        if (!response.ok) {
          throw new Error('Failed to import Drive image')
        }

        const data = await response.json()
        console.log('[GoogleDriveTab] Upload response:', data)

        const imageSource: ImageSource = {
          type: 'google-drive',
          url: data.url,
          driveFileId: item.id,
        }

        setSelectedImageId(item.id)
        onImageSelected(imageSource)
      } catch (error) {
        console.error('[GoogleDriveTab] Import error, using direct URL:', error)
        // Fallback: use URL directly
        const imageSource: ImageSource = {
          type: 'google-drive',
          url: url,
          driveFileId: item.id,
        }
        setSelectedImageId(item.id)
        onImageSelected(imageSource)
      } finally {
        setImportingImageId(null)
      }
    }
  }, [navigateToFolder, onImageSelected])

  // Load more items
  const loadMoreItems = useCallback(() => {
    if (nextPageToken && currentFolderId) {
      const currentFolder = breadcrumbs[breadcrumbs.length - 1]
      loadDriveFiles(currentFolderId, currentFolder?.name, nextPageToken)
    }
  }, [nextPageToken, currentFolderId, breadcrumbs, loadDriveFiles])

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        <p className="mt-2 text-sm text-muted-foreground">
          Carregando imagens do Drive...
        </p>
      </div>
    )
  }

  if (!currentFolderId) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <FolderOpen className="h-12 w-12 text-muted-foreground/50" />
        <p className="mt-3 text-sm font-medium">Google Drive não configurado</p>
        <p className="mt-1 text-xs text-muted-foreground">
          Configure nas configurações do projeto
        </p>
      </div>
    )
  }

  const imageCount = driveItems.filter(item => item.kind !== 'folder').length
  const folderCount = driveItems.filter(item => item.kind === 'folder').length

  return (
    <div className="space-y-4">
      {/* Navigation Header */}
      {breadcrumbs.length > 0 && (
        <div className="flex items-center gap-2">
          {breadcrumbs.length > 1 && (
            <Button
              variant="ghost"
              size="sm"
              onClick={navigateBack}
              className="h-7 w-7 p-0 flex-shrink-0"
              title="Voltar"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
            </Button>
          )}

          {/* Breadcrumbs */}
          <div className="flex flex-wrap items-center gap-1 text-xs text-muted-foreground min-w-0">
            {breadcrumbs.map((crumb, index) => (
              <React.Fragment key={crumb.id}>
                {index > 0 && <ChevronRight className="h-3 w-3 flex-shrink-0" />}
                <button
                  onClick={() => navigateToFolder(crumb.id, crumb.name)}
                  className={`truncate max-w-[150px] hover:text-foreground ${
                    index === breadcrumbs.length - 1 ? 'font-medium text-foreground' : ''
                  }`}
                  title={crumb.name}
                >
                  {crumb.name}
                </button>
              </React.Fragment>
            ))}
          </div>
        </div>
      )}

      {/* Info text */}
      {driveItems.length > 0 && (
        <div className="text-xs text-muted-foreground">
          {folderCount > 0 && `${folderCount} pasta${folderCount > 1 ? 's' : ''}`}
          {folderCount > 0 && imageCount > 0 && ', '}
          {imageCount > 0 && `${imageCount} imagem${imageCount > 1 ? 'ns' : ''}`}
        </div>
      )}

      {/* Empty state */}
      {driveItems.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <FolderOpen className="h-12 w-12 text-muted-foreground/50" />
          <p className="mt-3 text-sm font-medium">Pasta vazia</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Nenhum arquivo encontrado nesta pasta
          </p>
        </div>
      ) : (
        <>
          {/* Files/Folders Grid */}
          <div className="grid grid-cols-2 gap-3">
            {driveItems.map((item) => {
              const isFolder = item.kind === 'folder'
              const isSelected = !isFolder && selectedImageId === item.id
              const isImporting = importingImageId === item.id

              return (
                <button
                  key={item.id}
                  onClick={() => handleDriveItemClick(item)}
                  disabled={isImporting}
                  className={`group relative aspect-square overflow-hidden rounded-lg border-2 transition-all ${
                    isImporting
                      ? 'cursor-wait opacity-75'
                      : 'hover:scale-105'
                  } ${
                    isSelected
                      ? 'border-primary shadow-lg'
                      : 'border-border hover:border-primary/50'
                  }`}
                  title={item.name}
                >
                  {isFolder ? (
                    <div className="flex h-full w-full flex-col items-center justify-center gap-2 bg-muted/50">
                      <Folder className="h-10 w-10 text-primary/80 transition-transform group-hover:scale-110" />
                      <p className="w-full px-2 text-xs font-medium text-muted-foreground text-center line-clamp-2">
                        {item.name}
                      </p>
                    </div>
                  ) : item.thumbnailLink ? (
                    <img
                      src={item.thumbnailLink}
                      alt={item.name}
                      className="absolute inset-0 h-full w-full object-cover"
                      loading="lazy"
                    />
                  ) : (
                    <div className="absolute inset-0 flex items-center justify-center bg-muted">
                      <ImageIcon className="h-8 w-8 text-muted-foreground" />
                    </div>
                  )}

                  {/* Overlay com nome para imagens */}
                  {!isFolder && (
                    <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent p-2 opacity-0 transition-opacity group-hover:opacity-100 z-20">
                      <p className="line-clamp-2 text-xs text-white">{item.name}</p>
                    </div>
                  )}

                  {/* Loading indicator */}
                  {isImporting && (
                    <div className="absolute inset-0 flex items-center justify-center bg-black/50 z-30">
                      <div className="flex flex-col items-center gap-2">
                        <Loader2 className="h-8 w-8 animate-spin text-white" />
                        <p className="text-xs text-white font-medium">Importando...</p>
                      </div>
                    </div>
                  )}

                  {/* Checkbox de seleção */}
                  {isSelected && !isImporting && (
                    <div className="absolute right-2 top-2 flex h-6 w-6 items-center justify-center rounded-full bg-primary shadow-lg z-20">
                      <Check className="h-4 w-4 text-primary-foreground" />
                    </div>
                  )}
                </button>
              )
            })}
          </div>

          {/* Load more button */}
          {nextPageToken && (
            <div className="flex justify-center py-2">
              <Button
                variant="outline"
                size="sm"
                onClick={loadMoreItems}
                disabled={isLoadingMore}
                className="w-full"
              >
                {isLoadingMore ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Carregando...
                  </>
                ) : (
                  'Carregar mais'
                )}
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  )
}