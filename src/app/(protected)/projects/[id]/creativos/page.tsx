'use client'

import * as React from 'react'
import Image from 'next/image'
import { useParams, useRouter } from 'next/navigation'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
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
import { GalleryItem } from '@/components/projects/gallery-item'
import { Eye, Download, RefreshCw, Grid3X3, List, Search, Trash2, HardDrive } from 'lucide-react'
import { cn } from '@/lib/utils'

interface TemplateInfo {
  id: number
  name: string
  type: string
  dimensions: string
}

interface GenerationRecord {
  id: string
  status: 'PROCESSING' | 'COMPLETED' | 'FAILED'
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
  { value: 'PROCESSING', label: 'Processando' },
  { value: 'FAILED', label: 'Falharam' },
]

type ViewMode = 'grid' | 'list'

type PreviewState = { id: string; url: string; templateName?: string | null } | null

export default function ProjectCreativesPage() {
  const params = useParams()
  const router = useRouter()
  const { toast } = useToast()
  const queryClient = useQueryClient()

  const projectId = Number(params?.id)
  const isValidProject = Number.isFinite(projectId) && projectId > 0

  usePageConfig(
    'Galeria de Criativos',
    'Visualize e baixe todos os criativos exportados através do editor Konva.',
    [
      { label: 'Dashboard', href: '/dashboard' },
      { label: 'Projetos', href: '/projects' },
      isValidProject ? { label: `Projeto ${projectId}`, href: `/projects/${projectId}` } : undefined,
      { label: 'Criativos' },
    ].filter(Boolean) as { label: string; href?: string }[],
  )

  const [searchTerm, setSearchTerm] = React.useState('')
  const [statusFilter, setStatusFilter] = React.useState<'all' | GenerationRecord['status']>('all')
  const [viewMode, setViewMode] = React.useState<ViewMode>('grid')
  const [selectedIds, setSelectedIds] = React.useState<Set<string>>(new Set())
  const [onlyWithResult, setOnlyWithResult] = React.useState(true)
  const [preview, setPreview] = React.useState<PreviewState>(null)

  const { data, isLoading, isError, refetch } = useQuery<GenerationsResponse>({
    queryKey: ['generations', projectId],
    enabled: isValidProject,
    queryFn: () => api.get(`/api/projects/${projectId}/generations?page=1&pageSize=100`),
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
    mutationFn: (ids: string[]) => api.post('/api/generations/bulk-delete', { ids }),
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

  const filtered = React.useMemo(() => {
    const list = data?.generations ?? []
    return list.filter((generation) => {
      const matchesStatus = statusFilter === 'all' || generation.status === statusFilter
      const matchesResult = !onlyWithResult || Boolean(generation.resultUrl)
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

  const handleDownload = React.useCallback(async (generation: GenerationRecord) => {
    if (!generation.resultUrl) {
      toast({ title: 'Preview indisponível', description: 'Este criativo ainda não possui arquivo gerado.', variant: 'destructive' })
      return
    }

    try {
      // Fetch da imagem como blob
      const response = await fetch(generation.resultUrl)
      const blob = await response.blob()

      // Criar URL temporária do blob
      const blobUrl = URL.createObjectURL(blob)

      // Criar link temporário e forçar download
      const link = document.createElement('a')
      link.href = blobUrl
      link.download = `criativo-${generation.id}.png`
      document.body.appendChild(link)
      link.click()

      // Limpar
      document.body.removeChild(link)
      URL.revokeObjectURL(blobUrl)
    } catch {
      toast({ title: 'Erro ao baixar', description: 'Não foi possível baixar o criativo.', variant: 'destructive' })
    }
  }, [toast])

  const handleBulkDownload = React.useCallback(async () => {
    if (selectedIds.size === 0) return

    const generationsToDownload = filtered.filter(
      (item) => selectedIds.has(item.id) && item.resultUrl
    )

    if (generationsToDownload.length === 0) {
      toast({ title: 'Nenhum arquivo disponível', description: 'Selecione criativos concluídos para baixar.', variant: 'destructive' })
      return
    }

    // Download sequencial com delay
    for (const generation of generationsToDownload) {
      if (!generation.resultUrl) continue

      try {
        const response = await fetch(generation.resultUrl)
        const blob = await response.blob()
        const blobUrl = URL.createObjectURL(blob)

        const link = document.createElement('a')
        link.href = blobUrl
        link.download = `criativo-${generation.id}.png`
        document.body.appendChild(link)
        link.click()
        document.body.removeChild(link)
        URL.revokeObjectURL(blobUrl)

        // Pequeno delay entre downloads
        await new Promise(resolve => setTimeout(resolve, 300))
      } catch (error) {
        console.error(`Erro ao baixar criativo ${generation.id}:`, error)
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

  if (!isValidProject) {
    return (
      <Card className="m-8 p-6 text-sm text-muted-foreground">
        Projeto inválido. Verifique a URL ou selecione o projeto novamente.
      </Card>
    )
  }

  const isEmpty = !isLoading && filtered.length === 0

  return (
    <div className="container mx-auto flex flex-col gap-6 py-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold">Galeria de Criativos</h1>
          <p className="text-sm text-muted-foreground">Filtre e baixe os criativos exportados através do editor de templates Konva.</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="ghost" onClick={() => router.push(`/projects/${projectId}`)}>
            Voltar ao projeto
          </Button>
        </div>
      </div>

      <Card className="flex flex-wrap items-center gap-3 p-4">
        <div className="flex flex-1 items-center gap-2">
          <div className="relative w-full max-w-sm">
            <Search className="pointer-events-none absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Buscar por template ou ID"
              className="pl-8"
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
            />
          </div>
          <Select value={statusFilter} onValueChange={(value) => setStatusFilter(value as typeof statusFilter)}>
            <SelectTrigger className="w-[160px]">
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
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Switch id="only-result" checked={onlyWithResult} onCheckedChange={setOnlyWithResult} />
            <label htmlFor="only-result">Somente com arquivo</label>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant={viewMode === 'grid' ? 'default' : 'outline'} size="icon" onClick={() => setViewMode('grid')}>
            <Grid3X3 className="h-4 w-4" />
          </Button>
          <Button variant={viewMode === 'list' ? 'default' : 'outline'} size="icon" onClick={() => setViewMode('list')}>
            <List className="h-4 w-4" />
          </Button>
          <Button
            variant="outline"
            disabled={selectedIds.size === 0}
            onClick={handleBulkDownload}
          >
            <Download className="mr-2 h-4 w-4" /> Baixar selecionados ({selectedIds.size})
          </Button>
          <Button
            variant="outline"
            disabled={selectedIds.size === 0}
            onClick={handleBulkDelete}
          >
            <Trash2 className="mr-2 h-4 w-4 text-red-500" /> Excluir selecionados ({selectedIds.size})
          </Button>
          <Button variant="ghost" size="icon" onClick={() => refetch()}>
            <RefreshCw className="h-4 w-4" />
          </Button>
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
            <Button onClick={() => router.push(`/projects/${projectId}`)}>
              Voltar ao projeto
            </Button>
          </div>
        </Card>
      ) : viewMode === 'grid' ? (
        <div
          id="creatives-gallery"
          className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 auto-rows-[200px] gap-4"
          style={{ gridAutoFlow: 'dense' }}
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

            if (!generation.resultUrl) {
              return (
                <Card key={generation.id} className="aspect-square p-4 flex items-center justify-center">
                  <div className="text-xs text-muted-foreground">Sem preview</div>
                </Card>
              )
            }

            return (
              <GalleryItem
                key={generation.id}
                id={generation.id}
                imageUrl={generation.resultUrl}
                title={templateLabel}
                date={new Intl.DateTimeFormat('pt-BR', {
                  dateStyle: 'short',
                  timeStyle: 'short',
                }).format(new Date(generation.createdAt))}
                templateType={templateType}
                selected={selected}
                hasDriveBackup={Boolean(generation.googleDriveBackupUrl)}
                onToggleSelect={() => toggleSelection(generation.id)}
                onDownload={() => handleDownload(generation)}
                onDelete={() => handleDelete(generation)}
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
                        <Badge variant={generation.status === 'COMPLETED' ? 'secondary' : generation.status === 'FAILED' ? 'destructive' : 'outline'}>
                          {generation.status}
                        </Badge>
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">
                        {new Intl.DateTimeFormat('pt-BR', {
                          dateStyle: 'medium',
                          timeStyle: 'short',
                        }).format(new Date(generation.createdAt))}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap items-center gap-2">
                          <Button size="sm" variant="outline" onClick={() => setPreview(generation.resultUrl ? { id: generation.id, url: generation.resultUrl, templateName: templateLabel } : null)} disabled={!generation.resultUrl}>
                            <Eye className="mr-1 h-4 w-4" />
                            Ver
                          </Button>
                          <Button size="sm" variant="outline" onClick={() => handleDownload(generation)} disabled={!generation.resultUrl}>
                            <Download className="mr-1 h-4 w-4" />
                            Baixar
                          </Button>
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
            <Image
              src={preview.url}
              alt={preview.templateName ?? 'Preview'}
              width={1024}
              height={1024}
              className="h-auto w-full rounded-md"
            />
          ) : (
            <div className="rounded-md border border-dashed border-border/50 p-12 text-center text-sm text-muted-foreground">
              Nenhum preview disponível para esta geração.
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
