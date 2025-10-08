"use client"

import * as React from 'react'
import Image from 'next/image'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Sparkles, Loader2, Plus, Search, Wand2, Expand, HardDrive, X, Upload, Trash2, Copy, Check } from 'lucide-react'
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
import { usePhotoSwipe } from '@/hooks/use-photoswipe'
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

  const [mode, setMode] = React.useState<'generate' | 'library' | 'prompts'>('generate')
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

  // Inicializar PhotoSwipe
  usePhotoSwipe({
    gallerySelector: '#ai-images-gallery',
    childSelector: 'a',
    dependencies: [filteredImages.length, isLoading]
  })

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
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="generate" className="gap-2">
            <Sparkles className="h-3.5 w-3.5" />
            Gerar
          </TabsTrigger>
          <TabsTrigger value="library" className="gap-2">
            Biblioteca ({aiImages.length})
          </TabsTrigger>
          <TabsTrigger value="prompts" className="gap-2">
            Prompts
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
              <div id="ai-images-gallery" className="grid grid-cols-2 gap-3 pb-4">
                {filteredImages.map((image) => (
                  <ImageCard
                    key={image.id}
                    image={image}
                    projectId={projectId}
                    onAddToCanvas={() => handleAddToCanvas(image)}
                  />
                ))}
              </div>
            )}
          </ScrollArea>
        </TabsContent>

        <TabsContent value="prompts" className="mt-4 space-y-4">
          <PromptsLibrary projectId={projectId} />
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
  const [localFiles, setLocalFiles] = React.useState<File[]>([])
  const [isDriveModalOpen, setIsDriveModalOpen] = React.useState(false)
  const [isDragging, setIsDragging] = React.useState(false)
  const fileInputRef = React.useRef<HTMLInputElement>(null)

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

  const handleGenerate = async () => {
    if (!prompt.trim()) {
      toast({ variant: 'destructive', description: 'Digite um prompt' })
      return
    }

    if (!canPerformOperation('image_generation')) {
      toast({ variant: 'destructive', description: 'Créditos insuficientes' })
      return
    }

    try {
      // 1. Upload de arquivos locais para Vercel Blob (se houver)
      const localFileUrls: string[] = []
      if (localFiles.length > 0) {
        for (const file of localFiles) {
          const formData = new FormData()
          formData.append('file', file)

          const uploadResponse = await fetch('/api/upload', {
            method: 'POST',
            body: formData
          })

          if (!uploadResponse.ok) {
            throw new Error('Falha ao fazer upload da imagem local')
          }

          const { url } = await uploadResponse.json()
          localFileUrls.push(url)
        }
      }

      // 2. Converter GoogleDriveItem para URLs completas
      const baseUrl = window.location.origin
      const driveImageUrls = referenceImages.map(img => `${baseUrl}/api/google-drive/image/${img.id}`)

      // 3. Combinar todas as URLs
      const allImageUrls = [...driveImageUrls, ...localFileUrls]

      generateMutation.mutate({
        prompt: prompt.trim(),
        aspectRatio,
        referenceImages: allImageUrls
      })
    } catch (error) {
      toast({
        variant: 'destructive',
        description: error instanceof Error ? error.message : 'Erro ao processar imagens'
      })
    }
  }

  const handleRemoveReferenceImage = (id: string) => {
    setReferenceImages(prev => prev.filter(img => img.id !== id))
  }

  const handleRemoveLocalFile = (index: number) => {
    setLocalFiles(prev => prev.filter((_, i) => i !== index))
  }

  const handleFileSelect = (files: FileList | null) => {
    if (!files) return

    const imageFiles = Array.from(files).filter(file => file.type.startsWith('image/'))
    const totalImages = referenceImages.length + localFiles.length + imageFiles.length

    if (totalImages > 3) {
      toast({
        variant: 'destructive',
        description: 'Máximo de 3 imagens no total'
      })
      return
    }

    setLocalFiles(prev => [...prev, ...imageFiles].slice(0, 3 - referenceImages.length))
  }

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(true)
  }

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(false)
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(false)
    handleFileSelect(e.dataTransfer.files)
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
          {/* Preview das imagens selecionadas */}
          {(referenceImages.length > 0 || localFiles.length > 0) && (
            <div className="grid grid-cols-3 gap-2">
              {/* Imagens do Google Drive */}
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

              {/* Arquivos locais */}
              {localFiles.map((file, index) => (
                <div key={`local-${index}`} className="relative group">
                  <img
                    src={URL.createObjectURL(file)}
                    alt={file.name}
                    className="w-full h-20 object-cover rounded border"
                  />
                  <button
                    onClick={() => handleRemoveLocalFile(index)}
                    className="absolute top-1 right-1 bg-red-500 text-white rounded-full p-1 opacity-0 group-hover:opacity-100 transition-opacity"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Área de drag & drop */}
          <div
            className={cn(
              "border-2 border-dashed rounded-lg p-4 text-center cursor-pointer transition-colors",
              isDragging ? "border-primary bg-primary/5" : "border-border hover:border-primary/50",
              generateMutation.isPending && "opacity-50 cursor-not-allowed"
            )}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            onClick={() => !generateMutation.isPending && fileInputRef.current?.click()}
          >
            <Upload className="h-8 w-8 mx-auto mb-2 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">
              Arraste imagens aqui ou clique para selecionar
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              {referenceImages.length + localFiles.length}/3 imagens
            </p>
          </div>

          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            onChange={(e) => handleFileSelect(e.target.files)}
            disabled={generateMutation.isPending}
          />

          <Button
            variant="outline"
            size="sm"
            className="w-full"
            disabled={generateMutation.isPending || referenceImages.length + localFiles.length >= 3}
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
  projectId,
  onAddToCanvas
}: {
  image: AIImageRecord
  projectId: number | null | undefined
  onAddToCanvas: () => void
}) {
  const queryClient = useQueryClient()
  const { toast } = useToast()

  const deleteMutation = useMutation({
    mutationFn: async () => {
      const response = await fetch(`/api/projects/${projectId}/ai-images/${image.id}`, {
        method: 'DELETE',
      })
      if (!response.ok) throw new Error('Falha ao deletar imagem')
      return response.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ai-images', projectId] })
      toast({ description: 'Imagem deletada com sucesso' })
    },
    onError: () => {
      toast({
        description: 'Erro ao deletar imagem',
        variant: 'destructive'
      })
    }
  })

  const handleDelete = (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()

    if (confirm(`Deletar "${image.name}"?`)) {
      deleteMutation.mutate()
    }
  }

  return (
    <Card className="group relative overflow-hidden">
      {/* Link para PhotoSwipe */}
      <a
        href={image.fileUrl}
        data-pswp-width={image.width}
        data-pswp-height={image.height}
        target="_blank"
        rel="noopener noreferrer"
        className="block cursor-zoom-in"
      >
        <div className="aspect-square relative">
          <Image
            src={image.thumbnailUrl || image.fileUrl}
            alt={image.name}
            fill
            className="object-cover"
          />

          {/* Overlay no hover */}
          <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center pointer-events-none">
            <div className="flex gap-2 pointer-events-auto">
              <Button
                size="icon"
                variant="secondary"
                onClick={(e) => {
                  e.preventDefault()
                  e.stopPropagation()
                  onAddToCanvas()
                }}
                className="h-8 w-8"
                title="Adicionar ao canvas"
              >
                <Plus className="h-4 w-4" />
              </Button>
              <Button
                size="icon"
                variant="secondary"
                onClick={(e) => {
                  // Deixar o PhotoSwipe abrir
                }}
                className="h-8 w-8"
                title="Ver em tela cheia"
              >
                <Expand className="h-4 w-4" />
              </Button>
              <Button
                size="icon"
                variant="destructive"
                onClick={handleDelete}
                disabled={deleteMutation.isPending}
                className="h-8 w-8"
                title="Deletar imagem"
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>
      </a>

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


// Biblioteca de Prompts
interface PromptRecord {
  id: string
  title: string
  prompt: string
  category?: string
  createdAt: string
}

function PromptsLibrary({ projectId }: { projectId: number | null | undefined }) {
  const queryClient = useQueryClient()
  const { toast } = useToast()
  const [newPromptTitle, setNewPromptTitle] = React.useState("")
  const [newPromptText, setNewPromptText] = React.useState("")
  const [copiedId, setCopiedId] = React.useState<string | null>(null)

  // Buscar prompts do projeto
  const { data: prompts = [], isLoading } = useQuery<PromptRecord[]>({
    queryKey: ["prompts", projectId],
    queryFn: async () => {
      const response = await fetch(`/api/projects/${projectId}/prompts`)
      if (!response.ok) throw new Error("Falha ao carregar prompts")
      return response.json()
    },
    enabled: projectId !== null && projectId !== undefined,
  })

  // Criar prompt
  const createMutation = useMutation({
    mutationFn: async (data: { title: string; prompt: string }) => {
      const response = await fetch(`/api/projects/${projectId}/prompts`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      })
      if (!response.ok) throw new Error("Falha ao criar prompt")
      return response.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["prompts", projectId] })
      setNewPromptTitle("")
      setNewPromptText("")
      toast({ description: "Prompt salvo com sucesso" })
    },
    onError: () => {
      toast({ description: "Erro ao salvar prompt", variant: "destructive" })
    }
  })

  // Deletar prompt
  const deleteMutation = useMutation({
    mutationFn: async (promptId: string) => {
      const response = await fetch(`/api/projects/${projectId}/prompts/${promptId}`, {
        method: "DELETE",
      })
      if (!response.ok) throw new Error("Falha ao deletar prompt")
      return response.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["prompts", projectId] })
      toast({ description: "Prompt deletado com sucesso" })
    },
    onError: () => {
      toast({ description: "Erro ao deletar prompt", variant: "destructive" })
    }
  })

  const handleCreate = () => {
    if (!newPromptTitle.trim() || !newPromptText.trim()) {
      toast({ description: "Preencha título e prompt", variant: "destructive" })
      return
    }
    createMutation.mutate({ title: newPromptTitle, prompt: newPromptText })
  }

  const handleCopy = async (prompt: PromptRecord) => {
    try {
      await navigator.clipboard.writeText(prompt.prompt)
      setCopiedId(prompt.id)
      toast({ description: "Prompt copiado!" })
      setTimeout(() => setCopiedId(null), 2000)
    } catch (error) {
      toast({ description: "Erro ao copiar", variant: "destructive" })
    }
  }

  const handleDelete = (prompt: PromptRecord) => {
    if (confirm(`Deletar "${prompt.title}"?`)) {
      deleteMutation.mutate(prompt.id)
    }
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Formulário de criação */}
      <Card className="p-4 space-y-3">
        <h3 className="text-sm font-semibold">Novo Prompt</h3>
        <Input
          placeholder="Título do prompt..."
          value={newPromptTitle}
          onChange={(e) => setNewPromptTitle(e.target.value)}
        />
        <Textarea
          placeholder="Digite o prompt aqui..."
          value={newPromptText}
          onChange={(e) => setNewPromptText(e.target.value)}
          rows={4}
        />
        <Button
          onClick={handleCreate}
          disabled={createMutation.isPending || !newPromptTitle.trim() || !newPromptText.trim()}
          className="w-full"
        >
          {createMutation.isPending ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Salvando...
            </>
          ) : (
            <>
              <Plus className="mr-2 h-4 w-4" />
              Salvar Prompt
            </>
          )}
        </Button>
      </Card>

      {/* Lista de prompts */}
      <ScrollArea className="h-[calc(100vh-500px)]">
        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin" />
          </div>
        ) : prompts.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <p className="text-sm text-muted-foreground">
              Nenhum prompt salvo ainda
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              Crie seu primeiro prompt acima
            </p>
          </div>
        ) : (
          <div className="space-y-3 pb-4">
            {prompts.map((prompt) => (
              <Card key={prompt.id} className="p-3 space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <h4 className="text-sm font-semibold flex-1">{prompt.title}</h4>
                  <div className="flex gap-1">
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-7 w-7"
                      onClick={() => handleCopy(prompt)}
                      title="Copiar prompt"
                    >
                      {copiedId === prompt.id ? (
                        <Check className="h-3.5 w-3.5 text-green-500" />
                      ) : (
                        <Copy className="h-3.5 w-3.5" />
                      )}
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-7 w-7"
                      onClick={() => handleDelete(prompt)}
                      disabled={deleteMutation.isPending}
                      title="Deletar prompt"
                    >
                      <Trash2 className="h-3.5 w-3.5 text-red-500" />
                    </Button>
                  </div>
                </div>
                <p className="text-xs text-muted-foreground line-clamp-3">
                  {prompt.prompt}
                </p>
              </Card>
            ))}
          </div>
        )}
      </ScrollArea>
    </div>
  )
}
