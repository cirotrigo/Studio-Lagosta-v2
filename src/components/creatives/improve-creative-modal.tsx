'use client'

import * as React from 'react'
import Image from 'next/image'
import { useQuery } from '@tanstack/react-query'
import { Sparkles, Upload, X, Check } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { useToast } from '@/hooks/use-toast'
import { useImproveQueueStore } from '@/stores/improve-queue-store'
import { useBlobUpload } from '@/hooks/use-blob-upload'
import { api } from '@/lib/api-client'
import { cn } from '@/lib/utils'
import {
  MAX_SELECTED_LOGOS,
  MAX_SELECTED_ELEMENTS,
} from '@/lib/ai/improvement-assets-constants'

interface ImproveTarget {
  id: string
  projectId: number
  resultUrl: string | null
  templateName?: string | null
}

interface ImproveCreativeModalProps {
  generation: ImproveTarget | null
  open: boolean
  onOpenChange: (open: boolean) => void
}

interface LogoItem {
  id: number
  name: string
  fileUrl: string
  isProjectLogo: boolean
}

interface ElementItem {
  id: number
  name: string
  fileUrl: string
  category: string | null
}

const MAX_CHARS = 500
const ALLOWED_MIME = ['image/jpeg', 'image/png', 'image/gif', 'image/webp']
const MAX_UPLOAD_BYTES = 10 * 1024 * 1024

const PLACEHOLDER =
  'Ex: Mude o texto para Happy Hour, das 16h às 20h e adicione pessoas brindando.\n\nOu deixe em branco para um aprimoramento geral sem alterações de conteúdo.'

