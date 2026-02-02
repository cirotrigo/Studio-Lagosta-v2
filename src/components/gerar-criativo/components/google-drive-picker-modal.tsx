'use client'

import React, { useState, useEffect, useCallback } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Loader2, ImageIcon, FolderOpen, ChevronRight, ArrowLeft, Folder, Check } from 'lucide-react'
import { toast } from 'sonner'

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

interface GoogleDrivePickerModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  projectId: number
  onImageSelected: (url: string) => void
}

export function GoogleDrivePickerModal({
  open,
  onOpenChange,
  projectId,
  onImageSelected,
}: GoogleDrivePickerModalProps) {
  const [driveItems, setDriveItems] = useState<GoogleDriveItem[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [isLoadingMore, setIsLoadingMore] = useState(false)
  const [importingImageId, setImportingImageId] = useState<string | null>(null)
  const [breadcrumbs, setBreadcrumbs] = useState<BreadcrumbItem[]>([])
  const [nextPageToken, setNextPageToken] = useState<string | undefined>(undefined)
  const [currentFolderId, setCurrentFolderId] = useState<string | null>(null)

  // Load initial folder ID from project
  useEffect(() => {
    if (!open) return

    async function loadInitialFolder() {
      try {
        setIsLoading(true)
        const response = await fetch(`/api/projects/${projectId}`)
        if (response.ok) {
          const project = await response.json()
          const folderId = project.googleDriveImagesFolderId || project.googleDriveFolderId
          const folderName = project.googleDriveImagesFolderName || project.googleDriveFolderName || 'Google Drive'

          if (folderId) {
            setCurrentFolderId(folderId)
            setBreadcrumbs([{ id: folderId, name: folderName }])
            loadDriveFiles(folderId, folderName)
          } else {
            setIsLoading(false)
          }
        } else {
          setIsLoading(false)
        }
      } catch (error) {
        console.error('[GoogleDrivePickerModal] Error loading project:', error)
        setIsLoading(false)
      }
    }

    loadInitialFolder()
  }, [projectId, open])

  // Reset state when modal closes
  useEffect(() => {
    if (!open) {
      setDriveItems([])
      setBreadcrumbs([])
      setCurrentFolderId(null)
      setNextPageToken(undefined)
      setImportingImageId(null)
    }
  }, [open])

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

    try {
      const params = new URLSearchParams({
        folderId,
        mode: 'both',
      })
      if (pageToken) {
        params.append('pageToken', pageToken)
      }

      const url = `/api/google-drive/files?${params.toString()}`
      const response = await fetch(url)

      if (!response.ok) {
        throw new Error('Falha ao carregar arquivos do Drive')
      }

      const data = await response.json()
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
      console.error('[GoogleDrivePickerModal] Failed to load Drive files:', error)
      toast.error('Erro ao carregar arquivos do Drive')
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
        return prev.slice(0, existingIndex + 1)
      } else {
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
      navigateToFolder(item.id, item.name)
    } else {
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
        onImageSelected(data.url)
        toast.success('Imagem importada com sucesso!')
      } catch (error) {
        console.error('[GoogleDrivePickerModal] Import error:', error)
        // Fallback: use thumbnail URL directly
        const url = item.thumbnailLink || item.webContentLink
        if (url) {
          onImageSelected(url)
          toast.success('Imagem selecionada!')
        } else {
          toast.error('Erro ao importar imagem')
        }
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

  const imageCount = driveItems.filter(item => item.kind !== 'folder').length
  const folderCount = driveItems.filter(item => item.kind === 'folder').length

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[600px] max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FolderOpen className="w-5 h-5" />
            Selecionar do Google Drive
          </DialogTitle>
          <DialogDescription>
            Navegue pelas pastas e selecione uma imagem de referencia
          </DialogDescription>
        </DialogHeader>

        {/* Navigation Header */}
        {breadcrumbs.length > 0 && (
          <div className="flex items-center gap-2 py-2 border-b">
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

        <ScrollArea className="flex-1 min-h-0">
          <div className="py-4">
            {isLoading ? (
              <div className="flex flex-col items-center justify-center py-12">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                <p className="mt-2 text-sm text-muted-foreground">
                  Carregando arquivos do Drive...
                </p>
              </div>
            ) : !currentFolderId ? (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <FolderOpen className="h-12 w-12 text-muted-foreground/50" />
                <p className="mt-3 text-sm font-medium">Google Drive não configurado</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Configure nas configurações do projeto
                </p>
              </div>
            ) : driveItems.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <FolderOpen className="h-12 w-12 text-muted-foreground/50" />
                <p className="mt-3 text-sm font-medium">Pasta vazia</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Nenhum arquivo encontrado nesta pasta
                </p>
              </div>
            ) : (
              <>
                {/* Info text */}
                <div className="text-xs text-muted-foreground mb-3">
                  {folderCount > 0 && `${folderCount} pasta${folderCount > 1 ? 's' : ''}`}
                  {folderCount > 0 && imageCount > 0 && ', '}
                  {imageCount > 0 && `${imageCount} imagem${imageCount > 1 ? 'ns' : ''}`}
                </div>

                {/* Files/Folders Grid */}
                <div className="grid grid-cols-3 gap-3">
                  {driveItems.map((item) => {
                    const isFolder = item.kind === 'folder'
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
                        } border-border hover:border-primary/50`}
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

                        {/* Overlay with name for images */}
                        {!isFolder && (
                          <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent p-2 opacity-0 transition-opacity group-hover:opacity-100 z-20">
                            <p className="line-clamp-2 text-xs text-white">{item.name}</p>
                          </div>
                        )}

                        {/* Loading indicator */}
                        {isImporting && (
                          <div className="absolute inset-0 flex items-center justify-center bg-black/50 z-30">
                            <div className="flex flex-col items-center gap-2">
                              <Loader2 className="h-6 w-6 animate-spin text-white" />
                              <p className="text-xs text-white font-medium">Importando...</p>
                            </div>
                          </div>
                        )}
                      </button>
                    )
                  })}
                </div>

                {/* Load more button */}
                {nextPageToken && (
                  <div className="flex justify-center py-4">
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
        </ScrollArea>

        <div className="flex justify-end pt-4 border-t">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
