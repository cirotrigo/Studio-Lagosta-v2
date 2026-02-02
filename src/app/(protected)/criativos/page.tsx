'use client'

import * as React from 'react'
import Image from 'next/image'
import { useRouter } from 'next/navigation'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api-client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { Card } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Switch } from '@/components/ui/switch'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { useToast } from '@/hooks/use-toast'
import { usePageConfig } from '@/hooks/use-page-config'
import { usePhotoSwipe } from '@/hooks/use-photoswipe'
import { useAllGenerations, type GenerationRecord } from '@/hooks/use-generations'
import { GalleryItem } from '@/components/projects/gallery-item'
import { ProjectCarouselFilter } from '@/components/criativos/project-carousel-filter'
import { PostComposer, type PostFormData } from '@/components/posts/post-composer'
import {
  Eye,
  Download,
  RefreshCw,
  Grid3X3,
  List,
  Search,
  Trash2,
  HardDrive,
  Calendar,
  Layers,
} from 'lucide-react'
import { cn } from '@/lib/utils'

interface TemplateInfo {
  id: number
  name: string
  type: string
  dimensions: string
}

interface GenerationMeta {
  displayUrl: string | null
  assetUrl: string | null
  downloadUrl: string | null
  isVideo: boolean
  progress?: number
  errorMessage?: string | null
  thumbnailUrl?: string | null
  posterUrl?: string | null
  mimeType?: string | null
}

const STATUS_OPTIONS = [
  { value: 'all', label: 'Todos os status' },
  { value: 'COMPLETED', label: 'Concluídos' },
  { value: 'POSTING', label: 'Processando' },
  { value: 'FAILED', label: 'Falharam' },
]

type ViewMode = 'grid' | 'list'

type PreviewState =
  | {
      id: string
      url: string
      templateName?: string | null
      isVideo?: boolean
      posterUrl?: string | null
    }
  | null

function getStringField(fields: Record<string, unknown>, key: string): string | null {
  const value = fields[key]
  if (typeof value === 'string') {
    const trimmed = value.trim()
    return trimmed.length > 0 ? trimmed : null
  }
  return null
}

function getNumberField(fields: Record<string, unknown>, key: string): number | null {
  const value = fields[key]
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value
  }
  if (typeof value === 'string') {
    const parsed = Number.parseFloat(value)
    if (Number.isFinite(parsed)) {
      return parsed
    }
  }
  return null
}

function getBooleanField(fields: Record<string, unknown>, key: string): boolean | null {
  const value = fields[key]
  if (typeof value === 'boolean') return value
  if (typeof value === 'number') {
    if (value === 1) return true
    if (value === 0) return false
  }
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase()
    if (normalized === 'true') return true
    if (normalized === 'false') return false
  }
  return null
}

function buildGenerationMeta(generation: GenerationRecord): GenerationMeta {
  const fields = generation.fieldValues ?? {}

  const thumbnailUrl = getStringField(fields, 'thumbnailUrl')
  const previewUrl = getStringField(fields, 'previewUrl') ?? getStringField(fields, 'previewImage')
  const videoUrl =
    getStringField(fields, 'videoUrl') ??
    getStringField(fields, 'mp4Url') ??
    getStringField(fields, 'resultVideoUrl')
  const mimeType = getStringField(fields, 'mimeType')
  const errorMessage = getStringField(fields, 'errorMessage')
  const progressValue = getNumberField(fields, 'progress')
  const posterUrl = thumbnailUrl ?? previewUrl ?? null

  const baseAssetUrl = generation.resultUrl ?? videoUrl ?? null
  const isVideoFlag =
    getBooleanField(fields, 'isVideo') ??
    (mimeType ? mimeType.toLowerCase().startsWith('video/') : false)

  const assetUrl = generation.status === 'COMPLETED' ? baseAssetUrl : null
  const displayUrl = isVideoFlag ? posterUrl ?? baseAssetUrl : baseAssetUrl ?? posterUrl
  const downloadUrl = baseAssetUrl

  return {
    displayUrl: displayUrl ?? null,
    assetUrl,
    downloadUrl,
    isVideo: Boolean(isVideoFlag),
    progress:
      typeof progressValue === 'number'
        ? Math.max(0, Math.min(100, progressValue))
        : undefined,
    errorMessage: errorMessage ?? undefined,
    thumbnailUrl,
    posterUrl,
    mimeType,
  }
}

