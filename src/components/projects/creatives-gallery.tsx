'use client'

import * as React from 'react'
import Image from 'next/image'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useOrganization } from '@clerk/nextjs'
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
import { usePhotoSwipe } from '@/hooks/use-photoswipe'
import { GalleryItem } from './gallery-item'
import { MemberFilter } from '../filters/member-filter'
import { Eye, Download, RefreshCw, Grid3X3, List, Search, Trash2, HardDrive, Calendar } from 'lucide-react'
import { cn } from '@/lib/utils'
import { PostComposer, type PostFormData } from '@/components/posts/post-composer'

interface TemplateInfo {
  id: number
  name: string
  type: string
  dimensions: string
}

interface GenerationRecord {
  id: string
  status: 'POSTING' | 'COMPLETED' | 'FAILED'
  templateId: number
  fieldValues: Record<string, unknown>
  resultUrl: string | null
  googleDriveFileId?: string | null
  googleDriveBackupUrl?: string | null
  projectId: number
  templateName?: string | null
  projectName?: string | null
  authorName?: string | null
  createdBy: string
  createdAt: string
  completedAt?: string | null
  template?: TemplateInfo
}

interface GenerationsResponse {
  generations: GenerationRecord[]
  pagination: {
    page: number
    pageSize: number
    total: number
    totalPages: number
  }
}

const STATUS_OPTIONS = [
  { value: 'all', label: 'Todos os status' },
  { value: 'COMPLETED', label: 'Concluídos' },
  { value: 'POSTING', label: 'Processando' },
  { value: 'FAILED', label: 'Falharam' },
]

type ViewMode = 'grid' | 'list'
type PreviewState = {
  id: string
  url: string
  templateName?: string | null
  isVideo?: boolean
  posterUrl?: string | null
} | null

type ProgressOverride = {
  progress: number
  status: GenerationRecord['status'] | 'PENDING'
  errorMessage?: string | null
}

function getStringField(values: Record<string, unknown>, key: string): string | undefined {
  const value = values?.[key]
  return typeof value === 'string' ? value : undefined
}

function getNumberField(values: Record<string, unknown>, key: string): number | undefined {
  const value = values?.[key]
  return typeof value === 'number' ? value : undefined
}

function getBooleanField(values: Record<string, unknown>, key: string): boolean | undefined {
  const value = values?.[key]
  return typeof value === 'boolean' ? value : undefined
}

