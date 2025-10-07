"use client"

import * as React from 'react'
import Image from 'next/image'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Sparkles, Loader2, Plus, Search, Wand2, Expand, HardDrive, X } from 'lucide-react'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Card } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useTemplateEditor, createDefaultLayer } from '@/contexts/template-editor-context'
import { useToast } from '@/hooks/use-toast'
import { useCredits } from '@/hooks/use-credits'
import { useProject } from '@/hooks/use-project'
import { cn } from '@/lib/utils'
import type { GoogleDriveItem } from '@/types/google-drive'
import { DesktopGoogleDriveModal } from '@/components/projects/google-drive-folder-selector'

interface AIImageRecord {
  id: string
  name: string
  prompt: string
  mode: 'GENERATE' | 'EDIT' | 'OUTPAINT'
  fileUrl: string
  thumbnailUrl: string | null
  width: number
  height: number
  aspectRatio: string
  createdAt: string
}

export function AIImagesPanel() {
  const { addLayer, projectId, design } = useTemplateEditor()
  const { toast } = useToast()

  const [mode, setMode] = React.useState<'generate' | 'library'>('generate')
  const [search, setSearch] = React.useState('')

  // Buscar imagens IA do projeto
  const { data: aiImages = [], isLoading } = useQuery<AIImageRecord[]>({
    queryKey: ['ai-images', projectId],
    queryFn: async () => {
      const response = await fetch(`/api/projects/${projectId}/ai-images`)
      if (!response.ok) throw new Error('Falha ao carregar imagens IA')
      return response.json()
    },
    enabled: projectId !== null && projectId !== undefined,
  })

  // Filtrar por busca
  const filteredImages = React.useMemo(() => {
    if (!search) return aiImages
    const query = search.toLowerCase()
    return aiImages.filter(img =>
      img.name.toLowerCase().includes(query) ||
      img.prompt.toLowerCase().includes(query)
    )
  }, [aiImages, search])

  // Handler para adicionar imagem ao canvas
  const handleAddToCanvas = (image: AIImageRecord) => {
    const layer = createDefaultLayer('image')
    layer.name = image.name
    layer.fileUrl = image.fileUrl
    layer.size = { width: image.width, height: image.height }
    layer.position = { x: 50, y: 50 }

    addLayer(layer)
    toast({ description: `${image.name} adicionado ao canvas` })
  }

  return (
    <div className="flex h-full flex-col gap-3">
      {/* Header com tabs */}
      <Tabs value={mode} onValueChange={(v) => setMode(v as typeof mode)} className="w-full">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="generate" className="gap-2">
            <Sparkles className="h-3.5 w-3.5" />
            Gerar
          </TabsTrigger>
          <TabsTrigger value="library" className="gap-2">
            Biblioteca ({aiImages.length})
          </TabsTrigger>
        </TabsList>

        <TabsContent value="generate" className="mt-4 space-y-4">
          <GenerateImageForm projectId={projectId} />
        </TabsContent>

        <TabsContent value="library" className="mt-4 space-y-4">
          {/* Busca */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Buscar por nome ou prompt..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>

          {/* Grid de imagens */}
          <ScrollArea className="h-[calc(100vh-300px)]">
            {isLoading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-6 w-6 animate-spin" />
              </div>
            ) : filteredImages.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <Sparkles className="mb-2 h-12 w-12 text-muted-foreground/40" />
                <p className="text-sm text-muted-foreground">
                  {search ? 'Nenhuma imagem encontrada' : 'Nenhuma imagem IA gerada ainda'}
                </p>
                {!search && (
                  <p className="mt-1 text-xs text-muted-foreground">
                    Use a aba &quot;Gerar&quot; para criar sua primeira imagem
                  </p>
                )}
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-3 pb-4">
                {filteredImages.map((image) => (
                  <ImageCard
                    key={image.id}
                    image={image}
                    onAddToCanvas={() => handleAddToCanvas(image)}
                  />
                ))}
              </div>
            )}
          </ScrollArea>
        </TabsContent>
      </Tabs>
    </div>
  )
}