function inferDownloadExtension(meta: GenerationMeta, blobType?: string | null): string {
  const typeCandidates = [meta.mimeType, blobType].filter(Boolean) as string[]
  for (const type of typeCandidates) {
    const normalized = type.toLowerCase()
    if (normalized.includes('mp4')) return 'mp4'
    if (normalized.includes('webm')) return 'webm'
    if (normalized.includes('mov')) return 'mov'
    if (normalized.includes('gif')) return 'gif'
    if (normalized.includes('png')) return 'png'
    if (normalized.includes('jpeg') || normalized.includes('jpg')) return 'jpg'
  }

  if (meta.downloadUrl) {
    try {
      const { pathname } = new URL(meta.downloadUrl)
      const ext = pathname.split('.').pop()
      if (ext && ext.length <= 6) {
        return ext.toLowerCase()
      }
    } catch {
      // ignore invalid URL parsing
    }
  }

  return meta.isVideo ? 'mp4' : 'png'
}

export default function GlobalCreativesPage() {
  const router = useRouter()
  const { toast } = useToast()
  const queryClient = useQueryClient()

  usePageConfig(
    'Criativos',
    'Visualize todos os criativos de seus projetos em um só lugar.',
    [
      { label: 'Dashboard', href: '/studio' },
      { label: 'Criativos' },
    ]
  )

  const [selectedProjectId, setSelectedProjectId] = React.useState<number | null>(null)
  const [searchTerm, setSearchTerm] = React.useState('')
  const [statusFilter, setStatusFilter] = React.useState<'all' | GenerationRecord['status']>('all')
  const [viewMode, setViewMode] = React.useState<ViewMode>('grid')
  const [selectedIds, setSelectedIds] = React.useState<Set<string>>(new Set())
  const [onlyWithResult, setOnlyWithResult] = React.useState(true)
  const [preview, setPreview] = React.useState<PreviewState>(null)
  const [isComposerOpen, setIsComposerOpen] = React.useState(false)
  const [schedulingGeneration, setSchedulingGeneration] = React.useState<GenerationRecord | null>(null)

  // Query with project filter
  const { data, isLoading, isError, refetch } = useAllGenerations(selectedProjectId)

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/api/generations/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['all-generations'] })
      toast({ title: 'Criativo removido', description: 'A geração foi deletada com sucesso.' })
    },
    onError: () => {
      toast({ title: 'Erro ao deletar', description: 'Não foi possível deletar este criativo.', variant: 'destructive' })
    },
  })

  const bulkDeleteMutation = useMutation({
    mutationFn: (ids: string[]) => api.post<{ deletedCount: number }>('/api/generations/bulk-delete', { ids }),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['all-generations'] })
      setSelectedIds(new Set())
      toast({
        title: 'Criativos removidos',
        description: `${data.deletedCount} criativo(s) deletado(s) com sucesso.`
      })
    },
    onError: () => {
      toast({
        title: 'Erro ao deletar',
        description: 'Não foi possível deletar os criativos selecionados.',
        variant: 'destructive'
      })
    },
  })

  const generationMetaMap = React.useMemo(() => {
    const map = new Map<string, GenerationMeta>()
    for (const generation of data?.generations ?? []) {
      map.set(generation.id, buildGenerationMeta(generation))
    }
    return map
  }, [data?.generations])

  const filtered = React.useMemo(() => {
    const list = data?.generations ?? []
    const query = searchTerm.trim().toLowerCase()

    return list.filter((generation) => {
      const meta = generationMetaMap.get(generation.id) ?? buildGenerationMeta(generation)
      const matchesStatus = statusFilter === 'all' || generation.status === statusFilter
      const matchesResult = !onlyWithResult || Boolean(meta.assetUrl ?? meta.displayUrl)
      const matchesSearch =
        !query ||
        generation.templateName?.toLowerCase().includes(query) ||
        generation.template?.name?.toLowerCase().includes(query) ||
        generation.projectName?.toLowerCase().includes(query) ||
        generation.Project?.name?.toLowerCase().includes(query) ||
        generation.id.toLowerCase().includes(query)
      return matchesStatus && matchesResult && matchesSearch
    })
  }, [data?.generations, statusFilter, searchTerm, onlyWithResult, generationMetaMap])

  // PhotoSwipe integration
  usePhotoSwipe({
    gallerySelector: '#creatives-gallery',
    childSelector: 'a',
    dependencies: [filtered.length, isLoading],
  })

  const toggleSelection = React.useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) {
        next.delete(id)
      } else {
        next.add(id)
      }
      return next
    })
  }, [])

  const handleDownload = React.useCallback(
    async (generation: GenerationRecord) => {
      const meta = generationMetaMap.get(generation.id) ?? buildGenerationMeta(generation)
      const downloadUrl = meta.downloadUrl

      if (!downloadUrl) {
        toast({
          title: 'Arquivo indisponível',
          description: 'Este criativo ainda não possui um arquivo para download.',
          variant: 'destructive',
        })
        return
      }

      try {
        const response = await fetch(downloadUrl)
        if (!response.ok) {
          throw new Error(`Download falhou com status ${response.status}`)
        }

        const blob = await response.blob()
        const blobUrl = URL.createObjectURL(blob)
        const extension = inferDownloadExtension(meta, blob.type || null)

        const link = document.createElement('a')
        link.href = blobUrl
        link.download = `criativo-${generation.id}.${extension}`
        document.body.appendChild(link)
        link.click()
        document.body.removeChild(link)
        URL.revokeObjectURL(blobUrl)
      } catch (error) {
        console.error('[GlobalCreatives] Falha ao baixar arquivo:', error)
        toast({
          title: 'Erro ao baixar',
          description: 'Não foi possível baixar o criativo.',
          variant: 'destructive',
        })
      }
    },
    [generationMetaMap, toast]
  )

  const handleBulkDownload = React.useCallback(async () => {
    if (selectedIds.size === 0) return

    const generationsToDownload = filtered.filter((item) => selectedIds.has(item.id))

    if (generationsToDownload.length === 0) {
      toast({
        title: 'Nenhum arquivo disponível',
        description: 'Selecione criativos concluídos para baixar.',
        variant: 'destructive',
      })
      return
    }

    for (const generation of generationsToDownload) {
      const meta = generationMetaMap.get(generation.id) ?? buildGenerationMeta(generation)
      const downloadUrl = meta.downloadUrl
      if (!downloadUrl) continue

      try {
        const response = await fetch(downloadUrl)
        if (!response.ok) {
          throw new Error(`Download falhou com status ${response.status}`)
        }

        const blob = await response.blob()
        const blobUrl = URL.createObjectURL(blob)
        const extension = inferDownloadExtension(meta, blob.type || null)

        const link = document.createElement('a')
        link.href = blobUrl
        link.download = `criativo-${generation.id}.${extension}`
        document.body.appendChild(link)
        link.click()
        document.body.removeChild(link)
        URL.revokeObjectURL(blobUrl)

        await new Promise((resolve) => setTimeout(resolve, 200))
      } catch (error) {
        console.error(`[GlobalCreatives] Erro ao baixar criativo ${generation.id}:`, error)
        toast({
          title: 'Erro ao baixar',
          description: `Falha ao baixar o criativo ${generation.id}.`,
          variant: 'destructive',
        })
      }
    }

    toast({
      title: 'Downloads iniciados',
      description: `${generationsToDownload.length} arquivo(s) em processamento.`,
    })
  }, [filtered, generationMetaMap, selectedIds, toast])

  const handleDelete = React.useCallback((generation: GenerationRecord) => {
    if (!confirm('Deseja realmente remover este criativo?')) return
    deleteMutation.mutate(generation.id)
    setSelectedIds((prev) => {
      const next = new Set(prev)
      next.delete(generation.id)
      return next
    })
  }, [deleteMutation])

  const handleBulkDelete = React.useCallback(() => {
    if (selectedIds.size === 0) return

    if (!confirm(`Deseja realmente remover ${selectedIds.size} criativo(s) selecionado(s)?`)) {
      return
    }

    bulkDeleteMutation.mutate(Array.from(selectedIds))
  }, [selectedIds, bulkDeleteMutation])

  const handleSchedule = React.useCallback((generation: GenerationRecord) => {
    setSchedulingGeneration(generation)
    setIsComposerOpen(true)
  }, [])

  const handleCloseComposer = React.useCallback(() => {
    setIsComposerOpen(false)
    setSchedulingGeneration(null)
  }, [])

  // Get project ID for scheduling
  const schedulingProjectId = schedulingGeneration?.projectId ?? null

  // Prepare initial data for PostComposer based on generation
  const composerInitialData = React.useMemo(() => {
    if (!schedulingGeneration) return undefined

    const dimensions = schedulingGeneration.template?.dimensions || '1080x1080'
    const [widthStr, heightStr] = dimensions.split('x')
    const width = parseInt(widthStr, 10) || 1080
    const height = parseInt(heightStr, 10) || 1080
    const aspectRatio = width / height

    // Detect post type based on dimensions
    let postType: 'POST' | 'STORY' | 'REEL' | 'CAROUSEL' = 'POST'
    if (aspectRatio < 0.7) {
      // Vertical - Story (9:16)
      postType = 'STORY'
    } else {
      // Feed or Square
      postType = 'POST'
    }

    const meta = generationMetaMap.get(schedulingGeneration.id) ?? buildGenerationMeta(schedulingGeneration)
    const mediaUrl = meta.assetUrl ?? meta.displayUrl

    if (!mediaUrl) return undefined

    return {
      postType,
      mediaUrls: [mediaUrl],
      generationIds: [schedulingGeneration.id],
      caption: '',
      scheduleType: 'SCHEDULED' as const,
    } as Partial<PostFormData>
  }, [schedulingGeneration, generationMetaMap])

  const isEmpty = !isLoading && filtered.length === 0
  const projects = data?.projects ?? []

  return (
    <div className="flex flex-col min-h-[calc(100dvh-4rem)]">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold flex items-center gap-2">
            <Layers className="h-6 w-6 md:h-7 md:w-7 text-primary" />
            Criativos
          </h1>
          <p className="text-sm text-muted-foreground">
            Visualize todos os criativos de seus projetos em um só lugar.
          </p>
        </div>
      </div>

      {/* Project Carousel Filter - sticky on mobile */}
      <div className="sticky top-0 z-20 bg-background/95 backdrop-blur -mx-4 px-4 md:-mx-6 md:px-6 py-3 mb-4 border-b border-border/30">
        {isLoading ? (
          <div className="flex gap-3 overflow-hidden py-2">
            {Array.from({ length: 6 }).map((_, idx) => (
              <div key={idx} className="flex flex-col items-center gap-1.5 flex-shrink-0">
                <Skeleton className="w-14 h-14 rounded-full" />
                <Skeleton className="w-12 h-3 rounded" />
              </div>
            ))}
          </div>
        ) : (
          <ProjectCarouselFilter
            projects={projects}
            selectedId={selectedProjectId}
            onSelect={setSelectedProjectId}
          />
        )}
      </div>

      {/* Filters */}
      <Card className="flex flex-wrap items-center gap-3 p-3 md:p-4 mb-4">
        <div className="flex flex-1 flex-wrap items-center gap-2">
          <div className="relative w-full sm:w-auto sm:max-w-[200px]">
            <Search className="pointer-events-none absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Buscar..."
              className="pl-8 h-9"
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
            />
          </div>
          <Select value={statusFilter} onValueChange={(value) => setStatusFilter(value as typeof statusFilter)}>
            <SelectTrigger className="w-[140px] h-9">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {STATUS_OPTIONS.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <div className="hidden sm:flex items-center gap-2 text-xs text-muted-foreground">
            <Switch id="only-result" checked={onlyWithResult} onCheckedChange={setOnlyWithResult} />
            <label htmlFor="only-result" className="cursor-pointer">Somente com arquivo</label>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant={viewMode === 'grid' ? 'default' : 'outline'} size="icon" className="h-9 w-9" onClick={() => setViewMode('grid')}>
            <Grid3X3 className="h-4 w-4" />
          </Button>
          <Button variant={viewMode === 'list' ? 'default' : 'outline'} size="icon" className="h-9 w-9" onClick={() => setViewMode('list')}>
            <List className="h-4 w-4" />
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="h-9 hidden sm:flex"
            disabled={selectedIds.size === 0}
            onClick={handleBulkDownload}
          >
            <Download className="mr-1 h-4 w-4" /> Baixar ({selectedIds.size})
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="h-9 hidden sm:flex"
            disabled={selectedIds.size === 0}
            onClick={handleBulkDelete}
          >
            <Trash2 className="mr-1 h-4 w-4 text-red-500" /> Excluir ({selectedIds.size})
          </Button>
          <Button variant="ghost" size="icon" className="h-9 w-9" onClick={() => refetch()}>
            <RefreshCw className="h-4 w-4" />
          </Button>
        </div>
      </Card>

      {/* Content */}
      {isLoading ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3 md:gap-4">
          {Array.from({ length: 10 }).map((_, idx) => (
            <div key={idx} className="rounded-xl overflow-hidden border border-border/50 bg-card">
              <Skeleton className="w-full aspect-[9/16]" />
            </div>
          ))}
        </div>
      ) : isError ? (
        <Card className="p-6 text-center text-sm text-muted-foreground">
          Não foi possível carregar os criativos. Tente novamente.
        </Card>
      ) : isEmpty ? (
        <Card className="p-8 md:p-12 text-center flex-1 flex items-center justify-center">
          <div className="flex flex-col items-center gap-4">
            <div className="rounded-full bg-muted p-4">
              <Eye className="h-8 w-8 text-muted-foreground" />
            </div>
            <div className="space-y-2">
              <h3 className="text-lg font-semibold">Nenhum criativo encontrado</h3>
              <p className="text-sm text-muted-foreground">
                {selectedProjectId
                  ? 'Este projeto ainda não possui criativos. Exporte um template através do editor.'
                  : 'Você ainda não possui criativos. Exporte um template através do editor Konva.'}
              </p>
            </div>
            <Button onClick={() => router.push('/gerar-criativo')}>
              Gerar Criativo
            </Button>
          </div>
        </Card>
      ) : viewMode === 'grid' ? (
        <div
          id="creatives-gallery"
          className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 auto-rows-[180px] sm:auto-rows-[200px] gap-3 md:gap-4 flex-1 pb-20 md:pb-4"
          style={{ gridAutoFlow: 'dense' }}
        >
          {filtered.map((generation, index) => {
            const selected = selectedIds.has(generation.id)
            const templateLabel = generation.template?.name || generation.templateName || 'Template'
            const dimensions = generation.template?.dimensions || '1080x1080'

            const [widthStr, heightStr] = dimensions.split('x')
            const width = parseInt(widthStr, 10) || 1080
            const height = parseInt(heightStr, 10) || 1080

            let templateType: 'STORY' | 'FEED' | 'SQUARE' = 'SQUARE'
            const aspectRatio = width / height

            if (aspectRatio < 0.7) {
              templateType = 'STORY'
            } else if (aspectRatio < 0.95) {
              templateType = 'FEED'
            } else {
              templateType = 'SQUARE'
            }

            const meta = generationMetaMap.get(generation.id) ?? buildGenerationMeta(generation)

            if (!meta.displayUrl && !meta.assetUrl) {
              return (
                <Card key={generation.id} className="aspect-square p-4 flex items-center justify-center">
                  <div className="text-xs text-muted-foreground">Sem preview</div>
                </Card>
              )
            }

            const previewPayload =
              meta.assetUrl ?? meta.displayUrl
                ? {
                    id: generation.id,
                    url: (meta.assetUrl ?? meta.displayUrl) as string,
                    templateName: templateLabel,
                    isVideo: meta.isVideo && Boolean(meta.assetUrl),
                    posterUrl: meta.posterUrl ?? meta.thumbnailUrl ?? undefined,
                  }
                : null

            return (
              <GalleryItem
                key={generation.id}
                id={generation.id}
                displayUrl={meta.displayUrl}
                assetUrl={meta.assetUrl}
                title={templateLabel}
                date={new Intl.DateTimeFormat('pt-BR', {
                  dateStyle: 'short',
                  timeStyle: 'short',
                }).format(new Date(generation.createdAt))}
                templateType={templateType}
                selected={selected}
                hasDriveBackup={Boolean(generation.googleDriveBackupUrl)}
                status={generation.status}
                progress={meta.progress}
                errorMessage={meta.errorMessage}
                isVideo={meta.isVideo}
                authorClerkId={generation.createdBy}
                onToggleSelect={() => toggleSelection(generation.id)}
                onDownload={() => handleDownload(generation)}
                onDelete={() => handleDelete(generation)}
                onDriveOpen={
                  generation.googleDriveBackupUrl
                    ? () => window.open(generation.googleDriveBackupUrl ?? '', '_blank', 'noopener,noreferrer')
                    : undefined
                }
                onPreview={() => {
                  if (previewPayload) {
                    setPreview(previewPayload)
                  }
                }}
                onSchedule={() => handleSchedule(generation)}
                index={index}
                pswpWidth={width}
                pswpHeight={height}
              />
            )
          })}
        </div>
      ) : (
        <Card className="overflow-hidden flex-1">
          <ScrollArea className="h-[600px]">
            <table className="w-full table-fixed text-sm">
              <thead className="bg-muted/60 text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="w-32 px-4 py-2 text-left">Criativo</th>
                  <th className="px-4 py-2 text-left">Template</th>
                  <th className="w-28 px-4 py-2 text-left hidden md:table-cell">Projeto</th>
                  <th className="w-32 px-4 py-2 text-left">Status</th>
                  <th className="w-44 px-4 py-2 text-left hidden sm:table-cell">Gerado em</th>
                  <th className="w-48 px-4 py-2 text-left">Ações</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((generation) => {
                  const selected = selectedIds.has(generation.id)
                  const templateLabel = generation.template?.name || generation.templateName || 'Template'
                  const projectName = generation.Project?.name || generation.projectName || '-'
                  const meta = generationMetaMap.get(generation.id) ?? buildGenerationMeta(generation)
                  const previewUrl = meta.assetUrl ?? meta.displayUrl ?? null
                  const canPreview = Boolean(previewUrl)
                  const canDownload = Boolean(meta.downloadUrl)
                  return (
                    <tr key={generation.id} className={cn('border-b border-border/30', selected && 'bg-primary/5')}>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <input
                            type="checkbox"
                            checked={selected}
                            onChange={() => toggleSelection(generation.id)}
                            className="h-4 w-4 rounded border-border/60"
                          />
                          <span className="font-mono text-xs text-muted-foreground truncate">{generation.id.slice(0, 8)}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex flex-col">
                          <span className="font-medium truncate">{templateLabel}</span>
                          {generation.template?.dimensions && (
                            <span className="text-xs text-muted-foreground">{generation.template.dimensions}</span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3 hidden md:table-cell">
                        <span className="text-sm truncate">{projectName}</span>
                      </td>
                      <td className="px-4 py-3">
                        <Badge variant={generation.status === 'COMPLETED' ? 'secondary' : generation.status === 'FAILED' ? 'destructive' : 'outline'}>
                          {generation.status}
                        </Badge>
                      </td>
                      <td className="px-4 py-3 text-muted-foreground hidden sm:table-cell">
                        {new Intl.DateTimeFormat('pt-BR', {
                          dateStyle: 'medium',
                          timeStyle: 'short',
                        }).format(new Date(generation.createdAt))}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap items-center gap-2">
                          {generation.status === 'COMPLETED' && meta.assetUrl && (
                            <Button
                              size="sm"
                              variant="default"
                              onClick={() => handleSchedule(generation)}
                            >
                              <Calendar className="mr-1 h-4 w-4" />
                              <span className="hidden sm:inline">Agendar</span>
                            </Button>
                          )}
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() =>
                              setPreview(
                                canPreview
                                  ? {
                                      id: generation.id,
                                      url: previewUrl!,
                                      templateName: templateLabel,
                                      isVideo: meta.isVideo && Boolean(meta.assetUrl),
                                      posterUrl: meta.posterUrl ?? meta.thumbnailUrl ?? undefined,
                                    }
                                  : null
                              )
                            }
                            disabled={!canPreview}
                          >
                            <Eye className="h-4 w-4" />
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleDownload(generation)}
                            disabled={!canDownload}
                          >
                            <Download className="h-4 w-4" />
                          </Button>
                          {generation.googleDriveBackupUrl && (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => window.open(generation.googleDriveBackupUrl ?? '', '_blank', 'noopener,noreferrer')}
                            >
                              <HardDrive className="h-4 w-4" />
                            </Button>
                          )}
                          <Button size="sm" variant="ghost" onClick={() => handleDelete(generation)}>
                            <Trash2 className="h-4 w-4 text-red-500" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </ScrollArea>
        </Card>
      )}

      {/* Mobile Action Bar */}
      {selectedIds.size > 0 && (
        <div className="fixed bottom-0 left-0 right-0 p-4 bg-background/95 backdrop-blur border-t md:hidden z-50">
          <div className="flex gap-3 max-w-lg mx-auto">
            <Button className="flex-1 h-12" onClick={handleBulkDownload}>
              <Download className="mr-2 h-5 w-5" /> Baixar ({selectedIds.size})
            </Button>
            <Button className="flex-1 h-12" variant="destructive" onClick={handleBulkDelete}>
              <Trash2 className="mr-2 h-5 w-5" /> Excluir
            </Button>
          </div>
        </div>
      )}

      {/* Preview Dialog */}
      <Dialog open={Boolean(preview)} onOpenChange={(open) => !open && setPreview(null)}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>{preview?.templateName || 'Preview'}</DialogTitle>
          </DialogHeader>
          {preview?.url ? (
            preview.isVideo ? (
              <video
                src={preview.url}
                controls
                playsInline
                poster={preview.posterUrl ?? undefined}
                className="h-auto w-full rounded-md"
              />
            ) : (
              <Image
                src={preview.url}
                alt={preview.templateName ?? 'Preview'}
                width={1024}
                height={1024}
                className="h-auto w-full rounded-md"
              />
            )
          ) : (
            <div className="rounded-md border border-dashed border-border/50 p-12 text-center text-sm text-muted-foreground">
              Nenhum preview disponível para esta geração.
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Post Composer Modal for Scheduling */}
      {composerInitialData && schedulingProjectId && (
        <PostComposer
          projectId={schedulingProjectId}
          open={isComposerOpen}
          onClose={handleCloseComposer}
          initialData={composerInitialData}
        />
      )}
    </div>
  )
}
