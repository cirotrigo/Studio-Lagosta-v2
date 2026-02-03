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
import { useImprovePrompt } from '@/hooks/use-improve-prompt'
import type { Prompt } from '@/types/prompt'
import { copyToClipboard } from '@/lib/copy-to-clipboard'
import { AIModelSelector, ResolutionSelector } from '@/components/ai/ai-model-selector'
import type { AIImageModel, AIImageMode } from '@/lib/ai/image-models-config'
import { calculateCreditsForModel, AI_IMAGE_MODELS } from '@/lib/ai/image-models-config'
import { SavePromptDialog } from '@/components/prompts/save-prompt-dialog'
import { ReferenceImagesGrid } from '@/components/prompts/reference-images-grid'

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
  model: string
  createdAt: string
}

// Visual representation of aspect ratios
function AspectRatioIcon({ ratio }: { ratio: string }) {
  const dimensions = {
    '1:1': 'w-4 h-4',      // Square
    '16:9': 'w-5 h-3',     // Landscape
    '9:16': 'w-3 h-5',     // Portrait/Stories
    '4:5': 'w-3.5 h-4',    // Slightly tall
  }

  return (
    <div className="flex items-center justify-center">
      <div
        className={cn(
          'border-2 border-current rounded-sm',
          dimensions[ratio as keyof typeof dimensions] || 'w-4 h-4'
        )}
      />
    </div>
  )
}

export function AIImagesPanel() {
  const { addLayer, projectId, design, pendingAIImageEdit, setPendingAIImageEdit } = useTemplateEditor()
  const { toast } = useToast()

  const [mode, setMode] = React.useState<'generate' | 'library' | 'prompts'>('generate')
  const [search, setSearch] = React.useState('')
  const [imageToEdit, setImageToEdit] = React.useState<AIImageRecord | null>(null)
  const [promptToApply, setPromptToApply] = React.useState<Prompt | null>(null)

  // Debug: verificar projectId
  React.useEffect(() => {
    console.log('[AIImagesPanel] projectId from context:', projectId, 'type:', typeof projectId)
  }, [projectId])

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

  // Função helper para calcular tamanho e posição com largura total do canvas e centralizada
  const calculateCanvasPlacement = (imageWidth: number, imageHeight: number) => {
    const canvasWidth = design.canvas.width
    const canvasHeight = design.canvas.height

    // Largura total do canvas
    const newWidth = canvasWidth

    // Altura proporcional mantendo aspect ratio
    const aspectRatio = imageWidth / imageHeight
    const newHeight = newWidth / aspectRatio

    // Centralizar verticalmente
    const x = 0
    const y = (canvasHeight - newHeight) / 2

    return {
      size: { width: newWidth, height: newHeight },
      position: { x, y }
    }
  }

  // Handler para adicionar imagem ao canvas
  const handleAddToCanvas = (image: AIImageRecord) => {
    const layer = createDefaultLayer('image')
    layer.name = image.name
    layer.fileUrl = image.fileUrl

    // Calcular tamanho e posição com largura total e centralizada
    const placement = calculateCanvasPlacement(image.width, image.height)
    layer.size = placement.size
    layer.position = placement.position

    addLayer(layer)
    toast({ description: `${image.name} adicionado ao canvas` })
  }

  // Handler para editar imagem
  const handleEditImage = (image: AIImageRecord) => {
    console.log('[AIImagesPanel] handleEditImage called with:', image)
    setImageToEdit(image)
    setMode('generate') // Mudar para a aba de geração
    toast({ description: 'Imagem carregada para edição' })
  }

  // Processar imagem pendente vinda de criativo
  React.useEffect(() => {
    if (pendingAIImageEdit) {
      console.log('[AIImagesPanel] Processing pendingAIImageEdit:', pendingAIImageEdit)

      // Converter para formato AIImageRecord
      const tempRecord: AIImageRecord = {
        id: `temp-${Date.now()}`,
        name: pendingAIImageEdit.name,
        prompt: 'Editar esta imagem com IA',
        mode: 'EDIT',
        fileUrl: pendingAIImageEdit.url,
        thumbnailUrl: pendingAIImageEdit.url,
        width: 1080,
        height: 1920,
        aspectRatio: '9:16',
        model: 'seedream-4', // Modelo padrão para edição
        createdAt: new Date().toISOString()
      }

      // Carregar para edição
      setImageToEdit(tempRecord)
      setMode('generate') // Ativa a aba "Gerar"

      // Limpar estado pendente
      setPendingAIImageEdit(null)

      toast({
        description: `Criativo "${pendingAIImageEdit.name}" carregado para edição com IA`
      })
    }
  }, [pendingAIImageEdit, setPendingAIImageEdit, toast])

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
          <GenerateImageForm
            projectId={projectId}
            imageToEdit={imageToEdit}
            onClearImageToEdit={() => setImageToEdit(null)}
            promptToApply={promptToApply}
            onPromptApplied={() => setPromptToApply(null)}
          />
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
                    onEditImage={() => handleEditImage(image)}
                  />
                ))}
              </div>
            )}
          </ScrollArea>
        </TabsContent>

        <TabsContent value="prompts" className="mt-4 space-y-4">
          <PromptsLibrary
            projectId={projectId}
            onApplyPrompt={(prompt) => {
              setPromptToApply(prompt)
              setMode('generate')
            }}
          />
        </TabsContent>
      </Tabs>
    </div>
  )
}

