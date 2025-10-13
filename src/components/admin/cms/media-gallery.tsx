'use client'

import { useState } from 'react'
import Image from 'next/image'
import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import {
  MoreVertical,
  Trash2,
  Edit,
  Copy,
  Download,
  File,
  FileVideo,
  FileText,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { useDeleteMedia } from '@/hooks/admin/use-admin-media'
import { useToast } from '@/hooks/use-toast'
import type { CMSMedia } from '@/hooks/admin/use-admin-media'
import { copyToClipboard } from '@/lib/copy-to-clipboard'

type MediaGalleryProps = {
  media: CMSMedia[]
  viewMode: 'grid' | 'list'
}

export function MediaGallery({ media, viewMode }: MediaGalleryProps) {
  const [deleteId, setDeleteId] = useState<string | null>(null)
  const [selectedMedia, setSelectedMedia] = useState<CMSMedia | null>(null)
  const { toast } = useToast()
  const deleteMutation = useDeleteMedia()

  const handleDelete = async () => {
    if (!deleteId) return

    try {
      await deleteMutation.mutateAsync(deleteId)
      toast({
        title: 'Mídia excluída',
        description: 'A mídia foi excluída com sucesso.',
      })
      setDeleteId(null)
    } catch (error) {
      toast({
        title: 'Erro ao excluir',
        description: 'Não foi possível excluir a mídia.',
        variant: 'destructive',
      })
    }
  }

  const handleCopyUrl = async (url: string) => {
    try {
      await copyToClipboard(url)
      toast({
        title: 'URL copiada',
        description: 'A URL da mídia foi copiada para a área de transferência.',
      })
    } catch (error) {
      console.error('[MediaGallery] Failed to copy URL', error)
      toast({
        title: 'Erro ao copiar',
        description: 'Não foi possível copiar automaticamente. Copie manualmente a URL exibida.',
        variant: 'destructive',
      })
    }
  }

  const handleDownload = (url: string, filename: string) => {
    const link = document.createElement('a')
    link.href = url
    link.download = filename
    link.click()
  }

  if (viewMode === 'grid') {
    return (
      <>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
          {media.map((item) => (
            <MediaGridItem
              key={item.id}
              item={item}
              onDelete={setDeleteId}
              onCopyUrl={handleCopyUrl}
              onDownload={handleDownload}
            />
          ))}
        </div>

        {/* Delete Confirmation Dialog */}
        <AlertDialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Confirmar exclusão</AlertDialogTitle>
              <AlertDialogDescription>
                Tem certeza que deseja excluir esta mídia? Esta ação não pode ser
                desfeita.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancelar</AlertDialogCancel>
              <AlertDialogAction
                onClick={handleDelete}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              >
                Excluir
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </>
    )
  }

  // List view
  return (
    <div className="rounded-lg border">
      <div className="divide-y">
        {media.map((item) => (
          <MediaListItem
            key={item.id}
            item={item}
            onDelete={setDeleteId}
            onCopyUrl={handleCopyUrl}
            onDownload={handleDownload}
          />
        ))}
      </div>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirmar exclusão</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja excluir esta mídia? Esta ação não pode ser
              desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

type MediaItemProps = {
  item: CMSMedia
  onDelete: (id: string) => void
  onCopyUrl: (url: string) => void
  onDownload: (url: string, filename: string) => void
}

function MediaGridItem({ item, onDelete, onCopyUrl, onDownload }: MediaItemProps) {
  const isImage = item.mimeType.startsWith('image/')
  const isVideo = item.mimeType.startsWith('video/')
  const isPdf = item.mimeType === 'application/pdf'

  return (
    <div className="group relative overflow-hidden rounded-lg border bg-card transition-all hover:shadow-md">
      {/* Preview */}
      <div className="aspect-square bg-muted">
        {isImage ? (
          <Image
            src={item.url}
            alt={item.alt || item.name}
            width={300}
            height={300}
            className="h-full w-full object-cover"
          />
        ) : (
          <div className="flex h-full items-center justify-center">
            {isVideo ? (
              <FileVideo className="h-12 w-12 text-muted-foreground" />
            ) : isPdf ? (
              <FileText className="h-12 w-12 text-muted-foreground" />
            ) : (
              <File className="h-12 w-12 text-muted-foreground" />
            )}
          </div>
        )}
      </div>

      {/* Info */}
      <div className="p-3">
        <p className="truncate text-sm font-medium">{item.name}</p>
        <p className="text-xs text-muted-foreground">
          {(item.size / 1024 / 1024).toFixed(2)} MB
        </p>
      </div>

      {/* Actions */}
      <div className="absolute right-2 top-2 opacity-0 transition-opacity group-hover:opacity-100">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="secondary" size="icon" className="h-8 w-8">
              <MoreVertical className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => onCopyUrl(item.url)}>
              <Copy className="mr-2 h-4 w-4" />
              Copiar URL
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => onDownload(item.url, item.filename)}>
              <Download className="mr-2 h-4 w-4" />
              Download
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onClick={() => onDelete(item.id)}
              className="text-destructive focus:text-destructive"
            >
              <Trash2 className="mr-2 h-4 w-4" />
              Excluir
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  )
}

function MediaListItem({ item, onDelete, onCopyUrl, onDownload }: MediaItemProps) {
  const isImage = item.mimeType.startsWith('image/')
  const isVideo = item.mimeType.startsWith('video/')
  const isPdf = item.mimeType === 'application/pdf'

  return (
    <div className="flex items-center gap-4 p-4 hover:bg-muted/50">
      {/* Thumbnail */}
      <div className="h-16 w-16 flex-shrink-0 overflow-hidden rounded-md bg-muted">
        {isImage ? (
          <Image
            src={item.url}
            alt={item.alt || item.name}
            width={64}
            height={64}
            className="h-full w-full object-cover"
          />
        ) : (
          <div className="flex h-full items-center justify-center">
            {isVideo ? (
              <FileVideo className="h-8 w-8 text-muted-foreground" />
            ) : isPdf ? (
              <FileText className="h-8 w-8 text-muted-foreground" />
            ) : (
              <File className="h-8 w-8 text-muted-foreground" />
            )}
          </div>
        )}
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <p className="truncate font-medium">{item.name}</p>
        <p className="text-sm text-muted-foreground">
          {item.mimeType} • {(item.size / 1024 / 1024).toFixed(2)} MB •{' '}
          {format(new Date(item.createdAt), "d 'de' MMMM 'de' yyyy", {
            locale: ptBR,
          })}
        </p>
      </div>

      {/* Actions */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon">
            <MoreVertical className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onClick={() => onCopyUrl(item.url)}>
            <Copy className="mr-2 h-4 w-4" />
            Copiar URL
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => onDownload(item.url, item.filename)}>
            <Download className="mr-2 h-4 w-4" />
            Download
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            onClick={() => onDelete(item.id)}
            className="text-destructive focus:text-destructive"
          >
            <Trash2 className="mr-2 h-4 w-4" />
            Excluir
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  )
}