// Componente de formulário de geração
function GenerateImageForm({ projectId }: { projectId: number | null | undefined }) {
  const { toast } = useToast()
  const { canPerformOperation, getCost, refresh } = useCredits()
  const queryClient = useQueryClient()
  const { addLayer } = useTemplateEditor()
  const { data: project } = useProject(projectId)

  const [prompt, setPrompt] = React.useState('')
  const [aspectRatio, setAspectRatio] = React.useState('1:1')
  const [referenceImages, setReferenceImages] = React.useState<GoogleDriveItem[]>([])
  const [isDriveModalOpen, setIsDriveModalOpen] = React.useState(false)

  const generateMutation = useMutation({
    mutationFn: async (data: { prompt: string; aspectRatio: string; referenceImages: string[] }) => {
      const response = await fetch('/api/ai/generate-image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectId,
          prompt: data.prompt,
          aspectRatio: data.aspectRatio,
          referenceImages: data.referenceImages,
        }),
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || 'Falha ao gerar imagem')
      }

      return response.json()
    },
    onSuccess: (data) => {
      toast({ description: 'Imagem gerada com sucesso!' })
      queryClient.invalidateQueries({ queryKey: ['ai-images', projectId] })
      refresh() // Atualizar créditos
      setPrompt('')
      setReferenceImages([]) // Limpar imagens de referência

      // Adicionar automaticamente ao canvas
      const layer = createDefaultLayer('image')
      layer.name = data.name
      layer.fileUrl = data.fileUrl
      layer.size = { width: data.width, height: data.height }
      layer.position = { x: 50, y: 50 }
      addLayer(layer)
    },
    onError: (error: Error) => {
      toast({
        variant: 'destructive',
        description: error.message,
      })
    },
  })

  const handleGenerate = () => {
    if (!prompt.trim()) {
      toast({ variant: 'destructive', description: 'Digite um prompt' })
      return
    }

    if (!canPerformOperation('image_generation')) {
      toast({ variant: 'destructive', description: 'Créditos insuficientes' })
      return
    }

    // Converter GoogleDriveItem para URLs das imagens
    const imageUrls = referenceImages.map(img => `/api/google-drive/image/${img.id}`)

    generateMutation.mutate({
      prompt: prompt.trim(),
      aspectRatio,
      referenceImages: imageUrls
    })
  }

  const handleRemoveReferenceImage = (id: string) => {
    setReferenceImages(prev => prev.filter(img => img.id !== id))
  }

  const cost = getCost('image_generation')

  return (
    <Card className="p-4 space-y-4">
      <div className="space-y-2">
        <label className="text-sm font-medium">Prompt</label>
        <Textarea
          placeholder="Descreva a imagem que deseja gerar..."
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          rows={3}
          disabled={generateMutation.isPending}
        />
      </div>

      <div className="space-y-2">
        <label className="text-sm font-medium">Proporção</label>
        <div className="grid grid-cols-4 gap-2">
          {['1:1', '16:9', '9:16', '4:5'].map((ratio) => (
            <Button
              key={ratio}
              variant={aspectRatio === ratio ? 'default' : 'outline'}
              size="sm"
              onClick={() => setAspectRatio(ratio)}
              className="text-xs"
              disabled={generateMutation.isPending}
            >
              {ratio}
            </Button>
          ))}
        </div>
      </div>

      <div className="space-y-2">
        <label className="text-sm font-medium">Imagens de Referência (opcional)</label>
        <div className="space-y-2">
          {referenceImages.length > 0 && (
            <div className="grid grid-cols-3 gap-2">
              {referenceImages.map((img, index) => (
                <div key={`ref-${img.id}-${index}`} className="relative group">
                  <img
                    src={`/api/google-drive/thumbnail/${img.id}`}
                    alt={img.name}
                    className="w-full h-20 object-cover rounded border"
                  />
                  <button
                    onClick={() => handleRemoveReferenceImage(img.id)}
                    className="absolute top-1 right-1 bg-red-500 text-white rounded-full p-1 opacity-0 group-hover:opacity-100 transition-opacity"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </div>
              ))}
            </div>
          )}
          <Button
            variant="outline"
            size="sm"
            className="w-full"
            disabled={generateMutation.isPending}
            onClick={() => setIsDriveModalOpen(true)}
          >
            <HardDrive className="mr-2 h-4 w-4" />
            Selecionar do Google Drive ({referenceImages.length}/3)
          </Button>

          <DesktopGoogleDriveModal
            open={isDriveModalOpen}
            onOpenChange={setIsDriveModalOpen}
            mode="images"
            initialFolderId={project?.googleDriveFolderId ?? undefined}
            initialFolderName={project?.googleDriveFolderName ?? undefined}
            onSelect={() => {}} // Not used in multi-select mode
            multiSelect={true}
            maxSelection={3}
            selectedItems={referenceImages}
            onMultiSelectConfirm={(items) => {
              setReferenceImages(items)
              setIsDriveModalOpen(false)
            }}
          />
        </div>
      </div>

      <div className="flex items-center justify-between pt-2">
        <span className="text-xs text-muted-foreground">
          Custo: {cost} {cost === 1 ? 'crédito' : 'créditos'}
        </span>
        <Button
          onClick={handleGenerate}
          disabled={!prompt.trim() || generateMutation.isPending || !canPerformOperation('image_generation')}
        >
          {generateMutation.isPending ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Gerando...
            </>
          ) : (
            <>
              <Sparkles className="mr-2 h-4 w-4" />
              Gerar Imagem
            </>
          )}
        </Button>
      </div>
    </Card>
  )
}

// Card individual de imagem
function ImageCard({
  image,
  onAddToCanvas
}: {
  image: AIImageRecord
  onAddToCanvas: () => void
}) {
  return (
    <Card className="group relative overflow-hidden cursor-pointer" onClick={onAddToCanvas}>
      <div className="aspect-square relative">
        <Image
          src={image.thumbnailUrl || image.fileUrl}
          alt={image.name}
          fill
          className="object-cover"
        />

        {/* Overlay no hover */}
        <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
          <Button
            size="sm"
            onClick={(e) => {
              e.stopPropagation()
              onAddToCanvas()
            }}
            className="gap-2"
          >
            <Plus className="h-4 w-4" />
            Adicionar
          </Button>
        </div>
      </div>

      <div className="p-2">
        <p className="text-xs font-medium truncate">{image.name}</p>
        <p className="text-[10px] text-muted-foreground truncate mt-0.5">
          {image.prompt}
        </p>
        <div className="flex items-center gap-2 mt-1">
          <span className="text-[9px] text-muted-foreground">
            {image.aspectRatio}
          </span>
          {image.mode === 'EDIT' && (
            <Wand2 className="h-3 w-3 text-purple-500" />
          )}
          {image.mode === 'OUTPAINT' && (
            <Expand className="h-3 w-3 text-blue-500" />
          )}
        </div>
      </div>
    </Card>
  )
}
