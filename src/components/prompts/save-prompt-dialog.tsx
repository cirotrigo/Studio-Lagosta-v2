'use client'

import * as React from 'react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { X, Loader2, Save } from 'lucide-react'
import { useCreatePrompt } from '@/hooks/use-prompts'
import { useToast } from '@/hooks/use-toast'
import { PROMPT_CATEGORIES } from '@/types/prompt'
import { ReferenceImagesGrid } from './reference-images-grid'

interface SavePromptDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  promptContent: string
  referenceImages: string[]
}

export function SavePromptDialog({
  open,
  onOpenChange,
  promptContent,
  referenceImages,
}: SavePromptDialogProps) {
  const { toast } = useToast()
  const createMutation = useCreatePrompt()

  const [title, setTitle] = React.useState('')
  const [category, setCategory] = React.useState<string>('')
  const [tags, setTags] = React.useState<string[]>([])
  const [tagInput, setTagInput] = React.useState('')

  // Debug: log das URLs recebidas
  React.useEffect(() => {
    if (referenceImages.length > 0) {
      console.log('[SavePromptDialog] URLs de referência recebidas:', referenceImages)
    }
  }, [referenceImages])

  // Resetar form ao fechar
  React.useEffect(() => {
    if (!open) {
      setTitle('')
      setCategory('')
      setTags([])
      setTagInput('')
    }
  }, [open])

  const handleAddTag = () => {
    const trimmedTag = tagInput.trim()
    if (trimmedTag && !tags.includes(trimmedTag)) {
      setTags([...tags, trimmedTag])
      setTagInput('')
    }
  }

  const handleRemoveTag = (tagToRemove: string) => {
    setTags(tags.filter((tag) => tag !== tagToRemove))
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      handleAddTag()
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!title.trim()) {
      toast({
        variant: 'destructive',
        description: 'Título é obrigatório',
      })
      return
    }

    const data = {
      title: title.trim(),
      content: promptContent,
      category: category && category !== 'none' ? category : undefined,
      tags,
      referenceImages,
    }

    try {
      await createMutation.mutateAsync(data)
      toast({ description: 'Prompt salvo com sucesso na biblioteca!' })
      onOpenChange(false)
    } catch (_error) {
      toast({
        variant: 'destructive',
        description: 'Erro ao salvar prompt',
      })
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-[650px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Save className="h-5 w-5" />
            Salvar Prompt na Biblioteca
          </DialogTitle>
          <DialogDescription>
            Salve este prompt com as imagens de referência para reutilizar depois
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Preview do Prompt */}
          <div className="space-y-2">
            <Label>Prompt Utilizado</Label>
            <div className="rounded-md border bg-muted p-3">
              <p className="text-sm leading-relaxed">
                {promptContent || 'Nenhum prompt fornecido'}
              </p>
            </div>
          </div>

          {/* Imagens de Referência */}
          {referenceImages.length > 0 && (
            <div className="space-y-2">
              <Label>Imagens de Referência ({referenceImages.length})</Label>
              <ReferenceImagesGrid images={referenceImages} editable={false} />
            </div>
          )}

          {/* Título */}
          <div className="space-y-2">
            <Label htmlFor="title">Título *</Label>
            <Input
              id="title"
              placeholder="Ex: Logo Minimalista Azul"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              disabled={createMutation.isPending}
              required
            />
          </div>

          {/* Categoria */}
          <div className="space-y-2">
            <Label htmlFor="category">Categoria (opcional)</Label>
            <Select
              value={category}
              onValueChange={setCategory}
              disabled={createMutation.isPending}
            >
              <SelectTrigger id="category">
                <SelectValue placeholder="Selecione uma categoria" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Sem categoria</SelectItem>
                {PROMPT_CATEGORIES.map((cat) => (
                  <SelectItem key={cat} value={cat}>
                    {cat}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Tags */}
          <div className="space-y-2">
            <Label htmlFor="tags">Tags (opcional)</Label>
            <div className="flex gap-2">
              <Input
                id="tags"
                placeholder="Adicione uma tag..."
                value={tagInput}
                onChange={(e) => setTagInput(e.target.value)}
                onKeyDown={handleKeyDown}
                disabled={createMutation.isPending}
              />
              <Button
                type="button"
                variant="outline"
                onClick={handleAddTag}
                disabled={createMutation.isPending || !tagInput.trim()}
              >
                Adicionar
              </Button>
            </div>

            {tags.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-2">
                {tags.map((tag) => (
                  <Badge key={tag} variant="secondary" className="gap-1">
                    {tag}
                    <button
                      type="button"
                      onClick={() => handleRemoveTag(tag)}
                      className="ml-1 hover:text-destructive"
                      disabled={createMutation.isPending}
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </Badge>
                ))}
              </div>
            )}
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={createMutation.isPending}
            >
              Cancelar
            </Button>
            <Button type="submit" disabled={createMutation.isPending}>
              {createMutation.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Salvando...
                </>
              ) : (
                <>
                  <Save className="mr-2 h-4 w-4" />
                  Salvar na Biblioteca
                </>
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
