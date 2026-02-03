'use client'

import * as React from 'react'
import Image from 'next/image'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Wand2, Loader2, X, Plus, Sparkles, ImagePlus } from 'lucide-react'
import { toast } from 'sonner'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { useCredits } from '@/hooks/use-credits'
import { useUploadImageToDrive } from '@/hooks/use-drive'
import { AIModelSelector, ResolutionSelector } from '@/components/ai/ai-model-selector'
import type { AIImageModel } from '@/lib/ai/image-models-config'
import { calculateCreditsForModel, AI_IMAGE_MODELS } from '@/lib/ai/image-models-config'
import { useImprovePrompt } from '@/hooks/use-improve-prompt'
import type { GoogleDriveItem } from '@/types/google-drive'

export interface PendingGeneration {
  id: string
  status: 'pending' | 'processing' | 'completed' | 'error'
  prompt: string
  sourceImage: {
    id: string
    name: string
    thumbnailUrl: string
  }
  resultImage?: {
    fileUrl: string
    name: string
  }
  error?: string
  createdAt: Date
}

interface DriveReferenceImage {
  id: string
  name: string
  thumbnailUrl: string
  fullUrl: string
}

interface AIEditModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  image: GoogleDriveItem | null
  projectId: number | null
  folderId: string | null
  onGenerationStart: (generation: PendingGeneration) => void
  onGenerationComplete: (id: string, result: { fileUrl: string; name: string }) => void
  onGenerationError: (id: string, error: string) => void
  initialReferenceImages?: GoogleDriveItem[]
}