// Componente de formulário de geração
function GenerateImageForm({
  projectId,
  imageToEdit,
  onClearImageToEdit,
  promptToApply,
  onPromptApplied,
}: {
  projectId: number | null | undefined
  imageToEdit: AIImageRecord | null
  onClearImageToEdit: () => void
  promptToApply: Prompt | null
  onPromptApplied: () => void
}) {
  console.log('[GenerateImageForm] Component rendered with imageToEdit:', imageToEdit)

  const { toast } = useToast()
  const { credits, canPerformOperation, getCost, refresh } = useCredits()
  const queryClient = useQueryClient()
  const { addLayer, design } = useTemplateEditor()
  const { data: project } = useProject(projectId)
  const driveFolderId =
    project?.googleDriveImagesFolderId ?? project?.googleDriveFolderId ?? null
  const driveFolderName =
    project?.googleDriveImagesFolderName ?? project?.googleDriveFolderName ?? null

  const [prompt, setPrompt] = React.useState('') // Portuguese version for display
  const [promptEn, setPromptEn] = React.useState<string | null>(null) // English version for generation
  const [aspectRatio, setAspectRatio] = React.useState('9:16')
  const [selectedModel, setSelectedModel] = React.useState<AIImageModel>('flux-1.1-pro')
  const [resolution, setResolution] = React.useState<'1K' | '2K' | '4K' | undefined>('2K')
  const [referenceImages, setReferenceImages] = React.useState<GoogleDriveItem[]>([])
  const [localFiles, setLocalFiles] = React.useState<File[]>([])
  const [referenceUrls, setReferenceUrls] = React.useState<string[]>([])
  const [isDriveModalOpen, setIsDriveModalOpen] = React.useState(false)
  const [isDragging, setIsDragging] = React.useState(false)
  const [selectedPromptId, setSelectedPromptId] = React.useState<string>('')
  const fileInputRef = React.useRef<HTMLInputElement>(null)

  // Estados para edição de imagens
  const [mode, setMode] = React.useState<'generate' | 'edit'>('generate')
  const [baseImageFile, setBaseImageFile] = React.useState<File | null>(null)
  const [baseImagePreview, setBaseImagePreview] = React.useState<string | null>(null)
  const [baseImageUrl, setBaseImageUrl] = React.useState<string | null>(null)
  const [maskImageFile, setMaskImageFile] = React.useState<File | null>(null)
  const [maskImagePreview, setMaskImagePreview] = React.useState<string | null>(null)
  const baseImageInputRef = React.useRef<HTMLInputElement>(null)
  const maskImageInputRef = React.useRef<HTMLInputElement>(null)

  // Estados para salvar prompt após geração bem-sucedida
  const [lastGeneratedPrompt, setLastGeneratedPrompt] = React.useState<string>('')
  const [lastReferenceUrls, setLastReferenceUrls] = React.useState<string[]>([])
  const [showSavePromptDialog, setShowSavePromptDialog] = React.useState(false)

  // Buscar prompts globais do usuário
  const { data: prompts = [] } = usePrompts()

  // Hook para melhorar descrição
  const improvePrompt = useImprovePrompt()

  // Handler para melhorar descrição com IA
  const handleImprovePrompt = () => {
    if (!prompt.trim()) {
      toast({ variant: 'destructive', description: 'Digite uma descrição primeiro' })
      return
    }
    if (!projectId) {
      toast({ variant: 'destructive', description: 'Projeto não identificado' })
      return
    }
    improvePrompt.mutate(
      { prompt, projectId, aspectRatio: aspectRatio as '1:1' | '16:9' | '9:16' | '4:5' },
      {
        onSuccess: (data) => {
          // Display Portuguese version in textarea
          setPrompt(data.improvedPromptPt || data.improvedPrompt)
          // Store English version for image generation
          setPromptEn(data.improvedPromptEn || data.improvedPrompt)
          toast({ description: 'Descrição melhorada!' })
        },
      }
    )
  }

  // Debug: verificar estado do lastGeneratedPrompt
  React.useEffect(() => {
    console.log('[GenerateImageForm] Estado atual:', {
      lastGeneratedPrompt,
      mode,
      showButton: !!lastGeneratedPrompt && mode === 'generate'
    })
  }, [lastGeneratedPrompt, mode])

  // Efeito para carregar imageToEdit quando selecionada da biblioteca
  React.useEffect(() => {
    console.log('[GenerateImageForm] imageToEdit changed:', imageToEdit)

    if (imageToEdit) {
      console.log('[GenerateImageForm] Loading image for editing:', {
        fileUrl: imageToEdit.fileUrl,
        prompt: imageToEdit.prompt,
        aspectRatio: imageToEdit.aspectRatio,
        model: imageToEdit.model
      })

      // Mudar para modo edit
      setMode('edit')

      // Carregar a URL da imagem
      setBaseImageUrl(imageToEdit.fileUrl)
      setBaseImagePreview(imageToEdit.fileUrl)

      // Limpar o arquivo local (pois estamos usando URL direta)
      setBaseImageFile(null)

      // Preencher o prompt original (usuário pode modificar)
      setPrompt(imageToEdit.prompt)

      // Definir o aspect ratio original
      setAspectRatio(imageToEdit.aspectRatio)

      // Tentar definir o modelo original se ainda estiver disponível
      if (imageToEdit.model && imageToEdit.model in AI_IMAGE_MODELS) {
        const model = imageToEdit.model as AIImageModel
        const modelConfig = AI_IMAGE_MODELS[model]

        // Só usar o modelo se suportar edição
        if (modelConfig.capabilities.supportsImageEditing) {
          console.log('[GenerateImageForm] Using original model:', model)
          setSelectedModel(model)
        } else {
          // Se não suporta edição, usar Seedream 4 como padrão
          console.log('[GenerateImageForm] Model does not support editing, using seedream-4')
          setSelectedModel('seedream-4')
          toast({
            description: `Modelo original não suporta edição. Usando Seedream 4.`
          })
        }
      } else {
        console.log('[GenerateImageForm] Model not found or not specified, using default')
      }

      console.log('[GenerateImageForm] State updated:', {
        mode: 'edit',
        baseImageUrl: imageToEdit.fileUrl,
        baseImagePreview: imageToEdit.fileUrl,
        prompt: imageToEdit.prompt,
        aspectRatio: imageToEdit.aspectRatio
      })
    }
  }, [imageToEdit, toast])

  // Efeito para aplicar prompt salvo
  React.useEffect(() => {
    if (promptToApply) {
      console.log('[GenerateImageForm] Applying prompt:', promptToApply)
      setPrompt(promptToApply.content)
      setReferenceUrls(promptToApply.referenceImages)
      // Limpar outras referências
      setReferenceImages([])
      setLocalFiles([])
      // Notificar que o prompt foi aplicado
      onPromptApplied()
      toast({ description: 'Prompt aplicado com sucesso!' })
    }
  }, [promptToApply, onPromptApplied, toast])

  // Função helper para calcular tamanho e posição com largura total do canvas e centralizada
  const calculateCanvasPlacement = (imageWidth: number, imageHeight: number) => {
    const canvasWidth = design.canvas.width
    const canvasHeight = design.canvas.height

    // Largura total do canvas
    const newWidth = canvasWidth

    // Altura proporcional mantendo aspect ratio
    const aspectRatio = imageWidth / imageHeight
    const newHeight = newWidth / aspectRatio

    // Centralizar verticalmente
    const x = 0
    const y = (canvasHeight - newHeight) / 2

    return {
      size: { width: newWidth, height: newHeight },
      position: { x, y }
    }
  }

  const generateMutation = useMutation({
    mutationFn: async (data: {
      prompt: string
      aspectRatio: string
      referenceImages: string[]
      model: AIImageModel
      resolution?: '1K' | '2K' | '4K'
      mode: 'generate' | 'edit'
      baseImage?: string
      maskImage?: string
    }) => {
      // Validar projectId antes de enviar
      if (projectId === null || projectId === undefined) {
        throw new Error('Projeto não identificado. Por favor, recarregue a página.')
      }

      const payload = {
        projectId,
        prompt: data.prompt,
        aspectRatio: data.aspectRatio,
        referenceImages: data.referenceImages,
        model: data.model,
        resolution: data.resolution,
        mode: data.mode,
        baseImage: data.baseImage,
        maskImage: data.maskImage,
      }

      console.log('[AIImagesPanel] Sending request to /api/ai/generate-image with payload:', {
        ...payload,
        projectId: payload.projectId,
        mode: payload.mode,
        model: payload.model,
        hasBaseImage: !!payload.baseImage
      })

      const response = await fetch('/api/ai/generate-image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })

      console.log('[AIImagesPanel] Response status:', response.status, response.statusText)

      if (!response.ok) {
        let errorMessage = 'Falha ao gerar imagem'
        try {
          const error = await response.json()
          console.error('[AIImagesPanel] API Error Response:', error)
          errorMessage = error.error || error.message || error.detail || 'Erro desconhecido'

          // Se o erro ainda estiver vazio, usar uma mensagem padrão baseada no status
          if (!errorMessage || errorMessage === 'Erro desconhecido') {
            if (response.status === 400) {
              errorMessage = 'Dados inválidos enviados para o servidor'
            } else if (response.status === 401) {
              errorMessage = 'Não autorizado. Faça login novamente.'
            } else if (response.status === 402) {
              errorMessage = 'Créditos insuficientes'
            } else if (response.status === 404) {
              errorMessage = 'Projeto não encontrado'
            } else if (response.status === 500) {
              errorMessage = 'Erro interno do servidor'
            } else {
              errorMessage = `Erro HTTP ${response.status}`
            }
          }
        } catch (parseError) {
          console.error('[AIImagesPanel] Failed to parse error response:', parseError)
          const text = await response.text().catch(() => '')
          console.error('[AIImagesPanel] Error response text:', text)
          errorMessage = text || `HTTP ${response.status}: ${response.statusText}`
        }
        throw new Error(errorMessage)
      }

      return response.json()
    },
    onSuccess: (data, variables) => {
      toast({ description: mode === 'edit' ? 'Imagem editada com sucesso!' : 'Imagem gerada com sucesso!' })
      queryClient.invalidateQueries({ queryKey: ['ai-images', projectId] })
      refresh() // Atualizar créditos

      // Salvar dados para o "Salvar Prompt" (apenas em modo generate)
      if (mode === 'generate') {
        console.log('[AIImagesPanel] Salvando último prompt gerado:', variables.prompt)
        setLastGeneratedPrompt(variables.prompt)
        setLastReferenceUrls(variables.referenceImages)
      }

      setPrompt('')
      setPromptEn(null) // Limpar versão em inglês
      setReferenceImages([]) // Limpar imagens de referência
      setLocalFiles([]) // Limpar arquivos locais
      setReferenceUrls([]) // Limpar URLs de referência

      // Limpar estado de edição
      if (mode === 'edit') {
        setBaseImageFile(null)
        setBaseImagePreview(null)
        setBaseImageUrl(null)
        setMaskImageFile(null)
        setMaskImagePreview(null)
        onClearImageToEdit()
        setMode('generate') // Voltar para modo geração
      }

      // Adicionar automaticamente ao canvas com largura total e centralizada
      const layer = createDefaultLayer('image')
      layer.name = data.name
      layer.fileUrl = data.fileUrl

      // Calcular tamanho e posição com largura total e centralizada
      const placement = calculateCanvasPlacement(data.width, data.height)
      layer.size = placement.size
      layer.position = placement.position

      addLayer(layer)
    },
    onError: (error: Error) => {
      toast({
        variant: 'destructive',
        description: error.message,
      })
    },
  })

  // Handlers para upload de imagens de edição
  const handleBaseImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    // Validar tipo
    if (!file.type.startsWith('image/')) {
      toast({ variant: 'destructive', description: 'Por favor, selecione uma imagem' })
      return
    }

    // Validar tamanho (max 10MB)
    if (file.size > 10 * 1024 * 1024) {
      toast({ variant: 'destructive', description: 'Imagem muito grande (máx 10MB)' })
      return
    }

    setBaseImageFile(file)
    // Criar preview
    const reader = new FileReader()
    reader.onload = (e) => {
      setBaseImagePreview(e.target?.result as string)
    }
    reader.readAsDataURL(file)
  }

  const handleMaskImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    if (!file.type.startsWith('image/')) {
      toast({ variant: 'destructive', description: 'Por favor, selecione uma imagem' })
      return
    }

    if (file.size > 10 * 1024 * 1024) {
      toast({ variant: 'destructive', description: 'Imagem muito grande (máx 10MB)' })
      return
    }

    setMaskImageFile(file)
    const reader = new FileReader()
    reader.onload = (e) => {
      setMaskImagePreview(e.target?.result as string)
    }
    reader.readAsDataURL(file)
  }

  // Limpar imagens de edição quando o usuário explicitamente muda de 'edit' para 'generate'
  const previousMode = React.useRef<'generate' | 'edit'>('generate')
  React.useEffect(() => {
    // Só limpar se o usuário estava em 'edit' e mudou para 'generate'
    // (não quando está carregando pela primeira vez ou vindo de outra aba)
    if (previousMode.current === 'edit' && mode === 'generate') {
      console.log('[GenerateImageForm] User switched from edit to generate, cleaning up')
      setBaseImageFile(null)
      setBaseImagePreview(null)
      setBaseImageUrl(null)
      setMaskImageFile(null)
      setMaskImagePreview(null)
      onClearImageToEdit() // Limpar a imagem selecionada da biblioteca
    }
    previousMode.current = mode
  }, [mode, onClearImageToEdit])

  // Verificar se modelo selecionado suporta edição
  const modelSupportsEditing = React.useMemo(() => {
    const modelConfig = AI_IMAGE_MODELS[selectedModel]
    return modelConfig.capabilities.supportsImageEditing === true
  }, [selectedModel])

  // Auto-switch para modelo que suporte edição se estiver em modo edit
  React.useEffect(() => {
    if (mode === 'edit' && !modelSupportsEditing) {
      console.warn(`[GenerateImageForm] Model ${selectedModel} does not support editing. Switching to seedream-4.`)
      setSelectedModel('seedream-4')
      toast({
        description: `⚠️ ${AI_IMAGE_MODELS[selectedModel].displayName} não suporta edição.\n\nMudando para Seedream 4 automaticamente.`,
        duration: 5000
      })
    }
  }, [selectedModel, mode, modelSupportsEditing, toast])

  const handleGenerate = async () => {
    if (!prompt.trim()) {
      toast({ variant: 'destructive', description: 'Digite um prompt' })
      return
    }

    if (projectId === null || projectId === undefined) {
      console.error('[AIImagesPanel] projectId is null/undefined:', projectId)
      toast({ variant: 'destructive', description: 'Erro: projeto não identificado' })
      return
    }

    // Validar imagem base em modo edit
    if (mode === 'edit' && !baseImageFile && !baseImageUrl) {
      toast({ variant: 'destructive', description: 'Selecione uma imagem para editar' })
      return
    }

    // Calcular créditos necessários baseado no modelo e resolução
    const creditsRequired = calculateCreditsForModel(selectedModel, resolution)

    // Verificar créditos manualmente (a função canPerformOperation usa custo fixo)
    // Por isso verificamos diretamente os créditos disponíveis
    if (!credits || credits.creditsRemaining < creditsRequired) {
      toast({
        variant: 'destructive',
        description: `Créditos insuficientes (necessário: ${creditsRequired}, disponível: ${credits?.creditsRemaining ?? 0})`
      })
      return
    }

    try {
      // 1. Upload de imagem base (se modo edit)
      let finalBaseImageUrl: string | undefined
      if (mode === 'edit') {
        // Se já temos a URL (imagem da biblioteca), usar diretamente
        if (baseImageUrl) {
          finalBaseImageUrl = baseImageUrl
        }
        // Senão, fazer upload do arquivo local
        else if (baseImageFile) {
          const formData = new FormData()
          formData.append('file', baseImageFile)

          const uploadResponse = await fetch('/api/upload', {
            method: 'POST',
            body: formData
          })

          if (!uploadResponse.ok) {
            throw new Error('Falha ao fazer upload da imagem base')
          }

          const { url } = await uploadResponse.json()
          finalBaseImageUrl = url
        }
      }

      // 2. Upload de máscara (se fornecida)
      let maskImageUrl: string | undefined
      if (mode === 'edit' && maskImageFile) {
        const formData = new FormData()
        formData.append('file', maskImageFile)

        const uploadResponse = await fetch('/api/upload', {
          method: 'POST',
          body: formData
        })

        if (!uploadResponse.ok) {
          throw new Error('Falha ao fazer upload da máscara')
        }

        const { url } = await uploadResponse.json()
        maskImageUrl = url
      }

      // 3. Upload de arquivos de referência locais (se houver e modo = generate)
      const localFileUrls: string[] = []
      if (mode === 'generate' && localFiles.length > 0) {
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

      // 4. Converter GoogleDriveItem para URLs completas (só em modo generate)
      const baseUrl = window.location.origin
      const driveImageUrls = mode === 'generate' ? referenceImages.map(img => `${baseUrl}/api/google-drive/image/${img.id}`) : []

      // 5. Combinar todas as URLs de referência (incluindo URLs diretas de prompts salvos)
      const allImageUrls = [...driveImageUrls, ...localFileUrls, ...referenceUrls]

      // Use English prompt for generation if available (from "Melhorar descrição")
      // Otherwise use the regular prompt (which may be in Portuguese)
      const promptForGeneration = promptEn || prompt.trim()

      console.log('[AIImagesPanel] Generating/editing image with:', {
        projectId,
        mode,
        promptDisplay: prompt.trim().substring(0, 50),
        promptForGeneration: promptForGeneration.substring(0, 50),
        usingEnglishPrompt: !!promptEn,
        aspectRatio,
        model: selectedModel,
        resolution,
        hasBaseImage: !!finalBaseImageUrl,
        hasMask: !!maskImageUrl,
        referenceImagesCount: allImageUrls.length
      })

      generateMutation.mutate({
        prompt: promptForGeneration,
        aspectRatio,
        referenceImages: allImageUrls,
        model: selectedModel,
        resolution,
        mode,
        baseImage: finalBaseImageUrl,
        maskImage: maskImageUrl,
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
    const totalImages = referenceImages.length + localFiles.length + referenceUrls.length + imageFiles.length

    if (totalImages > maxReferenceImages) {
      toast({
        variant: 'destructive',
        description: `Máximo de ${maxReferenceImages} imagens para este modelo`
      })
      return
    }

    setLocalFiles(prev => [...prev, ...imageFiles].slice(0, maxReferenceImages - referenceImages.length))
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

  // Calcular custo dinâmico baseado no modelo e resolução
  const cost = React.useMemo(
    () => calculateCreditsForModel(selectedModel, resolution),
    [selectedModel, resolution]
  )

  // Calcular limite máximo de imagens de referência baseado no modelo
  const maxReferenceImages = React.useMemo(() => {
    const modelConfig = AI_IMAGE_MODELS[selectedModel]
    return modelConfig.capabilities.maxReferenceImages
  }, [selectedModel])

  // Limpar imagens de referência excedentes quando trocar de modelo
  React.useEffect(() => {
    const totalImages = referenceImages.length + localFiles.length + referenceUrls.length
    if (totalImages > maxReferenceImages) {
      // Priorizar manter imagens do Google Drive, depois URLs, depois locais
      if (referenceImages.length > maxReferenceImages) {
        setReferenceImages(prev => prev.slice(0, maxReferenceImages))
        setLocalFiles([])
        setReferenceUrls([])
      } else if (referenceImages.length + referenceUrls.length > maxReferenceImages) {
        const remainingSlots = maxReferenceImages - referenceImages.length
        setReferenceUrls(prev => prev.slice(0, remainingSlots))
        setLocalFiles([])
      } else {
        const remainingSlots = maxReferenceImages - referenceImages.length - referenceUrls.length
        setLocalFiles(prev => prev.slice(0, remainingSlots))
      }

      toast({
        description: `Este modelo aceita no máximo ${maxReferenceImages} imagem${maxReferenceImages !== 1 ? 'ns' : ''} de referência`,
      })
    }
  }, [maxReferenceImages, toast])

  // Aviso se projectId não estiver disponível
  if (projectId === null || projectId === undefined) {
    return (
      <Card className="p-4">
        <div className="text-center py-6 space-y-2">
          <p className="text-sm font-medium text-destructive">
            Projeto não identificado
          </p>
          <p className="text-xs text-muted-foreground">
            Recarregue a página para continuar gerando imagens com IA.
          </p>
        </div>
      </Card>
    )
  }

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
              onClick={handleImprovePrompt}
              disabled={improvePrompt.isPending || !prompt.trim() || generateMutation.isPending}
              className="h-7 gap-1 text-xs"
              title="Melhorar descrição com IA"
            >
              {improvePrompt.isPending ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Wand2 className="h-3.5 w-3.5" />
              )}
            </Button>
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
          onChange={(e) => {
            setPrompt(e.target.value)
            // Clear English version when user manually edits (they're no longer in sync)
            setPromptEn(null)
          }}
          rows={3}
          disabled={generateMutation.isPending}
        />
      </div>

      {/* Seletor de Modelo de IA */}
      <AIModelSelector
        value={selectedModel}
        onValueChange={setSelectedModel}
        disabled={generateMutation.isPending}
        filterByEditing={mode === 'edit'}
      />

      {/* Seletor de Resolução (apenas para modelos que suportam) */}
      <ResolutionSelector
        model={selectedModel}
        value={resolution}
        onValueChange={setResolution}
        disabled={generateMutation.isPending}
      />

      {/* Toggle entre Gerar e Editar */}
      <div className="space-y-2">
        <label className="text-sm font-medium">Modo</label>
        <div className="grid grid-cols-2 gap-2">
          <Button
            variant={mode === 'generate' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setMode('generate')}
            disabled={generateMutation.isPending}
            className="text-xs"
          >
            <Sparkles className="mr-1.5 h-3.5 w-3.5" />
            Gerar
          </Button>
          <Button
            variant={mode === 'edit' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setMode('edit')}
            disabled={generateMutation.isPending || !modelSupportsEditing}
            className="text-xs"
          >
            <Wand2 className="mr-1.5 h-3.5 w-3.5" />
            Editar
          </Button>
        </div>
        {!modelSupportsEditing && (
          <p className="text-xs text-muted-foreground">
            Este modelo não suporta edição de imagens
          </p>
        )}
      </div>

      {/* Seção de Edição - Imagem Base */}
      {mode === 'edit' && (() => {
        console.log('[GenerateImageForm] Rendering edit section:', { mode, baseImagePreview, baseImageUrl, hasImageToEdit: !!imageToEdit })
        return null
      })()}
      {mode === 'edit' && (
        <div className="space-y-2">
          <label className="text-sm font-medium">Imagem para Editar</label>

          <p className="text-xs text-muted-foreground">
            {selectedModel === 'ideogram-v3-turbo'
              ? 'Carregue a imagem e (opcionalmente) uma máscara para inpainting. Preto = editar, Branco = preservar.'
              : 'Carregue a imagem que deseja modificar. O prompt deve descrever as mudanças (ex: "remova a garrafa verde").'}
          </p>

          {baseImagePreview ? (
            <div className="relative">
              <div className="relative w-full h-40 rounded border overflow-hidden bg-muted">
                <Image
                  src={baseImagePreview}
                  alt="Imagem base"
                  fill
                  className="object-contain"
                  unoptimized
                  onLoad={() => console.log('[GenerateImageForm] Image loaded successfully')}
                  onError={(e) => console.error('[GenerateImageForm] Image failed to load:', e)}
                />
              </div>
              <Button
                size="icon"
                variant="destructive"
                className="absolute top-2 right-2 h-7 w-7"
                onClick={() => {
                  setBaseImageFile(null)
                  setBaseImagePreview(null)
                  setBaseImageUrl(null)
                  onClearImageToEdit()
                  if (baseImageInputRef.current) {
                    baseImageInputRef.current.value = ''
                  }
                }}
              >
                <X className="h-4 w-4" />
              </Button>
              {imageToEdit && (
                <div className="mt-2">
                  <p className="text-xs text-muted-foreground">
                    Editando: {imageToEdit.name}
                  </p>
                </div>
              )}
            </div>
          ) : (
            <div
              className="border-2 border-dashed rounded-lg p-6 text-center cursor-pointer hover:border-primary/50 transition-colors"
              onClick={() => baseImageInputRef.current?.click()}
            >
              <Upload className="h-8 w-8 mx-auto mb-2 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">
                Clique para selecionar a imagem
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                PNG, JPG ou WEBP (máx 10MB)
              </p>
            </div>
          )}

          <input
            ref={baseImageInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={handleBaseImageSelect}
            disabled={generateMutation.isPending}
          />
        </div>
      )}

      {/* Seção de Edição - Máscara (opcional, para modelos com inpainting) */}
      {mode === 'edit' && AI_IMAGE_MODELS[selectedModel].capabilities.supportsInpainting && (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <label className="text-sm font-medium">Máscara (opcional)</label>
            <Badge variant="secondary" className="text-xs">Inpainting</Badge>
          </div>

          <p className="text-xs text-muted-foreground">
            Preto = área a editar, Branco = área a preservar
          </p>

          {maskImagePreview ? (
            <div className="relative">
              <div className="relative w-full h-32 rounded border overflow-hidden">
                <Image
                  src={maskImagePreview}
                  alt="Máscara"
                  fill
                  className="object-contain"
                  unoptimized
                />
              </div>
              <Button
                size="icon"
                variant="destructive"
                className="absolute top-2 right-2 h-7 w-7"
                onClick={() => {
                  setMaskImageFile(null)
                  setMaskImagePreview(null)
                  if (maskImageInputRef.current) {
                    maskImageInputRef.current.value = ''
                  }
                }}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          ) : (
            <div
              className="border-2 border-dashed rounded-lg p-4 text-center cursor-pointer hover:border-primary/50 transition-colors"
              onClick={() => maskImageInputRef.current?.click()}
            >
              <Upload className="h-6 w-6 mx-auto mb-2 text-muted-foreground" />
              <p className="text-xs text-muted-foreground">
                Clique para adicionar máscara
              </p>
            </div>
          )}

          <input
            ref={maskImageInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={handleMaskImageSelect}
            disabled={generateMutation.isPending}
          />
        </div>
      )}

      <div className="space-y-2">
        <label className="text-sm font-medium">Proporção</label>
        <div className="grid grid-cols-4 gap-2">
          {['1:1', '16:9', '9:16', '4:5'].map((ratio) => (
            <Button
              key={ratio}
              variant={aspectRatio === ratio ? 'default' : 'outline'}
              size="sm"
              onClick={() => setAspectRatio(ratio)}
              className="text-xs flex-col gap-1 h-auto py-2"
              disabled={generateMutation.isPending}
            >
              <AspectRatioIcon ratio={ratio} />
              <span>{ratio}</span>
            </Button>
          ))}
        </div>
      </div>

      {/* Imagens de Referência - apenas em modo generate */}
      {mode === 'generate' && (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <label className="text-sm font-medium">Imagens de Referência (opcional)</label>
            {maxReferenceImages === 0 && (
              <Badge variant="secondary" className="text-xs">Não suportado</Badge>
            )}
          </div>
          {maxReferenceImages === 0 ? (
            <div className="text-xs text-muted-foreground p-3 bg-muted/50 rounded border">
              Este modelo não suporta imagens de referência
            </div>
          ) : (
          <div className="space-y-2">
          {/* Preview das imagens selecionadas */}
          {(referenceImages.length > 0 || localFiles.length > 0 || referenceUrls.length > 0) && (
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

              {/* URLs de referência (de prompts salvos) */}
              {referenceUrls.map((url, index) => (
                <div key={`url-${index}`} className="relative group">
                  <div className="relative w-full h-20 rounded border overflow-hidden">
                    <Image
                      src={url}
                      alt={`Referência ${index + 1}`}
                      fill
                      className="object-cover"
                      unoptimized
                    />
                  </div>
                  <button
                    onClick={() => setReferenceUrls(prev => prev.filter((_, i) => i !== index))}
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
              {referenceImages.length + localFiles.length + referenceUrls.length}/{maxReferenceImages} imagens
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
            disabled={generateMutation.isPending || referenceImages.length + localFiles.length + referenceUrls.length >= maxReferenceImages || maxReferenceImages === 0}
            onClick={() => setIsDriveModalOpen(true)}
          >
            <HardDrive className="mr-2 h-4 w-4" />
            Selecionar do Google Drive
          </Button>

          <DesktopGoogleDriveModal
            open={isDriveModalOpen}
            onOpenChange={setIsDriveModalOpen}
            mode="images"
            initialFolderId={driveFolderId ?? undefined}
            initialFolderName={driveFolderName ?? undefined}
            onSelect={() => {}} // Not used in multi-select mode
            multiSelect={true}
            maxSelection={maxReferenceImages}
            selectedItems={referenceImages}
            onMultiSelectConfirm={(items) => {
              setReferenceImages(items)
              setIsDriveModalOpen(false)
            }}
          />
        </div>
        )}
        </div>
      )}

      <div className="flex flex-col gap-2 pt-2">
        {lastGeneratedPrompt && mode === 'generate' && (
          <Button
            variant="secondary"
            size="sm"
            onClick={() => setShowSavePromptDialog(true)}
            className="w-full gap-1.5"
          >
            <BookmarkPlus className="h-4 w-4" />
            Salvar Último Prompt Gerado
          </Button>
        )}

        <div className="flex items-center justify-between">
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
                {mode === 'edit' ? 'Editando...' : 'Gerando...'}
              </>
            ) : (
              <>
                {mode === 'edit' ? (
                  <>
                    <Wand2 className="mr-2 h-4 w-4" />
                    Editar Imagem
                  </>
                ) : (
                  <>
                    <Sparkles className="mr-2 h-4 w-4" />
                    Gerar Imagem
                  </>
                )}
              </>
            )}
          </Button>
        </div>
      </div>

      {/* Dialog para salvar prompt */}
      <SavePromptDialog
        open={showSavePromptDialog}
        onOpenChange={setShowSavePromptDialog}
        promptContent={lastGeneratedPrompt}
        referenceImages={lastReferenceUrls}
      />
    </Card>
  )
}

// Card individual de imagem
function ImageCard({
  image,
  projectId,
  onAddToCanvas,
  onEditImage
}: {
  image: AIImageRecord
  projectId: number | null | undefined
  onAddToCanvas: () => void
  onEditImage: () => void
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
                onClick={(e) => {
                  e.preventDefault()
                  e.stopPropagation()
                  onEditImage()
                }}
                className="h-8 w-8"
                title="Editar imagem"
              >
                <Wand2 className="h-4 w-4" />
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
function PromptsLibrary({
  projectId: _projectId,
  onApplyPrompt,
}: {
  projectId: number | null | undefined
  onApplyPrompt: (prompt: Prompt) => void
}) {
  const { toast } = useToast()
  const [copiedId, setCopiedId] = React.useState<string | null>(null)
  const [selectedPrompt, setSelectedPrompt] = React.useState<Prompt | null>(null)
  const [searchQuery, setSearchQuery] = React.useState('')

  // Buscar prompts globais do usuário
  const { data: prompts = [], isLoading } = usePrompts()

  // Debug: log dos prompts carregados
  React.useEffect(() => {
    if (prompts.length > 0) {
      console.log('[PromptsLibrary] Prompts carregados:', prompts.map(p => ({
        title: p.title,
        referenceImagesCount: p.referenceImages.length,
        referenceImages: p.referenceImages
      })))
    }
  }, [prompts])

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
                            onApplyPrompt(prompt)
                          }}
                          title="Usar este prompt"
                        >
                          <Wand2 className="h-3.5 w-3.5" />
                        </Button>
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

                    {prompt.referenceImages.length > 0 && (
                      <ReferenceImagesGrid
                        images={prompt.referenceImages}
                        maxDisplay={3}
                        className="mt-2"
                      />
                    )}

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

            {selectedPrompt?.referenceImages && selectedPrompt.referenceImages.length > 0 && (
              <div className="space-y-2">
                <h4 className="text-sm font-semibold">
                  Imagens de Referência ({selectedPrompt.referenceImages.length})
                </h4>
                <ReferenceImagesGrid images={selectedPrompt.referenceImages} />
              </div>
            )}

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

            {/* Botão para aplicar prompt */}
            <div className="flex justify-end gap-2 pt-4 border-t">
              <Button
                variant="outline"
                onClick={handleCloseDialog}
              >
                Fechar
              </Button>
              <Button
                onClick={() => {
                  if (selectedPrompt) {
                    onApplyPrompt(selectedPrompt)
                    handleCloseDialog()
                  }
                }}
              >
                <Wand2 className="mr-2 h-4 w-4" />
                Usar este Prompt
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
