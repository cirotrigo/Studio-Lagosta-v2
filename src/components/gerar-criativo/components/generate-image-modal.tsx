'use client'

import { useState, useRef } from 'react'
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
import { Loader2, Sparkles, X, Upload, ImagePlus } from 'lucide-react'
import { toast } from 'sonner'

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
  const [prompt, setPrompt] = useState('')
  const [referenceImages, setReferenceImages] = useState<string[]>([])
  const [isUploading, setIsUploading] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const queryClient = useQueryClient()

  const generateImage = useMutation({
    mutationFn: async (data: { prompt: string; referenceImages?: string[] }): Promise<GenerateImageResult> => {
      return api.post<GenerateImageResult>('/api/ai/generate-image', {
        prompt: data.prompt,
        projectId,
        model: 'nano-banana-pro',
        referenceImages: data.referenceImages && data.referenceImages.length > 0 ? data.referenceImages : undefined,
      })
    },
    onSuccess: (data) => {
      onComplete({ id: data.id, fileUrl: data.fileUrl })
      setPrompt('')
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
    generateImage.mutate({ prompt, referenceImages })
  }

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files
    if (!files || files.length === 0) return

    if (referenceImages.length + files.length > MAX_REFERENCE_IMAGES) {
      toast.error(`Maximo de ${MAX_REFERENCE_IMAGES} imagens de referencia`)
      return
    }

    setIsUploading(true)

    try {
      for (const file of Array.from(files)) {
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

  const removeReferenceImage = (index: number) => {
    setReferenceImages((prev) => prev.filter((_, i) => i !== index))
  }

  return (
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
            <Label htmlFor="prompt">Descricao da imagem</Label>
            <Textarea
              id="prompt"
              placeholder="Ex: Uma foto profissional de um hamburguer artesanal com queijo derretendo, em fundo escuro com iluminacao dramatica"
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
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

            <div className="flex flex-wrap gap-2">
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

              {referenceImages.length < MAX_REFERENCE_IMAGES && (
                <button
                  onClick={() => fileInputRef.current?.click()}
                  disabled={isUploading}
                  className="w-16 h-16 rounded-md border-2 border-dashed border-muted-foreground/30 hover:border-muted-foreground/50 flex items-center justify-center transition-colors"
                >
                  {isUploading ? (
                    <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
                  ) : (
                    <ImagePlus className="w-5 h-5 text-muted-foreground" />
                  )}
                </button>
              )}
            </div>

            <p className="text-xs text-muted-foreground">
              Adicione imagens para guiar o estilo da geracao
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
  )
}
