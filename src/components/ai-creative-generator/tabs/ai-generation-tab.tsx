'use client'

import { useState, useRef } from 'react'
import Image from 'next/image'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Loader2, Wand2, Check, Upload, X, HardDrive } from 'lucide-react'
import { useToast } from '@/hooks/use-toast'
import { useProject } from '@/hooks/use-project'
import { cn } from '@/lib/utils'
import type { ImageSource } from '@/lib/ai-creative-generator/layout-types'
import type { GoogleDriveItem } from '@/types/google-drive'
import { DesktopGoogleDriveModal } from '@/components/projects/google-drive-folder-selector'

interface AIGenerationTabProps {
  projectId: number
  onImageGenerated: (image: ImageSource) => void
}

type AIImageModel = 'nano-banana' | 'nano-banana-pro' | 'flux-schnell'

export function AIGenerationTab({
  projectId,
  onImageGenerated,
}: AIGenerationTabProps) {
  const { toast } = useToast()
  const { data: project } = useProject(projectId)
  const driveFolderId =
    project?.googleDriveImagesFolderId ?? project?.googleDriveFolderId ?? null
  const driveFolderName =
    project?.googleDriveImagesFolderName ?? project?.googleDriveFolderName ?? null

  const [prompt, setPrompt] = useState('')
  const [model, setModel] = useState<AIImageModel>('nano-banana')
  const [isGenerating, setIsGenerating] = useState(false)
  const [generatedImage, setGeneratedImage] = useState<{
    url: string
    prompt: string
    model: AIImageModel
  } | null>(null)
  const [error, setError] = useState<string | null>(null)

  // Estados para imagens de referência
  const [referenceImages, setReferenceImages] = useState<GoogleDriveItem[]>([])
  const [localFiles, setLocalFiles] = useState<File[]>([])
  const [isDriveModalOpen, setIsDriveModalOpen] = useState(false)
  const [isDragging, setIsDragging] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Máximo de 3 imagens de referência
  const maxReferenceImages = 3

  async function handleGenerate() {
    if (!prompt.trim()) {
      toast({ variant: 'destructive', description: 'Digite um prompt' })
      return
    }

    setIsGenerating(true)
    setError(null)

    try {
      // 1. Upload de arquivos de referência locais (se houver)
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
            throw new Error('Falha ao fazer upload da imagem de referência')
          }

          const { url } = await uploadResponse.json()
          localFileUrls.push(url)
        }
      }

      // 2. Converter GoogleDriveItem para URLs completas
      const baseUrl = window.location.origin
      const driveImageUrls = referenceImages.map(img => `${baseUrl}/api/google-drive/image/${img.id}`)

      // 3. Combinar todas as URLs de referência
      const allImageUrls = [...driveImageUrls, ...localFileUrls]

      const response = await fetch('/api/ai/generate-image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectId,
          prompt: prompt.trim(),
          model,
          aspectRatio: '9:16', // Story format
          referenceImages: allImageUrls,
        }),
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.error || 'Erro ao gerar imagem')
      }

      const data = await response.json()

      const imageData = {
        url: data.fileUrl,
        prompt: data.prompt,
        model: data.model as AIImageModel,
      }

      setGeneratedImage(imageData)

      // Limpar formulário
      setPrompt('')
      setReferenceImages([])
      setLocalFiles([])

      // Auto-selecionar a imagem gerada
      onImageGenerated({
        type: 'ai-generate',
        url: data.fileUrl,
        prompt: data.prompt,
        model: data.model,
      })

      toast({ description: 'Imagem gerada com sucesso!' })
    } catch (err) {
      console.error('[AIGenerationTab] Erro ao gerar imagem:', err)
      setError(err instanceof Error ? err.message : 'Erro desconhecido')
    } finally {
      setIsGenerating(false)
    }
  }

  function handleSelectGenerated() {
    if (!generatedImage) return

    onImageGenerated({
      type: 'ai-generate',
      url: generatedImage.url,
      prompt: generatedImage.prompt,
      model: generatedImage.model,
    })
  }

  // Handlers para imagens de referência
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

    if (totalImages > maxReferenceImages) {
      toast({
        variant: 'destructive',
        description: `Máximo de ${maxReferenceImages} imagens de referência`
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

  const modelOptions: {
    value: AIImageModel
    label: string
    credits: number
  }[] = [
    { value: 'flux-schnell', label: 'FLUX Schnell', credits: 1 },
    { value: 'nano-banana', label: 'Nano Banana', credits: 10 },
    { value: 'nano-banana-pro', label: 'Nano Banana Pro', credits: 15 },
  ]

  const selectedModelOption = modelOptions.find((opt) => opt.value === model)

  return (
    <div className="space-y-4">
      {/* Formulário de geração */}
      <div className="space-y-3">
        <div>
          <label className="text-sm font-medium">Prompt</label>
          <Textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder="Descreva a imagem que deseja gerar..."
            className="mt-1 min-h-[80px] resize-none"
            disabled={isGenerating}
          />
          <p className="mt-1 text-xs text-muted-foreground">
            Ex: "Mulher sorrindo em um parque ensolarado com flores"
          </p>
        </div>

        <div>
          <label className="text-sm font-medium">Modelo</label>
          <select
            value={model}
            onChange={(e) => setModel(e.target.value as AIImageModel)}
            className="mt-1 w-full h-9 px-3 rounded-md border bg-transparent text-sm"
            disabled={isGenerating}
          >
            {modelOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label} ({option.credits} créditos)
              </option>
            ))}
          </select>
          <p className="mt-1 text-xs text-muted-foreground">
            Formato: 9:16 (Story)
          </p>
        </div>

        {/* Imagens de Referência */}
        <div className="space-y-2">
          <label className="text-sm font-medium">Imagens de Referência (opcional)</label>
          <p className="text-xs text-muted-foreground">
            Adicione até 3 imagens para guiar o estilo da geração
          </p>

          {/* Preview das imagens selecionadas */}
          {(referenceImages.length > 0 || localFiles.length > 0) && (
            <div className="grid grid-cols-3 gap-2">
              {/* Imagens do Google Drive */}
              {referenceImages.map((refImg) => (
                <div key={refImg.id} className="relative group">
                  <div className="relative w-full h-20 rounded border overflow-hidden">
                    <Image
                      src={`/api/google-drive/thumbnail/${refImg.id}`}
                      alt={refImg.name}
                      fill
                      className="object-cover"
                      unoptimized
                      onError={(e) => {
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
              isGenerating && "opacity-50 cursor-not-allowed"
            )}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            onClick={() => !isGenerating && fileInputRef.current?.click()}
          >
            <Upload className="h-6 w-6 mx-auto mb-2 text-muted-foreground" />
            <p className="text-xs text-muted-foreground">
              Arraste imagens aqui ou clique para selecionar
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              {referenceImages.length + localFiles.length}/{maxReferenceImages} imagens
            </p>
          </div>

          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            onChange={(e) => handleFileSelect(e.target.files)}
            disabled={isGenerating}
          />

          <Button
            variant="outline"
            size="sm"
            className="w-full"
            disabled={isGenerating || referenceImages.length + localFiles.length >= maxReferenceImages}
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

        <Button
          onClick={handleGenerate}
          disabled={!prompt.trim() || isGenerating}
          className="w-full"
        >
          {isGenerating ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Gerando... (pode levar até 1 min)
            </>
          ) : (
            <>
              <Wand2 className="mr-2 h-4 w-4" />
              Gerar Imagem ({selectedModelOption?.credits || 0} créditos)
            </>
          )}
        </Button>
      </div>

      {/* Erro */}
      {error && (
        <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-3">
          <p className="text-sm text-destructive whitespace-pre-wrap">{error}</p>
        </div>
      )}

      {/* Preview da imagem gerada */}
      {generatedImage && (
        <div className="space-y-2">
          <label className="text-sm font-medium">Imagem Gerada</label>
          <button
            onClick={handleSelectGenerated}
            className="group relative aspect-[9/16] w-full overflow-hidden rounded-lg border-2 border-primary shadow-lg transition-all hover:scale-105"
            title={generatedImage.prompt}
          >
            <Image
              src={generatedImage.url}
              alt={generatedImage.prompt}
              fill
              className="object-cover"
              unoptimized
            />

            {/* Overlay com prompt */}
            <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent p-3 opacity-0 transition-opacity group-hover:opacity-100">
              <p className="line-clamp-3 text-xs text-white">
                {generatedImage.prompt}
              </p>
              <p className="mt-1 text-xs text-white/70">
                Modelo: {selectedModelOption?.label || generatedImage.model}
              </p>
            </div>

            {/* Indicador de selecionado */}
            <div className="absolute right-2 top-2 flex h-6 w-6 items-center justify-center rounded-full bg-primary shadow-lg">
              <Check className="h-4 w-4 text-primary-foreground" />
            </div>
          </button>

          <p className="text-xs text-center text-muted-foreground">
            Clique para usar esta imagem
          </p>
        </div>
      )}

      {/* Informação */}
      {!generatedImage && !isGenerating && (
        <div className="rounded-lg border border-border/40 bg-muted/30 p-3">
          <p className="text-xs text-muted-foreground">
            💡 Dica: Descreva a imagem em detalhes para melhores resultados. Você pode adicionar até 3 imagens de referência para guiar o estilo. A imagem será gerada no formato vertical (Story 9:16).
          </p>
        </div>
      )}
    </div>
  )
}
