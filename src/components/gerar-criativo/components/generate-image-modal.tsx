'use client'

import { useState } from 'react'
import { useMutation } from '@tanstack/react-query'
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
import { Loader2, Sparkles } from 'lucide-react'
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

export function GenerateImageModal({
  open,
  onOpenChange,
  projectId,
  onComplete,
}: GenerateImageModalProps) {
  const [prompt, setPrompt] = useState('')

  const generateImage = useMutation({
    mutationFn: async (prompt: string): Promise<GenerateImageResult> => {
      return api.post<GenerateImageResult>('/api/ai/generate-image', {
        prompt,
        projectId,
        model: 'nano-banana',
      })
    },
    onSuccess: (data) => {
      onComplete({ id: data.id, fileUrl: data.fileUrl })
      setPrompt('')
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
    generateImage.mutate(prompt)
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

          <div className="flex items-center justify-between text-sm text-muted-foreground">
            <span>Custo: 5 creditos</span>
            <span>Modelo: Nano Banana</span>
          </div>
        </div>

        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button onClick={handleGenerate} disabled={generateImage.isPending || !prompt.trim()}>
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
