"use client"

import * as React from 'react'
import Image from 'next/image'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Sparkles, Loader2, Plus, Search, Wand2, Expand, HardDrive, X, Upload, Trash2, Copy, Check, BookmarkPlus } from 'lucide-react'
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Badge } from '@/components/ui/badge'
import { usePrompts } from '@/hooks/use-prompts'
import type { Prompt } from '@/types/prompt'
import { copyToClipboard } from '@/lib/copy-to-clipboard'

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
  const { addLayer, projectId } = useTemplateEditor()
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
  const driveFolderId =
    project?.googleDriveImagesFolderId ?? project?.googleDriveFolderId ?? null
  const driveFolderName =
    project?.googleDriveImagesFolderName ?? project?.googleDriveFolderName ?? null

  const [prompt, setPrompt] = React.useState('')
  const [aspectRatio, setAspectRatio] = React.useState('1:1')
  const [referenceImages, setReferenceImages] = React.useState<GoogleDriveItem[]>([])
  const [localFiles, setLocalFiles] = React.useState<File[]>([])
  const [isDriveModalOpen, setIsDriveModalOpen] = React.useState(false)
  const [isDragging, setIsDragging] = React.useState(false)
  const [selectedPromptId, setSelectedPromptId] = React.useState<string>('')
  const fileInputRef = React.useRef<HTMLInputElement>(null)

  // Buscar prompts globais do usuário
  const { data: prompts = [] } = usePrompts()

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

    if (!projectId) {
      toast({ variant: 'destructive', description: 'Erro: projeto não identificado' })
      return
    }

    if (!canPerformOperation('ai_image_generation')) {
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
    } catch (_error) {
      toast({
        variant: 'destructive',
        description: _error instanceof Error ? _error.message : 'Erro ao processar imagens'
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

  const handlePromptSelect = (promptId: string) => {
    if (promptId === 'none') {
      setSelectedPromptId('')
      return
    }

    const selectedPrompt = prompts.find(p => p.id === promptId)
    if (selectedPrompt) {
      setPrompt(selectedPrompt.content)
      setSelectedPromptId(promptId)
    }
  }

  const handleSaveAsPrompt = () => {
    if (!prompt.trim()) {
      toast({ variant: 'destructive', description: 'Digite um prompt primeiro' })
      return
    }
    // Abrir página de prompts em nova aba com o conteúdo pré-preenchido
    const url = `/prompts?content=${encodeURIComponent(prompt)}`
    window.open(url, '_blank')
  }

  const cost = getCost('ai_image_generation')

  return (
    <Card className="p-4 space-y-4">
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <label className="text-sm font-medium">Prompt</label>
          <div className="flex gap-2">
            {prompts.length > 0 && (
              <Select value={selectedPromptId || 'none'} onValueChange={handlePromptSelect}>
                <SelectTrigger className="h-7 w-[140px] text-xs">
                  <SelectValue placeholder="Usar salvo" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Nenhum</SelectItem>
                  {prompts.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.title}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            <Button
              variant="ghost"
              size="sm"
              onClick={handleSaveAsPrompt}
              disabled={!prompt.trim()}
              className="h-7 gap-1 text-xs"
              title="Salvar como prompt"
            >
              <BookmarkPlus className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
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
              {referenceImages.map((refImg, index) => (
                <div key={`ref-${refImg.id}-${index}`} className="relative group">
                  <div className="relative w-full h-20 rounded border overflow-hidden">
                    <Image
                      src={`/api/google-drive/thumbnail/${refImg.id}`}
                      alt={refImg.name}
                      fill
                      className="object-cover"
                      unoptimized
                      onError={(e) => {
                        // Fallback to full image if thumbnail fails
                        const imgElement = e.currentTarget
                        imgElement.src = `/api/google-drive/image/${refImg.id}`
                      }}
                    />
                  </div>
                  <button
                    onClick={() => handleRemoveReferenceImage(refImg.id)}
                    className="absolute top-1 right-1 bg-red-500 text-white rounded-full p-1 opacity-0 group-hover:opacity-100 transition-opacity"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </div>
              ))}

              {/* Arquivos locais */}
              {localFiles.map((file, index) => (
                <div key={`local-${index}`} className="relative group">
                  <div className="relative w-full h-20 rounded border overflow-hidden">
                    <Image
                      src={URL.createObjectURL(file)}
                      alt={file.name}
                      fill
                      className="object-cover"
                      unoptimized
                    />
                  </div>
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
            initialFolderId={driveFolderId ?? undefined}
            initialFolderName={driveFolderName ?? undefined}
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
          disabled={!prompt.trim() || generateMutation.isPending || !canPerformOperation('ai_image_generation')}
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

  const handleDelete = (_e: React.MouseEvent) => {
    _e.preventDefault()
    _e.stopPropagation()

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
                onClick={(_e) => {
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


// Biblioteca de Prompts Globais
function PromptsLibrary({ projectId: _projectId }: { projectId: number | null | undefined }) {
  const { toast } = useToast()
  const [copiedId, setCopiedId] = React.useState<string | null>(null)
  const [selectedPrompt, setSelectedPrompt] = React.useState<Prompt | null>(null)
  const [searchQuery, setSearchQuery] = React.useState('')

  // Buscar prompts globais do usuário
  const { data: prompts = [], isLoading } = usePrompts()

  // Filtrar prompts por busca
  const filteredPrompts = React.useMemo(() => {
    if (!searchQuery) return prompts
    const query = searchQuery.toLowerCase()
    return prompts.filter(
      p => p.title.toLowerCase().includes(query) ||
           p.content.toLowerCase().includes(query) ||
           p.tags.some(tag => tag.toLowerCase().includes(query))
    )
  }, [prompts, searchQuery])

  const handleCopy = async (promptContent: string, promptId: string) => {
    try {
      await copyToClipboard(promptContent)
      setCopiedId(promptId)
      toast({ description: "Prompt copiado para a área de transferência!" })
      setTimeout(() => setCopiedId(null), 2000)
    } catch (_error) {
      console.warn('[PromptsLibrary] Failed to copy prompt', _error)
      toast({ description: "Erro ao copiar automaticamente. Copie manualmente o prompt.", variant: "destructive" })
    }
  }

  const handleViewPrompt = (prompt: Prompt) => {
    setSelectedPrompt(prompt)
  }

  const handleCloseDialog = () => {
    setSelectedPrompt(null)
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Header com busca */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold">Prompts Salvos</h3>
          <Button
            size="sm"
            variant="outline"
            onClick={() => window.open('/prompts', '_blank')}
            className="h-7 text-xs"
          >
            <Plus className="mr-1 h-3 w-3" />
            Gerenciar
          </Button>
        </div>

        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Buscar prompts..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-8 h-8 text-xs"
          />
        </div>
      </div>

      {/* Lista de prompts */}
      <ScrollArea className="h-[calc(100vh-350px)]">
        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin" />
          </div>
        ) : filteredPrompts.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <p className="text-sm text-muted-foreground">
              {searchQuery ? 'Nenhum prompt encontrado' : 'Nenhum prompt salvo ainda'}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              {searchQuery
                ? 'Tente outro termo de busca'
                : 'Crie prompts na página de Prompts'}
            </p>
            {!searchQuery && (
              <Button
                size="sm"
                variant="outline"
                onClick={() => window.open('/prompts', '_blank')}
                className="mt-3"
              >
                <Plus className="mr-2 h-4 w-4" />
                Criar Prompt
              </Button>
            )}
          </div>
        ) : (
          <div className="space-y-2 pb-4">
            {filteredPrompts.map((prompt) => {
              const isCopied = copiedId === prompt.id

              return (
                <Card
                  key={prompt.id}
                  className="cursor-pointer hover:bg-accent/50 transition-colors"
                  onClick={() => handleViewPrompt(prompt)}
                >
                  <div className="p-3 space-y-2">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <h4 className="text-sm font-semibold break-words">{prompt.title}</h4>
                        {prompt.category && (
                          <span className="text-xs text-muted-foreground">
                            {prompt.category}
                          </span>
                        )}
                      </div>
                      <div className="flex gap-1 shrink-0">
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-7 w-7"
                          onClick={(e) => {
                            e.stopPropagation()
                            handleCopy(prompt.content, prompt.id)
                          }}
                          title="Copiar prompt"
                        >
                          {isCopied ? (
                            <Check className="h-3.5 w-3.5 text-green-500" />
                          ) : (
                            <Copy className="h-3.5 w-3.5" />
                          )}
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-7 w-7"
                          onClick={(e) => {
                            e.stopPropagation()
                            handleViewPrompt(prompt)
                          }}
                          title="Visualizar prompt completo"
                        >
                          <Expand className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </div>

                    <p className="text-xs text-muted-foreground break-words line-clamp-3 leading-relaxed">
                      {prompt.content}
                    </p>

                    {prompt.tags.length > 0 && (
                      <div className="flex flex-wrap gap-1">
                        {prompt.tags.slice(0, 3).map((tag) => (
                          <span
                            key={tag}
                            className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] bg-secondary text-secondary-foreground"
                          >
                            {tag}
                          </span>
                        ))}
                        {prompt.tags.length > 3 && (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] bg-secondary text-secondary-foreground">
                            +{prompt.tags.length - 3}
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                </Card>
              )
            })}
          </div>
        )}
      </ScrollArea>

      {/* Dialog de visualização */}
      <Dialog open={selectedPrompt !== null} onOpenChange={handleCloseDialog}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-hidden">
          <DialogHeader>
            <DialogTitle className="flex items-start gap-3 pr-8">
              <span className="break-words flex-1">{selectedPrompt?.title}</span>
              {selectedPrompt?.category && (
                <Badge variant="outline" className="shrink-0">{selectedPrompt.category}</Badge>
              )}
            </DialogTitle>
            <DialogDescription>
              Visualize e copie o conteúdo completo do prompt
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 mt-4">
            <div className="relative rounded-lg border bg-muted/30 max-h-[50vh] overflow-y-auto">
              <div className="p-6 pr-24">
                <p className="text-sm leading-relaxed whitespace-pre-wrap break-words">
                  {selectedPrompt?.content}
                </p>
              </div>

              <div className="sticky top-2 right-2 float-right mr-2">
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => selectedPrompt && handleCopy(selectedPrompt.content, selectedPrompt.id)}
                  className="gap-2 shadow-lg"
                >
                  {selectedPrompt && copiedId === selectedPrompt.id ? (
                    <>
                      <Check className="h-4 w-4" />
                      Copiado
                    </>
                  ) : (
                    <>
                      <Copy className="h-4 w-4" />
                      Copiar
                    </>
                  )}
                </Button>
              </div>
            </div>

            {selectedPrompt?.tags && selectedPrompt.tags.length > 0 && (
              <div className="space-y-2">
                <h4 className="text-sm font-semibold">Tags</h4>
                <div className="flex flex-wrap gap-2">
                  {selectedPrompt.tags.map((tag) => (
                    <Badge key={tag} variant="secondary" className="text-xs">
                      {tag}
                    </Badge>
                  ))}
                </div>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
