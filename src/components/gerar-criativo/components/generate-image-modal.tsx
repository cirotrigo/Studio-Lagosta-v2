'use client'

import { useState, useRef, useCallback } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api-client'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { Loader2, Sparkles, X, Upload, ImagePlus, FolderOpen, Wand2 } from 'lucide-react'
import { toast } from 'sonner'
import { GoogleDrivePickerModal } from './google-drive-picker-modal'
import { useImprovePrompt } from '@/hooks/use-improve-prompt'

interface GenerateImageModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  projectId: number
  onComplete: (image: { id: string; fileUrl: string }) => void
}

interface GenerateImageResult {
  id: string
  fileUrl: string
  prompt: string
}

const MAX_REFERENCE_IMAGES = 3

export function GenerateImageModal({
  open,
  onOpenChange,
  projectId,
  onComplete,
}: GenerateImageModalProps) {
  const [prompt, setPrompt] = useState('') // Portuguese version for display
  const [promptEn, setPromptEn] = useState<string | null>(null) // English version for generation
  const [referenceImages, setReferenceImages] = useState<string[]>([])
  const [isUploading, setIsUploading] = useState(false)
  const [isDragging, setIsDragging] = useState(false)
  const [showDrivePicker, setShowDrivePicker] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const queryClient = useQueryClient()
  const improvePrompt = useImprovePrompt()

  const handleImprovePrompt = () => {
    if (!prompt.trim()) {
      toast.error('Digite uma descrição primeiro')
      return
    }
    improvePrompt.mutate(
      { prompt, projectId, aspectRatio: '9:16' }, // Stories format
      {
        onSuccess: (data) => {
          // Display Portuguese version in textarea
          setPrompt(data.improvedPromptPt || data.improvedPrompt)
          // Store English version for image generation
          setPromptEn(data.improvedPromptEn || data.improvedPrompt)
          toast.success('Descrição melhorada!')
        },
      }
    )
  }

  const generateImage = useMutation({
    mutationFn: async (data: { prompt: string; referenceImages?: string[] }): Promise<GenerateImageResult> => {
      return api.post<GenerateImageResult>('/api/ai/generate-image', {
        prompt: data.prompt,
        projectId,
        model: 'nano-banana-pro',
        aspectRatio: '9:16', // Stories format (vertical)
        referenceImages: data.referenceImages && data.referenceImages.length > 0 ? data.referenceImages : undefined,
      })
    },
    onSuccess: (data) => {
      onComplete({ id: data.id, fileUrl: data.fileUrl })
      setPrompt('')
      setPromptEn(null)
      setReferenceImages([])
      toast.success('Imagem gerada com sucesso!')
    },
    onError: (error) => {
      console.error('Error generating image:', error)
      toast.error('Erro ao gerar imagem. Tente novamente.')
    },
  })

  const handleGenerate = () => {
    if (!prompt.trim()) {
      toast.error('Digite uma descricao para a imagem')
      return
    }
    // Use English prompt for generation if available (from "Melhorar descrição")
    const promptForGeneration = promptEn || prompt
    generateImage.mutate({ prompt: promptForGeneration, referenceImages })
  }

  const uploadFiles = async (files: FileList | File[]) => {
    const fileArray = Array.from(files)

    if (referenceImages.length + fileArray.length > MAX_REFERENCE_IMAGES) {
      toast.error(`Maximo de ${MAX_REFERENCE_IMAGES} imagens de referencia`)
      return
    }

    setIsUploading(true)

    try {
      for (const file of fileArray) {
        if (!file.type.startsWith('image/')) {
          toast.error(`${file.name} nao e uma imagem valida`)
          continue
        }

        if (file.size > 10 * 1024 * 1024) {
          toast.error(`${file.name} e muito grande (max 10MB)`)
          continue
        }

        const formData = new FormData()
        formData.append('file', file)
        formData.append('projectId', projectId.toString())
        formData.append('type', 'reference')

        const response = await fetch('/api/upload', {
          method: 'POST',
          body: formData,
        })

        if (!response.ok) {
          throw new Error('Falha ao fazer upload')
        }

        const result = await response.json()
        setReferenceImages((prev) => [...prev, result.url])
      }

      // Invalidate gallery query to show new images
      queryClient.invalidateQueries({ queryKey: ['project-images', projectId] })
    } catch (error) {
      console.error('Upload error:', error)
      toast.error('Erro ao fazer upload da imagem')
    } finally {
      setIsUploading(false)
      if (fileInputRef.current) {
        fileInputRef.current.value = ''
      }
    }
  }

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files
    if (!files || files.length === 0) return
    await uploadFiles(files)
  }

  // Drag and drop handlers
  const handleDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(true)
  }, [])

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    // Only set dragging to false if we're leaving the drop zone entirely
    if (!e.currentTarget.contains(e.relatedTarget as Node)) {
      setIsDragging(false)
    }
  }, [])

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
  }, [])

  const handleDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(false)

    const files = e.dataTransfer.files
    if (files && files.length > 0) {
      await uploadFiles(files)
    }
  }, [referenceImages.length, projectId])

  const removeReferenceImage = (index: number) => {
    setReferenceImages((prev) => prev.filter((_, i) => i !== index))
  }

  const handleDriveImageSelected = (url: string) => {
    if (referenceImages.length >= MAX_REFERENCE_IMAGES) {
      toast.error(`Maximo de ${MAX_REFERENCE_IMAGES} imagens de referencia`)
      return
    }
    setReferenceImages((prev) => [...prev, url])
    setShowDrivePicker(false)
  }

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Sparkles className="w-5 h-5" />
              Gerar Imagem com IA
            </DialogTitle>
            <DialogDescription>
              Descreva a imagem que voce deseja gerar. Seja especifico para melhores resultados.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="prompt">Descrição da imagem</Label>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={handleImprovePrompt}
                  disabled={improvePrompt.isPending || !prompt.trim()}
                  className="h-7 text-xs gap-1 text-muted-foreground hover:text-foreground"
                >
                  {improvePrompt.isPending ? (
                    <>
                      <Loader2 className="w-3 h-3 animate-spin" />
                      Melhorando...
                    </>
                  ) : (
                    <>
                      <Wand2 className="w-3 h-3" />
                      Melhorar descrição
                    </>
                  )}
                </Button>
              </div>
              <Textarea
                id="prompt"
                placeholder="Ex: Uma foto profissional de um hamburguer artesanal com queijo derretendo, em fundo escuro com iluminacao dramatica"
                value={prompt}
                onChange={(e) => {
                  setPrompt(e.target.value)
                  // Clear English version when user manually edits (they're no longer in sync)
                  setPromptEn(null)
                }}
                rows={4}
                className="resize-none"
              />
            </div>

            {/* Reference Images Section */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>Imagens de referencia (opcional)</Label>
                <span className="text-xs text-muted-foreground">
                  {referenceImages.length}/{MAX_REFERENCE_IMAGES}
                </span>
              </div>

              {/* Drag and Drop Zone */}
              <div
                onDragEnter={handleDragEnter}
                onDragLeave={handleDragLeave}
                onDragOver={handleDragOver}
                onDrop={handleDrop}
                className={`relative rounded-lg border-2 border-dashed transition-all ${
                  isDragging
                    ? 'border-primary bg-primary/5'
                    : 'border-muted-foreground/30 hover:border-muted-foreground/50'
                }`}
              >
                <div className="p-4">
                  {/* Selected Images */}
                  {referenceImages.length > 0 && (
                    <div className="flex flex-wrap gap-2 mb-3">
                      {referenceImages.map((url, index) => (
                        <div key={index} className="relative w-16 h-16 rounded-md overflow-hidden group">
                          <img
                            src={url}
                            alt={`Referencia ${index + 1}`}
                            className="w-full h-full object-cover"
                          />
                          <button
                            onClick={() => removeReferenceImage(index)}
                            className="absolute top-0.5 right-0.5 w-5 h-5 bg-black/70 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                          >
                            <X className="w-3 h-3 text-white" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Upload Area */}
                  {referenceImages.length < MAX_REFERENCE_IMAGES && (
                    <div className={`flex flex-col items-center justify-center py-4 ${isDragging ? 'pointer-events-none' : ''}`}>
                      {isUploading ? (
                        <div className="flex flex-col items-center gap-2">
                          <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
                          <p className="text-sm text-muted-foreground">Enviando...</p>
                        </div>
                      ) : (
                        <>
                          <div className="flex items-center justify-center w-12 h-12 rounded-full bg-muted mb-3">
                            <Upload className="w-6 h-6 text-muted-foreground" />
                          </div>
                          <p className="text-sm font-medium text-center mb-1">
                            {isDragging ? 'Solte a imagem aqui' : 'Arraste imagens aqui'}
                          </p>
                          <p className="text-xs text-muted-foreground text-center mb-3">
                            ou escolha uma opcao abaixo
                          </p>
                          <div className="flex gap-2">
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              onClick={() => fileInputRef.current?.click()}
                              disabled={isUploading}
                            >
                              <ImagePlus className="w-4 h-4 mr-2" />
                              Computador
                            </Button>
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              onClick={() => setShowDrivePicker(true)}
                              disabled={isUploading}
                            >
                              <FolderOpen className="w-4 h-4 mr-2" />
                              Google Drive
                            </Button>
                          </div>
                        </>
                      )}
                    </div>
                  )}
                </div>

                {/* Drag overlay */}
                {isDragging && (
                  <div className="absolute inset-0 flex items-center justify-center bg-primary/10 rounded-lg z-10">
                    <div className="flex flex-col items-center gap-2">
                      <Upload className="w-10 h-10 text-primary" />
                      <p className="text-sm font-medium text-primary">Solte para adicionar</p>
                    </div>
                  </div>
                )}
              </div>

              <p className="text-xs text-muted-foreground">
                Adicione imagens para guiar o estilo da geracao (max 10MB cada)
              </p>

              <Input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                multiple
                onChange={handleFileUpload}
                className="hidden"
              />
            </div>

            <div className="flex items-center justify-between text-sm text-muted-foreground">
              <span>Custo: 15 creditos</span>
              <span>Modelo: Gemini 3 Pro</span>
            </div>
          </div>

          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button onClick={handleGenerate} disabled={generateImage.isPending || !prompt.trim() || isUploading}>
              {generateImage.isPending ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Gerando...
                </>
              ) : (
                <>
                  <Sparkles className="w-4 h-4 mr-2" />
                  Gerar Imagem
                </>
              )}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Google Drive Picker Modal */}
      <GoogleDrivePickerModal
        open={showDrivePicker}
        onOpenChange={setShowDrivePicker}
        projectId={projectId}
        onImageSelected={handleDriveImageSelected}
      />
    </>
  )
}
