'use client'

import * as React from 'react'
import { Folder, HardDrive, ImageIcon, Loader2, Search, RefreshCw, X, CheckCircle, ChevronLeft } from 'lucide-react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Card } from '@/components/ui/card'
import { useGoogleDriveItems } from '@/hooks/use-google-drive'
import type { GoogleDriveItem, GoogleDriveBrowserMode } from '@/types/google-drive'
import { cn } from '@/lib/utils'
import { useUpdateProjectSettings } from '@/hooks/use-project'
import { useToast } from '@/hooks/use-toast'

interface FolderBreadcrumb {
  id: string
  name: string
}

interface DesktopGoogleDriveModalProps {
  open: boolean
  mode: GoogleDriveBrowserMode
  initialFolderId?: string | null
  initialFolderName?: string | null
  onOpenChange: (open: boolean) => void
  onSelect: (item: GoogleDriveItem | { id: string; name: string; kind: 'folder' }) => void
}

export function DesktopGoogleDriveModal({
  open,
  mode,
  initialFolderId,
  initialFolderName,
  onOpenChange,
  onSelect,
}: DesktopGoogleDriveModalProps) {
  const rootLabel = 'Meu Drive'
  const [folderStack, setFolderStack] = React.useState<FolderBreadcrumb[]>([
    { id: 'root', name: rootLabel },
  ])
  const [searchTerm, setSearchTerm] = React.useState('')
  const [debouncedSearch, setDebouncedSearch] = React.useState('')
  const [selected, setSelected] = React.useState<GoogleDriveItem | null>(null)

  React.useEffect(() => {
    if (!open) {
      setSearchTerm('')
      setDebouncedSearch('')
      setSelected(null)
      setFolderStack([{ id: 'root', name: rootLabel }])
      return
    }

    if (initialFolderId && initialFolderName) {
      setFolderStack([
        { id: 'root', name: rootLabel },
        { id: initialFolderId, name: initialFolderName },
      ])
    } else {
      setFolderStack([{ id: 'root', name: rootLabel }])
    }
    setSelected(null)
  }, [open, initialFolderId, initialFolderName, rootLabel])

  React.useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedSearch(searchTerm.trim())
    }, 350)

    return () => clearTimeout(handler)
  }, [searchTerm])

  const currentFolder = folderStack[folderStack.length - 1]
  const currentFolderId = currentFolder?.id === 'root' ? undefined : currentFolder?.id

  const driveQuery = useGoogleDriveItems({
    folderId: currentFolderId,
    mode,
    search: debouncedSearch || undefined,
  })

  const items = React.useMemo(() => {
    if (!driveQuery.data?.pages) return []
    return driveQuery.data.pages.flatMap((page) => page.items)
  }, [driveQuery.data])

  const queryError = driveQuery.isError
    ? driveQuery.error instanceof Error
      ? driveQuery.error.message
      : 'Erro ao carregar arquivos do Google Drive.'
    : null

  const handleEnterFolder = (item: GoogleDriveItem) => {
    if (item.kind !== 'folder') return
    setFolderStack((stack) => [...stack, { id: item.id, name: item.name }])
    setSelected(null)
  }

  const handleBack = () => {
    if (folderStack.length <= 1) return
    setFolderStack((stack) => stack.slice(0, -1))
    setSelected(null)
  }

  const handleConfirm = () => {
    if (mode === 'folders') {
      if (selected) {
        onSelect(selected)
        onOpenChange(false)
        return
      }
      // Allow selecting currently open folder when no specific subfolder selected
      if (currentFolder) {
        onSelect({ id: currentFolder.id, name: currentFolder.name, kind: 'folder' })
        onOpenChange(false)
      }
      return
    }

    if (selected) {
      onSelect(selected)
      onOpenChange(false)
    }
  }

  const headerTitle = mode === 'folders' ? 'Selecionar Pasta' : 'Selecionar Imagem'
  const description =
    mode === 'folders'
      ? 'Escolha a pasta que receberá os backups automáticos dos criativos.'
      : 'Navegue pelas suas pastas para escolher uma imagem do Google Drive.'

  const isLoading = driveQuery.isLoading
  const isFetchingMore = driveQuery.isFetchingNextPage
  const emptyState = !isLoading && items.length === 0

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl gap-4">
        <DialogHeader className="space-y-1">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            {folderStack.length > 1 ? (
              <Button variant="ghost" size="icon" onClick={handleBack} className="h-8 w-8" aria-label="Voltar">
                <ChevronLeft className="h-4 w-4" />
              </Button>
            ) : (
              <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-muted">
                <HardDrive className="h-4 w-4" />
              </span>
            )}
            <div className="flex flex-wrap items-center gap-1">
              {folderStack.map((crumb, index) => (
                <React.Fragment key={crumb.id}>
                  {index > 0 && <span className="text-muted-foreground">/</span>}
                  <span
                    className={cn(
                      'text-sm font-medium',
                      index === folderStack.length - 1 ? 'text-foreground' : 'text-muted-foreground',
                    )}
                  >
                    {crumb.name}
                  </span>
                </React.Fragment>
              ))}
            </div>
          </div>
          <DialogTitle className="text-xl font-semibold">{headerTitle}</DialogTitle>
          <p className="text-sm text-muted-foreground">{description}</p>
        </DialogHeader>

        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Buscar por nome"
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
              className="pl-10"
            />
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => driveQuery.refetch()}
            disabled={driveQuery.isFetching}
            aria-label="Atualizar"
          >
            {driveQuery.isFetching ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          </Button>
        </div>

        <ScrollArea className="max-h-[420px] min-h-[240px] border rounded-md">
          {isLoading ? (
            <div className="grid grid-cols-1 gap-3 p-4 sm:grid-cols-2 lg:grid-cols-3">
              {Array.from({ length: 6 }).map((_, index) => (
                <div key={index} className="animate-pulse rounded-lg border bg-muted/30 p-4" />
              ))}
            </div>
          ) : queryError ? (
            <div className="flex h-48 flex-col items-center justify-center gap-2 text-center text-sm text-destructive">
              {queryError}
              <Button variant="outline" size="sm" onClick={() => driveQuery.refetch()}>
                Tentar novamente
              </Button>
            </div>
          ) : emptyState ? (
            <div className="flex h-48 flex-col items-center justify-center gap-2 text-center text-sm text-muted-foreground">
              <X className="h-6 w-6" />
              Nenhum item encontrado nesta pasta.
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-3 p-4 sm:grid-cols-2 lg:grid-cols-3">
              {items.map((item) => {
                const isFolder = item.kind === 'folder'
                const isSelected = selected?.id === item.id

                if (mode === 'folders' && !isFolder) {
                  return null
                }

                return (
                  <button
                    type="button"
                    key={item.id}
                    onClick={() => setSelected(item)}
                    className={cn(
                      'group flex flex-col items-start gap-3 rounded-lg border p-4 text-left transition hover:border-primary',
                      isSelected ? 'border-primary ring-2 ring-primary/40' : 'border-border',
                    )}
                  >
                    <div className="flex w-full items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="rounded-full bg-muted p-2">
                          {isFolder ? <Folder className="h-4 w-4" /> : <ImageIcon className="h-4 w-4" />}
                        </span>
                        <div className="flex flex-col">
                          <span className="font-medium leading-tight line-clamp-2">{item.name}</span>
                          {item.modifiedTime && (
                            <span className="text-xs text-muted-foreground">
                              Atualizado em {new Date(item.modifiedTime).toLocaleDateString('pt-BR')}
                            </span>
                          )}
                        </div>
                      </div>
                      {isSelected && <CheckCircle className="h-5 w-5 text-primary" />}
                    </div>
                    <div className="flex w-full items-center justify-between">
                      <Badge variant="outline" className="text-xs">
                        {isFolder ? 'Pasta' : 'Imagem'}
                      </Badge>
                      {isFolder && (
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          onClick={(event) => {
                            event.stopPropagation()
                            handleEnterFolder(item)
                          }}
                        >
                          Abrir
                        </Button>
                      )}
                    </div>
                  </button>
                )
              })}
            </div>
          )}
        </ScrollArea>

        {driveQuery.hasNextPage && (
          <Button variant="outline" onClick={() => driveQuery.fetchNextPage()} disabled={isFetchingMore}>
            {isFetchingMore ? 'Carregando...' : 'Carregar mais'}
          </Button>
        )}

        <div className="flex flex-col gap-2 rounded-md border bg-muted/40 p-4 text-sm">
          <div className="flex items-center justify-between">
            <div>
              <p className="font-medium">Seleção atual</p>
              <p className="text-muted-foreground">
                {selected ? selected.name : mode === 'folders' ? currentFolder?.name ?? rootLabel : 'Nenhum item selecionado'}
              </p>
            </div>
            {mode === 'folders' && (
              <Badge variant="secondary">Backup</Badge>
            )}
          </div>
        </div>

        <div className="flex justify-between">
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button onClick={handleConfirm} disabled={mode !== 'folders' && !selected}>
            {mode === 'folders' ? 'Selecionar pasta' : 'Selecionar imagem'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
interface GoogleDriveFolderSelectorProps {
  projectId: number
  folderId: string | null
  folderName: string | null
}

export function GoogleDriveFolderSelector({ projectId, folderId, folderName }: GoogleDriveFolderSelectorProps) {
  const [modalOpen, setModalOpen] = React.useState(false)
  const updateSettings = useUpdateProjectSettings(projectId)
  const { toast } = useToast()

  const handleSelect = async (item: GoogleDriveItem | { id: string; name: string; kind: 'folder' }) => {
    try {
      await updateSettings.mutateAsync({
        googleDriveFolderId: item.id,
        googleDriveFolderName: item.name,
      })
      toast({ title: 'Backup no Drive configurado!', description: 'Os próximos criativos serão copiados automaticamente.' })
    } catch (error) {
      console.error('[GoogleDriveFolderSelector] Failed to save folder', error)
      toast({
        title: 'Erro ao salvar pasta',
        description: 'Tente novamente mais tarde.',
        variant: 'destructive',
      })
    }
  }

  const handleRemove = async () => {
    try {
      await updateSettings.mutateAsync({
        googleDriveFolderId: null,
        googleDriveFolderName: null,
      })
      toast({ title: 'Backup no Drive desativado', description: 'Continuaremos salvando no Vercel Blob normalmente.' })
    } catch (error) {
      console.error('[GoogleDriveFolderSelector] Failed to remove folder', error)
      toast({
        title: 'Erro ao remover pasta',
        description: 'Tente novamente mais tarde.',
        variant: 'destructive',
      })
    }
  }

  return (
    <Card className="p-4 md:p-6">
      <div className="flex items-center justify-between gap-4">
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <Folder className="h-5 w-5 text-primary" />
            <h3 className="text-lg font-semibold">Backup no Google Drive</h3>
            <Badge variant="outline" className="text-xs uppercase">Opcional</Badge>
          </div>
          <p className="text-sm text-muted-foreground">
            Os criativos são salvos no Vercel Blob (primário). Configure uma pasta no Google Drive para manter uma cópia pessoal automática em <span className="font-medium">ARTES LAGOSTA</span>.
          </p>
          {folderId && folderName ? (
            <div className="flex items-center gap-2 text-sm">
              <Badge variant="secondary">Pasta selecionada</Badge>
              <span className="font-medium">{folderName}</span>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">Nenhuma pasta configurada. Somente o backup principal no Vercel está ativo.</p>
          )}
        </div>
        <div className="flex flex-col gap-2">
          <Button onClick={() => setModalOpen(true)} disabled={updateSettings.isPending}>
            {folderId ? 'Alterar pasta' : 'Selecionar pasta'}
          </Button>
          {folderId && (
            <Button variant="ghost" onClick={handleRemove} disabled={updateSettings.isPending}>
              Remover backup
            </Button>
          )}
        </div>
      </div>

      <DesktopGoogleDriveModal
        open={modalOpen}
        onOpenChange={setModalOpen}
        mode="folders"
        initialFolderId={folderId ?? undefined}
        initialFolderName={folderName ?? undefined}
        onSelect={handleSelect}
      />
    </Card>
  )
}
