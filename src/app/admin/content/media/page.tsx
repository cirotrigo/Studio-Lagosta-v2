'use client'

import { useState } from 'react'
import { Upload, Grid, List, Search, FolderOpen } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useAdminMedia, useSearchMedia } from '@/hooks/admin/use-admin-media'
import { MediaGallery } from '@/components/admin/cms/media-gallery'
import { UploadMediaDialog } from '@/components/admin/cms/upload-media-dialog'

export default function AdminMediaPage() {
  const [isUploadDialogOpen, setIsUploadDialogOpen] = useState(false)
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid')
  const [searchQuery, setSearchQuery] = useState('')
  const [folderFilter, setFolderFilter] = useState<string>('all')
  const [typeFilter, setTypeFilter] = useState<string>('all')

  // Fetch media based on filters
  const folder = folderFilter === 'all' ? undefined : folderFilter
  const { data: mediaData, isLoading } = useAdminMedia(folder)
  const { data: searchResults } = useSearchMedia(searchQuery)

  // Use search results if there's a search query, otherwise use filtered media
  const media = searchQuery ? searchResults?.media || [] : mediaData?.media || []

  // Filter by type if selected
  const filteredMedia = typeFilter === 'all'
    ? media
    : media.filter((m) => m.mimeType.startsWith(typeFilter))

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Mídias</h1>
          <p className="text-muted-foreground">
            Gerencie imagens, vídeos e outros arquivos
          </p>
        </div>
        <Button onClick={() => setIsUploadDialogOpen(true)}>
          <Upload className="mr-2 h-4 w-4" />
          Upload
        </Button>
      </div>

      {/* Filters and Search */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-1 gap-2">
          {/* Search */}
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Buscar mídias..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9"
            />
          </div>

          {/* Folder Filter */}
          <Select value={folderFilter} onValueChange={setFolderFilter}>
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="Pasta" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas as pastas</SelectItem>
              <SelectItem value="images">Imagens</SelectItem>
              <SelectItem value="documents">Documentos</SelectItem>
              <SelectItem value="videos">Vídeos</SelectItem>
            </SelectContent>
          </Select>

          {/* Type Filter */}
          <Select value={typeFilter} onValueChange={setTypeFilter}>
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="Tipo" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos os tipos</SelectItem>
              <SelectItem value="image/">Imagens</SelectItem>
              <SelectItem value="video/">Vídeos</SelectItem>
              <SelectItem value="application/">Documentos</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* View Mode Toggle */}
        <div className="flex gap-2">
          <Button
            variant={viewMode === 'grid' ? 'default' : 'outline'}
            size="icon"
            onClick={() => setViewMode('grid')}
          >
            <Grid className="h-4 w-4" />
          </Button>
          <Button
            variant={viewMode === 'list' ? 'default' : 'outline'}
            size="icon"
            onClick={() => setViewMode('list')}
          >
            <List className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Media Gallery */}
      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <div className="text-center">
            <div className="mb-4 inline-block h-8 w-8 animate-spin rounded-full border-4 border-solid border-current border-r-transparent" />
            <p className="text-muted-foreground">Carregando mídias...</p>
          </div>
        </div>
      ) : filteredMedia.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-lg border border-dashed py-12">
          <FolderOpen className="mb-4 h-12 w-12 text-muted-foreground" />
          <h3 className="mb-2 text-lg font-semibold">Nenhuma mídia encontrada</h3>
          <p className="mb-4 text-sm text-muted-foreground">
            {searchQuery
              ? 'Tente ajustar sua busca'
              : 'Faça upload de arquivos para começar'}
          </p>
          {!searchQuery && (
            <Button onClick={() => setIsUploadDialogOpen(true)}>
              <Upload className="mr-2 h-4 w-4" />
              Upload
            </Button>
          )}
        </div>
      ) : (
        <MediaGallery media={filteredMedia} viewMode={viewMode} />
      )}

      {/* Upload Dialog */}
      <UploadMediaDialog
        open={isUploadDialogOpen}
        onOpenChange={setIsUploadDialogOpen}
      />
    </div>
  )
}