export function CreativesGallery({ projectId }: { projectId: number }) {
  const { toast } = useToast()
  const queryClient = useQueryClient()
  const { organization } = useOrganization()

  const [searchTerm, setSearchTerm] = React.useState('')
  const [statusFilter, setStatusFilter] = React.useState<'all' | GenerationRecord['status']>('all')
  const [memberFilter, setMemberFilter] = React.useState<string | null>(null)
  const [viewMode, setViewMode] = React.useState<ViewMode>('grid')
  const [selectedIds, setSelectedIds] = React.useState<Set<string>>(new Set())
  const [onlyWithResult, setOnlyWithResult] = React.useState(true)
  const [preview, setPreview] = React.useState<PreviewState>(null)
  const [progressOverrides, setProgressOverrides] = React.useState<Record<string, ProgressOverride>>({})
  const [isComposerOpen, setIsComposerOpen] = React.useState(false)
  const [schedulingGeneration, setSchedulingGeneration] = React.useState<GenerationRecord | null>(null)

  const { data, isLoading, isError, refetch } = useQuery<GenerationsResponse>({
    queryKey: ['generations', projectId, memberFilter],
    enabled: !!projectId,
    queryFn: () => {
      const params = new URLSearchParams({ page: '1', pageSize: '100' })
      if (memberFilter) {
        params.set('createdBy', memberFilter)
      }
      return api.get(`/api/projects/${projectId}/generations?${params.toString()}`)
    },
    staleTime: 10_000,
  })


  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/api/generations/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['generations', projectId] })
      toast({ title: 'Criativo removido', description: 'A geração foi deletada com sucesso.' })
    },
    onError: () => {
      toast({ title: 'Erro ao deletar', description: 'Não foi possível deletar este criativo.', variant: 'destructive' })
    },
  })

  const bulkDeleteMutation = useMutation({
    mutationFn: (ids: string[]) => api.post<{ deletedCount: number }>('/api/generations/bulk-delete', { ids }),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['generations', projectId] })
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

  React.useEffect(() => {
    const handleQueued = (event: Event) => {
      const detail = (event as CustomEvent<Record<string, unknown>>).detail
      if (!detail) return
      if (detail.projectId != null && detail.projectId !== projectId) return
      const generationId = (typeof detail.generationId === 'string' ? detail.generationId : typeof detail.generationID === 'string' ? detail.generationID : undefined) as string | undefined
      if (!generationId) return

      setProgressOverrides((prev) => {
        const nextStatus: ProgressOverride['status'] = (typeof detail.status === 'string' ? detail.status : 'PENDING') as ProgressOverride['status']
        const nextProgress =
          typeof detail.progress === 'number'
            ? Math.max(0, Math.min(100, detail.progress))
            : prev[generationId]?.progress ?? 0

        const previous = prev[generationId]
        if (previous && previous.progress === nextProgress && previous.status === nextStatus) {
          return prev
        }

        return {
          ...prev,
          [generationId]: {
            progress: nextProgress,
            status: nextStatus,
            errorMessage: (typeof detail.errorMessage === 'string' ? detail.errorMessage : previous?.errorMessage) ?? null,
          },
        }
      })

      queryClient.invalidateQueries({ queryKey: ['generations', projectId] })
    }

    const handleProgress = (event: Event) => {
      const detail = (event as CustomEvent<Record<string, unknown>>).detail
      if (!detail) return
      if (detail.projectId != null && detail.projectId !== projectId) return
      const generationId = (typeof detail.generationId === 'string' ? detail.generationId : typeof detail.generationID === 'string' ? detail.generationID : undefined) as string | undefined
      if (!generationId) return

      setProgressOverrides((prev) => {
        const previous = prev[generationId]
        const nextStatus: ProgressOverride['status'] =
          (typeof detail.status === 'string' ? detail.status : previous?.status ?? 'POSTING') as ProgressOverride['status']
        const nextProgress =
          typeof detail.progress === 'number'
            ? Math.max(0, Math.min(100, detail.progress))
            : previous?.progress ?? 0

        const nextErrorMessage = typeof detail.errorMessage === 'string' ? detail.errorMessage : previous?.errorMessage ?? null

        if (
          previous &&
          previous.progress === nextProgress &&
          previous.status === nextStatus &&
          previous.errorMessage === nextErrorMessage
        ) {
          return prev
        }

        return {
          ...prev,
          [generationId]: {
            progress: nextProgress,
            status: nextStatus,
            errorMessage: nextErrorMessage,
          },
        }
      })
    }

    const handleCompleted = (event: Event) => {
      const detail = (event as CustomEvent<Record<string, unknown>>).detail
      if (!detail) return
      if (detail.projectId != null && detail.projectId !== projectId) return
      const generationId = (typeof detail.generationId === 'string' ? detail.generationId : typeof detail.generationID === 'string' ? detail.generationID : undefined) as string | undefined
      if (!generationId) return

      setProgressOverrides((prev) => {
        const previous = prev[generationId]
        if (previous && previous.progress === 100 && previous.status === 'COMPLETED') {
          return prev
        }
        return {
          ...prev,
          [generationId]: {
            progress: 100,
            status: 'COMPLETED',
          },
        }
      })

      queryClient.invalidateQueries({ queryKey: ['generations', projectId] })
    }

    const handleFailed = (event: Event) => {
      const detail = (event as CustomEvent<Record<string, unknown>>).detail
      if (!detail) return
      if (detail.projectId != null && detail.projectId !== projectId) return
      const generationId = (typeof detail.generationId === 'string' ? detail.generationId : typeof detail.generationID === 'string' ? detail.generationID : undefined) as string | undefined
      if (!generationId) return

      setProgressOverrides((prev) => ({
        ...prev,
        [generationId]: {
          progress:
            typeof detail.progress === 'number'
              ? Math.max(0, Math.min(100, detail.progress))
              : 100,
          status: 'FAILED' as const,
          errorMessage: (typeof detail.errorMessage === 'string' ? detail.errorMessage : prev[generationId]?.errorMessage) ?? null,
        },
      }))

      queryClient.invalidateQueries({ queryKey: ['generations', projectId] })
    }

    window.addEventListener('video-export-queued', handleQueued as EventListener)
    window.addEventListener('video-export-progress', handleProgress as EventListener)
    window.addEventListener('video-export-completed', handleCompleted as EventListener)
    window.addEventListener('video-export-failed', handleFailed as EventListener)

    return () => {
      window.removeEventListener('video-export-queued', handleQueued as EventListener)
      window.removeEventListener('video-export-progress', handleProgress as EventListener)
      window.removeEventListener('video-export-completed', handleCompleted as EventListener)
      window.removeEventListener('video-export-failed', handleFailed as EventListener)
    }
  }, [projectId, queryClient])

  React.useEffect(() => {
    if (!data?.generations) return
    setProgressOverrides((prev) => {
      let mutated = false
      const next: Record<string, ProgressOverride> = { ...prev }
      for (const generation of data.generations) {
        if (!next[generation.id]) continue
        if (generation.status === 'COMPLETED' || generation.status === 'FAILED') {
          delete next[generation.id]
          mutated = true
        }
      }
      return mutated ? next : prev
    })
  }, [data?.generations])

  const filtered = React.useMemo(() => {
    const list = data?.generations ?? []
    return list.filter((generation) => {
      const fieldValues = (generation.fieldValues ?? {}) as Record<string, unknown>
      const thumbnailValue = getStringField(fieldValues, 'thumbnailUrl')

      const matchesStatus = statusFilter === 'all' || generation.status === statusFilter
      const matchesResult =
        !onlyWithResult ||
        Boolean(
          generation.resultUrl ||
            (thumbnailValue && thumbnailValue.length > 0)
        )
      const query = searchTerm.trim().toLowerCase()
      const matchesSearch =
        !query ||
        generation.templateName?.toLowerCase().includes(query) ||
        generation.template?.name?.toLowerCase().includes(query) ||
        generation.id.toLowerCase().includes(query)
      return matchesStatus && matchesResult && matchesSearch
    })
  }, [data?.generations, statusFilter, searchTerm, onlyWithResult])

  // PhotoSwipe integration - re-init quando os dados mudarem
  usePhotoSwipe({
    gallerySelector: '#creatives-gallery',
    childSelector: 'a',
    dependencies: [filtered.length, isLoading],
  })

  const getGenerationMeta = React.useCallback(
    (generation: GenerationRecord) => {
      const fieldValues = (generation.fieldValues ?? {}) as Record<string, unknown>
      const override = progressOverrides[generation.id]
      const thumbnailUrl = getStringField(fieldValues, 'thumbnailUrl')
      const videoUrl = getStringField(fieldValues, 'videoUrl')
      const serverProgress = getNumberField(fieldValues, 'progress')
      const isVideoFlag = getBooleanField(fieldValues, 'isVideo')
      const errorMessage = getStringField(fieldValues, 'errorMessage')

      const status =
        override?.status ??
        (generation.status as ProgressOverride['status'])

      const rawProgress =
        override?.progress ??
        serverProgress ??
        (generation.status === 'COMPLETED' || generation.status === 'FAILED' ? 100 : undefined)

      const progress =
        typeof rawProgress === 'number'
          ? Math.max(0, Math.min(100, rawProgress))
          : undefined

      const displayUrl =
        isVideoFlag === true
          ? thumbnailUrl ?? generation.resultUrl ?? null
          : generation.resultUrl ?? thumbnailUrl ?? null

      const assetUrl =
        status === 'COMPLETED'
          ? generation.resultUrl ?? videoUrl ?? null
          : null

      return {
        displayUrl,
        assetUrl,
        isVideo: Boolean(isVideoFlag),
        status,
        progress,
        errorMessage: override?.errorMessage ?? errorMessage ?? null,
        thumbnailUrl,
      }
    },
    [progressOverrides]
  )

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
      const fieldValues = (generation.fieldValues ?? {}) as Record<string, unknown>
      const videoUrl = getStringField(fieldValues, 'videoUrl')
      const assetUrl = generation.resultUrl ?? videoUrl

      if (!assetUrl) {
        toast({
          title: 'Preview indisponível',
          description: 'Este criativo ainda não possui arquivo gerado.',
          variant: 'destructive',
        })
        return
      }

      try {
        const response = await fetch(assetUrl)
        const blob = await response.blob()
        const blobUrl = URL.createObjectURL(blob)

        const cleanPath = assetUrl.split('?')[0]
        const extensionCandidate = cleanPath.split('.').pop()
        const extension = extensionCandidate ? extensionCandidate.toLowerCase() : 'png'

        const link = document.createElement('a')
        link.href = blobUrl
        link.download = `criativo-${generation.id}.${extension}`
        document.body.appendChild(link)
        link.click()

        document.body.removeChild(link)
        URL.revokeObjectURL(blobUrl)
      } catch {
        toast({
          title: 'Erro ao baixar',
          description: 'Não foi possível baixar o criativo.',
          variant: 'destructive',
        })
      }
    },
    [toast]
  )

  const handleBulkDownload = React.useCallback(async () => {
    if (selectedIds.size === 0) return

    const generationsToDownload = filtered.filter((item) => {
      const values = (item.fieldValues ?? {}) as Record<string, unknown>
      const assetUrl = item.resultUrl ?? getStringField(values, 'videoUrl')
      return selectedIds.has(item.id) && assetUrl
    })

    if (generationsToDownload.length === 0) {
      toast({ title: 'Nenhum arquivo disponível', description: 'Selecione criativos concluídos para baixar.', variant: 'destructive' })
      return
    }

    // Download sequencial com delay
    for (const generation of generationsToDownload) {
      const fieldValues = (generation.fieldValues ?? {}) as Record<string, unknown>
      const videoUrl = getStringField(fieldValues, 'videoUrl')
      const assetUrl = generation.resultUrl ?? videoUrl
      if (!assetUrl) continue

      try {
        const response = await fetch(assetUrl)
        const blob = await response.blob()
        const blobUrl = URL.createObjectURL(blob)

        const link = document.createElement('a')
        link.href = blobUrl
        const cleanPath = assetUrl.split('?')[0]
        const extensionCandidate = cleanPath.split('.').pop()
        const extension = extensionCandidate ? extensionCandidate.toLowerCase() : 'png'
        link.download = `criativo-${generation.id}.${extension}`
        document.body.appendChild(link)
        link.click()
        document.body.removeChild(link)
        URL.revokeObjectURL(blobUrl)

        // Pequeno delay entre downloads
        await new Promise(resolve => setTimeout(resolve, 300))
      } catch {
        console.error(`Erro ao baixar criativo ${generation.id}`)
      }
    }

    toast({ title: 'Downloads iniciados', description: `${generationsToDownload.length} arquivo(s) sendo baixado(s).` })
  }, [filtered, selectedIds, toast])

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

    const meta = getGenerationMeta(schedulingGeneration)
    const mediaUrl = meta.assetUrl ?? meta.displayUrl

    if (!mediaUrl) return undefined

    return {
      postType,
      mediaUrls: [mediaUrl],
      generationIds: [schedulingGeneration.id],
      caption: '',
      scheduleType: 'SCHEDULED' as const,
    } as Partial<PostFormData>
  }, [schedulingGeneration, getGenerationMeta])

  const isEmpty = !isLoading && filtered.length === 0

  return (
    <>
      {/* Filtros e controles - layout responsivo mobile-first */}
      <Card className="flex flex-col gap-4 p-4 mb-6 max-w-full overflow-hidden">
        {/* Filtros superiores */}
        <div className="flex flex-col sm:flex-row gap-3 w-full">
          <div className="relative w-full sm:max-w-sm">
            <Search className="pointer-events-none absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Buscar por template ou ID"
              className="pl-8 w-full"
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
            />
          </div>
          <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
            <Select value={statusFilter} onValueChange={(value) => setStatusFilter(value as typeof statusFilter)}>
              <SelectTrigger className="w-full sm:w-[160px]">
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
            {organization && (
              <MemberFilter
                organizationId={organization.id}
                value={memberFilter}
                onChange={setMemberFilter}
                items={data?.generations || []}
              />
            )}
          </div>
        </div>

        {/* Controles inferiores */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 w-full">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Switch id="only-result" checked={onlyWithResult} onCheckedChange={setOnlyWithResult} />
            <label htmlFor="only-result" className="whitespace-nowrap">Somente com arquivo</label>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button variant={viewMode === 'grid' ? 'default' : 'outline'} size="icon" onClick={() => setViewMode('grid')}>
              <Grid3X3 className="h-4 w-4" />
            </Button>
            <Button variant={viewMode === 'list' ? 'default' : 'outline'} size="icon" onClick={() => setViewMode('list')}>
              <List className="h-4 w-4" />
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={selectedIds.size === 0}
              onClick={handleBulkDownload}
              className="flex-1 sm:flex-none"
            >
              <Download className="h-4 w-4 sm:mr-2" />
              <span className="hidden sm:inline">Baixar ({selectedIds.size})</span>
              <span className="sm:hidden ml-2">({selectedIds.size})</span>
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={selectedIds.size === 0}
              onClick={handleBulkDelete}
              className="flex-1 sm:flex-none"
            >
              <Trash2 className="h-4 w-4 text-red-500 sm:mr-2" />
              <span className="hidden sm:inline">Excluir ({selectedIds.size})</span>
              <span className="sm:hidden ml-2">({selectedIds.size})</span>
            </Button>
            <Button variant="ghost" size="icon" onClick={() => refetch()}>
              <RefreshCw className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </Card>

      {isLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-4">
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
        <Card className="p-12 text-center">
          <div className="flex flex-col items-center gap-4">
            <div className="rounded-full bg-muted p-4">
              <Eye className="h-8 w-8 text-muted-foreground" />
            </div>
            <div className="space-y-2">
              <h3 className="text-lg font-semibold">Nenhum criativo encontrado</h3>
              <p className="text-sm text-muted-foreground">
                Exporte um template através do editor Konva para vê-lo listado aqui.
              </p>
            </div>
          </div>
        </Card>
      ) : viewMode === 'grid' ? (
        <div
          id="creatives-gallery"
          className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3 md:gap-4"
        >
          {filtered.map((generation, index) => {
            const selected = selectedIds.has(generation.id)
            const templateLabel = generation.template?.name || generation.templateName || 'Template'
            const dimensions = generation.template?.dimensions || '1080x1080'

            // Parsear dimensões do template (ex: "1080x1920")
            const [widthStr, heightStr] = dimensions.split('x')
            const width = parseInt(widthStr, 10) || 1080
            const height = parseInt(heightStr, 10) || 1080

            // Determinar tipo baseado nas dimensões reais
            let templateType: 'STORY' | 'FEED' | 'SQUARE' = 'SQUARE'
            const aspectRatio = width / height

            if (aspectRatio < 0.7) {
              // Vertical - Story (9:16 = 0.5625)
              templateType = 'STORY'
            } else if (aspectRatio < 0.95) {
              // Retrato - Feed (4:5 = 0.8)
              templateType = 'FEED'
            } else {
              // Quadrado ou próximo (1:1)
              templateType = 'SQUARE'
            }

            // Debug: ver o tipo real
            if (index === 0) {
              console.log('Template dimensions:', { dimensions, width, height, aspectRatio, templateType })
            }

            const meta = getGenerationMeta(generation)

            const previewPayload =
              meta.assetUrl ?? meta.displayUrl
                ? {
                    id: generation.id,
                    url: (meta.assetUrl ?? meta.displayUrl) as string,
                    templateName: templateLabel,
                    isVideo: meta.isVideo && Boolean(meta.assetUrl),
                    posterUrl: meta.thumbnailUrl ?? meta.displayUrl ?? undefined,
                  }
                : null

            return (
              <GalleryItem
                key={generation.id}
                id={generation.id}
                displayUrl={meta.displayUrl ?? null}
                assetUrl={meta.assetUrl}
                title={templateLabel}
                date={new Intl.DateTimeFormat('pt-BR', {
                  dateStyle: 'short',
                  timeStyle: 'short',
                }).format(new Date(generation.createdAt))}
                templateType={templateType}
                selected={selected}
                hasDriveBackup={Boolean(generation.googleDriveBackupUrl)}
                status={meta.status}
                progress={meta.progress}
                errorMessage={meta.errorMessage ?? undefined}
                isVideo={meta.isVideo}
                authorClerkId={generation.createdBy}
                onToggleSelect={() => toggleSelection(generation.id)}
                onDownload={() => handleDownload(generation)}
                onDelete={() => handleDelete(generation)}
                onSchedule={() => handleSchedule(generation)}
                onPreview={() => {
                  if (previewPayload) {
                    setPreview(previewPayload)
                  }
                }}
                onDriveOpen={
                  generation.googleDriveBackupUrl
                    ? () => window.open(generation.googleDriveBackupUrl ?? '', '_blank', 'noopener,noreferrer')
                    : undefined
                }
                index={index}
                pswpWidth={width}
                pswpHeight={height}
              />
            )
          })}
        </div>
      ) : (
        <Card className="overflow-hidden">
          <ScrollArea className="h-[600px]">
            <table className="w-full table-fixed text-sm">
              <thead className="bg-muted/60 text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="w-32 px-4 py-2 text-left">Criativo</th>
                  <th className="px-4 py-2 text-left">Template</th>
                  <th className="w-32 px-4 py-2 text-left">Status</th>
                  <th className="w-44 px-4 py-2 text-left">Gerado em</th>
                  <th className="w-48 px-4 py-2 text-left">Ações</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((generation) => {
                  const selected = selectedIds.has(generation.id)
                  const templateLabel = generation.template?.name || generation.templateName || 'Template'
                  const meta = getGenerationMeta(generation)
                  const previewUrl = meta.assetUrl ?? meta.displayUrl ?? null
                  const canPreview = Boolean(previewUrl)
                  const canDownload = meta.status === 'COMPLETED' && Boolean(meta.assetUrl)
                  const statusLabel =
                    meta.status === 'COMPLETED'
                      ? 'Concluído'
                      : meta.status === 'FAILED'
                        ? 'Falhou'
                        : meta.status === 'PENDING'
                          ? 'Pendente'
                          : 'Processando'
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
                      <td className="px-4 py-3">
                        <div className="flex flex-col gap-1">
                          <Badge variant={meta.status === 'COMPLETED' ? 'secondary' : meta.status === 'FAILED' ? 'destructive' : 'outline'}>
                            {statusLabel}
                          </Badge>
                          {meta.progress != null && meta.status !== 'COMPLETED' && (
                            <span className="text-xs text-muted-foreground">{meta.progress}%</span>
                          )}
                          {meta.status === 'FAILED' && meta.errorMessage && (
                            <span className="text-xs text-red-500 line-clamp-2">{meta.errorMessage}</span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">
                        {new Intl.DateTimeFormat('pt-BR', {
                          dateStyle: 'medium',
                          timeStyle: 'short',
                        }).format(new Date(generation.createdAt))}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap items-center gap-2">
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
                                      posterUrl: meta.thumbnailUrl ?? meta.displayUrl ?? undefined,
                                    }
                                  : null
                              )
                            }
                            disabled={!canPreview}
                          >
                            <Eye className="mr-1 h-4 w-4" />
                            Ver
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleDownload(generation)}
                            disabled={!canDownload}
                          >
                            <Download className="mr-1 h-4 w-4" />
                            Baixar
                          </Button>
                          {canDownload && (
                            <Button
                              size="sm"
                              variant="default"
                              onClick={() => handleSchedule(generation)}
                            >
                              <Calendar className="mr-1 h-4 w-4" />
                              Agendar
                            </Button>
                          )}
                          {generation.googleDriveBackupUrl && (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => window.open(generation.googleDriveBackupUrl ?? '', '_blank', 'noopener,noreferrer')}
                            >
                              <HardDrive className="mr-1 h-4 w-4" />
                              Drive
                            </Button>
                          )}
                          <Button size="sm" variant="ghost" onClick={() => handleDelete(generation)}>
                            <Trash2 className="h-4 w-4 text-red-500" />
                            Remover
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
      {composerInitialData && (
        <PostComposer
          projectId={projectId}
          open={isComposerOpen}
          onClose={handleCloseComposer}
          initialData={composerInitialData}
        />
      )}
    </>
  )
}