export function AIEditModal({
  open,
  onOpenChange,
  image,
  projectId,
  folderId,
  onGenerationStart,
  onGenerationComplete,
  onGenerationError,
  initialReferenceImages = [],
}: AIEditModalProps) {
  const { credits, refresh: refreshCredits } = useCredits()
  const queryClient = useQueryClient()
  const uploadToDrive = useUploadImageToDrive()
  const improvePrompt = useImprovePrompt()

  const [prompt, setPrompt] = React.useState('')
  const [selectedModel, setSelectedModel] = React.useState<AIImageModel>('nano-banana-pro')
  const [resolution, setResolution] = React.useState<'1K' | '2K' | '4K'>('2K')
  const [referenceImages, setReferenceImages] = React.useState<string[]>([]) // Uploaded images (URLs)
  const [driveReferenceImages, setDriveReferenceImages] = React.useState<DriveReferenceImage[]>([]) // Drive images
  const fileInputRef = React.useRef<HTMLInputElement>(null)

  // Reset state when modal opens with new image
  React.useEffect(() => {
    if (open && image) {
      setPrompt('')
      setReferenceImages([])
      // Initialize Drive reference images from selected items
      const driveRefs = initialReferenceImages.map((item) => {
        const resolvedId = item.shortcutDetails?.targetId ?? item.id
        return {
          id: item.id,
          name: item.name,
          thumbnailUrl: `/api/drive/thumbnail/${resolvedId}`,
          fullUrl: `${window.location.origin}/api/google-drive/image/${resolvedId}`,
        }
      })
      setDriveReferenceImages(driveRefs)
    }
  }, [open, image, initialReferenceImages])

  const resolvedFileId = image?.shortcutDetails?.targetId ?? image?.id
  const thumbnailUrl = resolvedFileId ? `/api/drive/thumbnail/${resolvedFileId}` : null
  const fullImageUrl = resolvedFileId ? `/api/google-drive/image/${resolvedFileId}` : null

  const creditsRequired = calculateCreditsForModel(selectedModel, resolution)
  const hasEnoughCredits = credits && credits.creditsRemaining >= creditsRequired

  const handleImprovePrompt = () => {
    if (!prompt.trim()) {
      toast.error('Digite uma descrição primeiro')
      return
    }
    if (!projectId) {
      toast.error('Projeto não identificado')
      return
    }
    improvePrompt.mutate(
      { prompt, projectId, aspectRatio: '9:16' },
      {
        onSuccess: (data) => {
          setPrompt(data.improvedPromptPt || data.improvedPrompt)
          toast.success('Descrição melhorada!')
        },
      }
    )
  }

  const handleAddReferenceImage = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    if (!file.type.startsWith('image/')) {
      toast.error('Selecione uma imagem válida')
      return
    }

    if (file.size > 10 * 1024 * 1024) {
      toast.error('Imagem muito grande (máx 10MB)')
      return
    }

    // Upload to get URL
    const formData = new FormData()
    formData.append('file', file)

    try {
      const response = await fetch('/api/upload', {
        method: 'POST',
        body: formData,
      })

      if (!response.ok) throw new Error('Falha no upload')

      const { url } = await response.json()
      setReferenceImages((prev) => [...prev, url])
    } catch {
      toast.error('Erro ao fazer upload da imagem')
    }

    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
  }

  const handleRemoveReference = (index: number) => {
    setReferenceImages((prev) => prev.filter((_, i) => i !== index))
  }

  const handleRemoveDriveReference = (id: string) => {
    setDriveReferenceImages((prev) => prev.filter((img) => img.id !== id))
  }

  const handleGenerate = async () => {
    if (!prompt.trim()) {
      toast.error('Digite um prompt para gerar a imagem')
      return
    }

    if (!projectId) {
      toast.error('Projeto não identificado')
      return
    }

    if (!fullImageUrl || !image) {
      toast.error('Imagem não encontrada')
      return
    }

    if (!hasEnoughCredits) {
      toast.error(`Créditos insuficientes (necessário: ${creditsRequired})`)
      return
    }

    // Create pending generation
    const generationId = `gen-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
    const pendingGeneration: PendingGeneration = {
      id: generationId,
      status: 'pending',
      prompt,
      sourceImage: {
        id: image.id,
        name: image.name,
        thumbnailUrl: thumbnailUrl || '',
      },
      createdAt: new Date(),
    }

    // Notify parent and close modal
    onGenerationStart(pendingGeneration)
    onOpenChange(false)

    // Start generation in background
    try {
      // Convert relative URL to absolute URL for API
      const absoluteBaseImageUrl = fullImageUrl
        ? `${window.location.origin}${fullImageUrl}`
        : null

      // Combine uploaded reference images with Drive reference images
      const allReferenceImages = [
        ...referenceImages, // Already public URLs
        ...driveReferenceImages.map((img) => img.fullUrl), // Drive URLs (will be processed by API)
      ]

      const payload = {
        projectId,
        prompt,
        aspectRatio: '9:16',
        referenceImages: allReferenceImages,
        model: selectedModel,
        resolution,
        mode: 'edit' as const,
        baseImage: absoluteBaseImageUrl,
      }

      const response = await fetch('/api/ai/generate-image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })

      if (!response.ok) {
        const error = await response.json().catch(() => ({}))
        throw new Error(error.error || error.message || 'Falha ao gerar imagem')
      }

      const result = await response.json()

      // Upload to Drive if folder is available
      if (folderId && result.fileUrl) {
        try {
          await uploadToDrive.mutateAsync({
            imageUrl: result.fileUrl,
            folderId,
            fileName: result.name,
          })
        } catch (uploadError) {
          console.error('[AIEditModal] Drive upload failed:', uploadError)
          // Continue even if Drive upload fails
        }
      }

      // Refresh credits and AI images
      refreshCredits()
      queryClient.invalidateQueries({ queryKey: ['ai-images', projectId] })
      queryClient.invalidateQueries({ queryKey: ['drive', 'files'] })

      onGenerationComplete(generationId, {
        fileUrl: result.fileUrl,
        name: result.name,
      })

      toast.success('Imagem gerada com sucesso!')
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Erro ao gerar imagem'
      onGenerationError(generationId, message)
      toast.error(message)
    }
  }

  if (!image) return null

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] flex flex-col gap-0 p-0">
        <DialogHeader className="flex-shrink-0 p-6 pb-4">
          <DialogTitle className="flex items-center gap-2">
            <Wand2 className="h-5 w-5" />
            Editar com IA
          </DialogTitle>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto px-6">
          <div className="space-y-6 pb-4">
            {/* Source Image */}
            <div className="space-y-2">
              <label className="text-sm font-medium text-muted-foreground">
                Imagem Original
              </label>
              <div className="relative aspect-[4/5] max-w-[200px] rounded-lg overflow-hidden border bg-muted">
                {thumbnailUrl && (
                  <Image
                    src={thumbnailUrl}
                    alt={image.name}
                    fill
                    className="object-cover"
                    unoptimized
                  />
                )}
              </div>
              <p className="text-xs text-muted-foreground truncate max-w-[200px]">
                {image.name}
              </p>
            </div>

            {/* Reference Images */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-sm font-medium text-muted-foreground">
                  Imagens de Referência {driveReferenceImages.length > 0 && `(${driveReferenceImages.length + referenceImages.length})`}
                </label>
                {driveReferenceImages.length > 0 && (
                  <span className="text-xs text-muted-foreground">
                    Selecionadas do Drive
                  </span>
                )}
              </div>
              <div className="flex flex-wrap gap-2">
                {/* Drive Reference Images */}
                {driveReferenceImages.map((img) => (
                  <div
                    key={img.id}
                    className="relative h-16 w-16 rounded-md overflow-hidden border-2 border-primary/50 group"
                    title={img.name}
                  >
                    <Image
                      src={img.thumbnailUrl}
                      alt={img.name}
                      fill
                      className="object-cover"
                      unoptimized
                    />
                    <button
                      type="button"
                      onClick={() => handleRemoveDriveReference(img.id)}
                      className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center"
                    >
                      <X className="h-4 w-4 text-white" />
                    </button>
                  </div>
                ))}
                {/* Uploaded Reference Images */}
                {referenceImages.map((url, index) => (
                  <div
                    key={`upload-${index}`}
                    className="relative h-16 w-16 rounded-md overflow-hidden border group"
                  >
                    <Image
                      src={url}
                      alt={`Referência ${index + 1}`}
                      fill
                      className="object-cover"
                      unoptimized
                    />
                    <button
                      type="button"
                      onClick={() => handleRemoveReference(index)}
                      className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center"
                    >
                      <X className="h-4 w-4 text-white" />
                    </button>
                  </div>
                ))}
                {/* Add Button */}
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="h-16 w-16 rounded-md border-2 border-dashed border-muted-foreground/30 flex items-center justify-center hover:border-primary/50 hover:bg-muted/50 transition-colors"
                  title="Adicionar imagem de referência"
                >
                  <Plus className="h-5 w-5 text-muted-foreground" />
                </button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  onChange={handleAddReferenceImage}
                  className="hidden"
                />
              </div>
            </div>

            {/* Prompt */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-sm font-medium text-muted-foreground">
                  Prompt
                </label>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={handleImprovePrompt}
                  disabled={improvePrompt.isPending || !prompt.trim()}
                  className="h-7 text-xs"
                >
                  {improvePrompt.isPending ? (
                    <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                  ) : (
                    <Sparkles className="h-3 w-3 mr-1" />
                  )}
                  Melhorar
                </Button>
              </div>
              <Textarea
                placeholder="Descreva como você quer editar a imagem..."
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                rows={4}
                className="resize-none"
              />
            </div>

            {/* Model & Resolution */}
            <div className="grid grid-cols-2 gap-4">
              <AIModelSelector
                value={selectedModel}
                onValueChange={setSelectedModel}
                filterByEditing
              />
              <ResolutionSelector
                value={resolution}
                onValueChange={setResolution}
                model={selectedModel}
              />
            </div>

            {/* Credits Info */}
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">
                Custo: <strong>{creditsRequired} créditos</strong>
              </span>
              <span className={hasEnoughCredits ? 'text-muted-foreground' : 'text-destructive'}>
                Disponível: {credits?.creditsRemaining ?? 0} créditos
              </span>
            </div>
          </div>
        </div>

        {/* Actions */}
        <div className="flex justify-end gap-2 p-6 pt-4 border-t flex-shrink-0">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button
            onClick={handleGenerate}
            disabled={!prompt.trim() || !hasEnoughCredits}
          >
            <ImagePlus className="h-4 w-4 mr-2" />
            Gerar Imagem
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