export function ImproveCreativeModal({
  generation,
  open,
  onOpenChange,
}: ImproveCreativeModalProps) {
  const { toast } = useToast()
  const addJob = useImproveQueueStore((s) => s.addJob)

  const [userRequest, setUserRequest] = React.useState('')
  const [backgroundUrl, setBackgroundUrl] = React.useState<string | null>(null)
  const [backgroundPreview, setBackgroundPreview] = React.useState<string | null>(null)
  const [backgroundFileName, setBackgroundFileName] = React.useState<string | null>(null)
  const [isDragging, setIsDragging] = React.useState(false)
  const [selectedLogoIds, setSelectedLogoIds] = React.useState<number[]>([])
  const [selectedElementIds, setSelectedElementIds] = React.useState<number[]>([])

  const inputRef = React.useRef<HTMLInputElement>(null)

  const projectId = generation?.projectId
  const enabled = open && !!projectId

  const { data: logos = [], isLoading: loadingLogos } = useQuery<LogoItem[]>({
    queryKey: ['project', projectId, 'logos'],
    queryFn: () => api.get<LogoItem[]>(`/api/projects/${projectId}/logos`),
    enabled,
    staleTime: 5 * 60_000,
  })

  const { data: elements = [], isLoading: loadingElements } = useQuery<ElementItem[]>({
    queryKey: ['project', projectId, 'elements'],
    queryFn: () => api.get<ElementItem[]>(`/api/projects/${projectId}/elements`),
    enabled,
    staleTime: 5 * 60_000,
  })

  const {
    upload,
    isUploading,
    progress,
    reset: resetUpload,
  } = useBlobUpload({
    onSuccess: (url) => setBackgroundUrl(url),
    onError: (err) =>
      toast({
        title: 'Falha no upload',
        description: err.message,
        variant: 'destructive',
      }),
  })

  const cleanupPreview = React.useCallback((url: string | null) => {
    if (url && url.startsWith('blob:')) {
      URL.revokeObjectURL(url)
    }
  }, [])

  const resetAll = React.useCallback(() => {
    setUserRequest('')
    setSelectedLogoIds([])
    setSelectedElementIds([])
    setBackgroundUrl(null)
    setBackgroundFileName(null)
    cleanupPreview(backgroundPreview)
    setBackgroundPreview(null)
    resetUpload()
  }, [backgroundPreview, cleanupPreview, resetUpload])

  const handleClose = () => {
    resetAll()
    onOpenChange(false)
  }

  React.useEffect(() => {
    return () => {
      cleanupPreview(backgroundPreview)
    }
  }, [backgroundPreview, cleanupPreview])

  const handleFile = async (file: File) => {
    if (!ALLOWED_MIME.includes(file.type)) {
      toast({
        title: 'Tipo de arquivo não suportado',
        description: 'Envie uma imagem JPG, PNG, GIF ou WebP.',
        variant: 'destructive',
      })
      return
    }
    if (file.size > MAX_UPLOAD_BYTES) {
      toast({
        title: 'Imagem muito grande',
        description: 'O tamanho máximo é 10 MB.',
        variant: 'destructive',
      })
      return
    }

    cleanupPreview(backgroundPreview)
    const previewUrl = URL.createObjectURL(file)
    setBackgroundPreview(previewUrl)
    setBackgroundFileName(file.name)
    setBackgroundUrl(null)

    try {
      await upload(file)
    } catch {
      // erro já tratado no onError do hook
    }
  }

  const handleRemoveBackground = () => {
    cleanupPreview(backgroundPreview)
    setBackgroundPreview(null)
    setBackgroundFileName(null)
    setBackgroundUrl(null)
    resetUpload()
    if (inputRef.current) inputRef.current.value = ''
  }

  const onInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) void handleFile(file)
  }

  const onDrop = (e: React.DragEvent<HTMLElement>) => {
    e.preventDefault()
    setIsDragging(false)
    const file = e.dataTransfer.files?.[0]
    if (file) void handleFile(file)
  }

  const toggleLogo = (id: number) => {
    setSelectedLogoIds((prev) => {
      if (prev.includes(id)) return prev.filter((x) => x !== id)
      if (prev.length >= MAX_SELECTED_LOGOS) {
        toast({
          title: `Você pode selecionar até ${MAX_SELECTED_LOGOS} logo`,
        })
        return prev
      }
      return [...prev, id]
    })
  }

  const toggleElement = (id: number) => {
    setSelectedElementIds((prev) => {
      if (prev.includes(id)) return prev.filter((x) => x !== id)
      if (prev.length >= MAX_SELECTED_ELEMENTS) {
        toast({
          title: `Você pode selecionar até ${MAX_SELECTED_ELEMENTS} elementos`,
        })
        return prev
      }
      return [...prev, id]
    })
  }

  const handleConfirm = () => {
    if (!generation) return
    const trimmed = userRequest.trim()

    addJob({
      generationId: generation.id,
      projectId: generation.projectId,
      generationThumbnailUrl: generation.resultUrl,
      generationLabel: generation.templateName ?? 'Criativo',
      userRequest: trimmed,
      backgroundImageUrl: backgroundUrl,
      selectedLogoIds,
      selectedElementIds,
    })

    toast({
      title: 'Adicionado à fila',
      description: 'A melhoria começa em instantes — você pode adicionar mais.',
    })
    resetAll()
    onOpenChange(false)
  }

  const isDisabled = isUploading

  const ctaLabel = (() => {
    if (backgroundUrl) return 'Aprimorar com novo fundo (25 créditos)'
    if (selectedLogoIds.length > 0 || selectedElementIds.length > 0) {
      return 'Aprimorar com assets (25 créditos)'
    }
    if (userRequest.trim().length === 0) return 'Aprimorar (25 créditos)'
    return 'Adicionar à fila (25 créditos)'
  })()

  return (
    <Dialog open={open} onOpenChange={(next) => (next ? onOpenChange(true) : handleClose())}>
      <DialogContent className="max-w-2xl max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" />
            Melhorar com IA
          </DialogTitle>
          <DialogDescription>
            A IA mantém fontes, logo e cores da arte original. Você pode (opcional) enviar uma
            imagem para usar como novo fundo, e selecionar logos/elementos do projeto como
            referência visual. Custa 25 créditos por melhoria.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5 py-2 overflow-y-auto pr-1 -mr-1">
          {generation?.resultUrl && (
            <div className="flex items-center gap-3 rounded-lg border border-border/40 bg-muted/30 p-3">
              <div className="relative h-20 w-20 overflow-hidden rounded-md bg-background flex-shrink-0">
                <Image
                  src={generation.resultUrl}
                  alt={generation.templateName ?? 'Criativo original'}
                  fill
                  sizes="80px"
                  className="object-cover"
                />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs uppercase tracking-wide text-muted-foreground">Original</p>
                <p className="text-sm font-medium truncate">
                  {generation.templateName ?? 'Criativo'}
                </p>
              </div>
            </div>
          )}

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label htmlFor="user-request">Seu pedido (opcional)</Label>
              <span className="text-xs text-muted-foreground">
                {userRequest.length}/{MAX_CHARS}
              </span>
            </div>
            <Textarea
              id="user-request"
              placeholder={PLACEHOLDER}
              value={userRequest}
              onChange={(e) => setUserRequest(e.target.value.slice(0, MAX_CHARS))}
              rows={4}
              className="resize-none"
            />
            <p className="text-xs text-muted-foreground">
              Sem pedido específico, a IA mantém todo o conteúdo da arte original e aplica apenas
              as diretrizes do Diretor de Arte.
            </p>
          </div>

          <section className="space-y-2">
            <Label>Imagem de fundo (opcional)</Label>
            <input
              ref={inputRef}
              type="file"
              accept={ALLOWED_MIME.join(',')}
              hidden
              onChange={onInputChange}
            />
            {backgroundPreview ? (
              <div className="flex items-center gap-3 rounded-lg border border-border/60 bg-muted/30 p-3">
                <div className="relative h-16 w-16 flex-shrink-0 overflow-hidden rounded-md bg-background">
                  <Image
                    src={backgroundPreview}
                    alt={backgroundFileName ?? 'Fundo personalizado'}
                    fill
                    sizes="64px"
                    className="object-cover"
                    unoptimized
                  />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">
                    {backgroundFileName ?? 'Imagem de fundo'}
                  </p>
                  {isUploading ? (
                    <div className="mt-1 space-y-1">
                      <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                        <div
                          className="h-full bg-primary transition-all"
                          style={{ width: `${progress?.percentage ?? 0}%` }}
                        />
                      </div>
                      <p className="text-[11px] text-muted-foreground">
                        Enviando {progress?.percentage ?? 0}%
                      </p>
                    </div>
                  ) : backgroundUrl ? (
                    <p className="mt-0.5 inline-flex items-center gap-1 text-xs text-emerald-600">
                      <Check className="h-3 w-3" /> Pronto para usar
                    </p>
                  ) : null}
                </div>
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  className="h-7 w-7"
                  onClick={handleRemoveBackground}
                  title="Remover imagem"
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => inputRef.current?.click()}
                onDragOver={(e) => {
                  e.preventDefault()
                  setIsDragging(true)
                }}
                onDragLeave={() => setIsDragging(false)}
                onDrop={onDrop}
                className={cn(
                  'flex w-full flex-col items-center justify-center gap-1 rounded-lg border-2 border-dashed px-4 py-6 text-sm transition-colors',
                  'hover:border-primary/50 hover:bg-primary/5',
                  isDragging
                    ? 'border-primary bg-primary/5'
                    : 'border-border/60 bg-muted/20',
                )}
              >
                <Upload className="h-5 w-5 text-muted-foreground" />
                <span className="font-medium">Clique ou arraste uma imagem</span>
                <span className="text-xs text-muted-foreground">
                  Será usada como o novo fundo do criativo (max 10 MB)
                </span>
              </button>
            )}
          </section>

          <AssetGallery
            label="Logos do projeto (opcional)"
            emptyMessage="Nenhuma logo cadastrada nos Assets deste projeto."
            items={logos}
            isLoading={loadingLogos}
            selectedIds={selectedLogoIds}
            onToggle={toggleLogo}
            max={MAX_SELECTED_LOGOS}
          />

          <AssetGallery
            label="Elementos gráficos (opcional)"
            emptyMessage="Nenhum elemento cadastrado nos Assets deste projeto."
            items={elements}
            isLoading={loadingElements}
            selectedIds={selectedElementIds}
            onToggle={toggleElement}
            max={MAX_SELECTED_ELEMENTS}
          />
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={handleClose}>
            Cancelar
          </Button>
          <Button onClick={handleConfirm} disabled={isDisabled}>
            <Sparkles className="mr-2 h-4 w-4" />
            {ctaLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

interface AssetGalleryProps {
  label: string
  emptyMessage: string
  items: Array<{ id: number; name: string; fileUrl: string }>
  isLoading: boolean
  selectedIds: number[]
  onToggle: (id: number) => void
  max: number
}

function AssetGallery({
  label,
  emptyMessage,
  items,
  isLoading,
  selectedIds,
  onToggle,
  max,
}: AssetGalleryProps) {
  return (
    <section className="space-y-2">
      <div className="flex items-center justify-between">
        <Label>{label}</Label>
        <span className="text-xs text-muted-foreground">
          {selectedIds.length}/{max} selecionado{selectedIds.length === 1 ? '' : 's'}
          {items.length > 0 ? ` · ${items.length} disponíve${items.length === 1 ? 'l' : 'is'}` : ''}
        </span>
      </div>
      {isLoading ? (
        <GridSkeleton />
      ) : items.length === 0 ? (
        <p className="text-xs italic text-muted-foreground">{emptyMessage}</p>
      ) : (
        <div className="grid grid-cols-5 gap-2 sm:grid-cols-6">
          {items.map((item) => (
            <AssetThumbnail
              key={item.id}
              fileUrl={item.fileUrl}
              name={item.name}
              selected={selectedIds.includes(item.id)}
              onClick={() => onToggle(item.id)}
            />
          ))}
        </div>
      )}
    </section>
  )
}

function AssetThumbnail({
  fileUrl,
  name,
  selected,
  onClick,
}: {
  fileUrl: string
  name: string
  selected: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={name}
      className={cn(
        'relative aspect-square overflow-hidden rounded-md border-2 bg-muted/30 transition-all hover:border-primary/60',
        selected ? 'border-primary ring-2 ring-primary/30' : 'border-border/40',
      )}
    >
      <Image
        src={fileUrl}
        alt={name}
        fill
        sizes="80px"
        className="object-contain p-1"
        unoptimized
      />
      {selected && (
        <span className="absolute right-1 top-1 rounded-full bg-primary p-0.5 text-primary-foreground">
          <Check className="h-3 w-3" />
        </span>
      )}
    </button>
  )
}

function GridSkeleton() {
  return (
    <div className="grid grid-cols-5 gap-2 sm:grid-cols-6">
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="aspect-square animate-pulse rounded-md bg-muted" />
      ))}
    </div>
  )
}

