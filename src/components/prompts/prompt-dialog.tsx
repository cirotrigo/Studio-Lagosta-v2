"use client"

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
import { X, Loader2 } from 'lucide-react'
import { useCreatePrompt, useUpdatePrompt } from '@/hooks/use-prompts'
import { useToast } from '@/hooks/use-toast'
import type { Prompt } from '@/types/prompt'
import { PROMPT_CATEGORIES } from '@/types/prompt'
import { ReferenceImagesGrid } from './reference-images-grid'

interface PromptDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  prompt?: Prompt
  mode: 'create' | 'edit'
}

export function PromptDialog({ open, onOpenChange, prompt, mode }: PromptDialogProps) {
  const { toast } = useToast()
  const createMutation = useCreatePrompt()
  const updateMutation = useUpdatePrompt()

  const [title, setTitle] = React.useState('')
  const [content, setContent] = React.useState('')
  const [category, setCategory] = React.useState<string>('')
  const [tags, setTags] = React.useState<string[]>([])
  const [tagInput, setTagInput] = React.useState('')
  const [referenceImages, setReferenceImages] = React.useState<string[]>([])
  const [referenceImageInput, setReferenceImageInput] = React.useState('')

  // Preencher campos quando editando
  React.useEffect(() => {
    if (mode === 'edit' && prompt) {
      setTitle(prompt.title)
      setContent(prompt.content)
      setCategory(prompt.category || '')
      setTags(prompt.tags)
      setReferenceImages(prompt.referenceImages)
    } else {
      resetForm()
    }
  }, [mode, prompt])

  const resetForm = () => {
    setTitle('')
    setContent('')
    setCategory('')
    setTags([])
    setTagInput('')
    setReferenceImages([])
    setReferenceImageInput('')
  }

  const handleAddTag = () => {
    const trimmedTag = tagInput.trim()
    if (trimmedTag && !tags.includes(trimmedTag)) {
      setTags([...tags, trimmedTag])
      setTagInput('')
    }
  }

  const handleRemoveTag = (tagToRemove: string) => {
    setTags(tags.filter(tag => tag !== tagToRemove))
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      handleAddTag()
    }
  }

  const handleAddReferenceImage = () => {
    const trimmedUrl = referenceImageInput.trim()
    // Validação básica de URL
    try {
      new URL(trimmedUrl)
      if (!referenceImages.includes(trimmedUrl)) {
        setReferenceImages([...referenceImages, trimmedUrl])
        setReferenceImageInput('')
      } else {
        toast({
          variant: 'destructive',
          description: 'Esta URL já foi adicionada',
        })
      }
    } catch {
      toast({
        variant: 'destructive',
        description: 'URL inválida',
      })
    }
  }

  const handleRemoveReferenceImage = (index: number) => {
    setReferenceImages(referenceImages.filter((_, i) => i !== index))
  }

  const handleReferenceImageKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      handleAddReferenceImage()
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!title.trim() || !content.trim()) {
      toast({
        variant: 'destructive',
        description: 'Título e conteúdo são obrigatórios',
      })
      return
    }

    const data = {
      title: title.trim(),
      content: content.trim(),
      category: category && category !== 'none' ? category : undefined,
      tags,
      referenceImages,
    }

    try {
      if (mode === 'create') {
        await createMutation.mutateAsync(data)
        toast({ description: 'Prompt criado com sucesso!' })
      } else if (prompt) {
        await updateMutation.mutateAsync({ promptId: prompt.id, data })
        toast({ description: 'Prompt atualizado com sucesso!' })
      }

      onOpenChange(false)
      resetForm()
    } catch (_error) {
      toast({
        variant: 'destructive',
        description: mode === 'create' ? 'Erro ao criar prompt' : 'Erro ao atualizar prompt',
      })
    }
  }

  const isLoading = createMutation.isPending || updateMutation.isPending

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[600px]">
        <DialogHeader>
          <DialogTitle>
            {mode === 'create' ? 'Novo Prompt' : 'Editar Prompt'}
          </DialogTitle>
          <DialogDescription>
            {mode === 'create'
              ? 'Crie um novo prompt reutilizável para geração de imagens'
              : 'Edite as informações do prompt'}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="title">Título *</Label>
            <Input
              id="title"
              placeholder="Ex: Logo Minimalista"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              disabled={isLoading}
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="content">Conteúdo do Prompt *</Label>
            <Textarea
              id="content"
              placeholder="Descreva detalhadamente o prompt..."
              value={content}
              onChange={(e) => setContent(e.target.value)}
              disabled={isLoading}
              rows={6}
              required
            />
            <p className="text-xs text-muted-foreground">
              {content.length} caracteres
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="category">Categoria (opcional)</Label>
            <Select value={category} onValueChange={setCategory} disabled={isLoading}>
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

          <div className="space-y-2">
            <Label htmlFor="tags">Tags (opcional)</Label>
            <div className="flex gap-2">
              <Input
                id="tags"
                placeholder="Adicione uma tag..."
                value={tagInput}
                onChange={(e) => setTagInput(e.target.value)}
                onKeyDown={handleKeyDown}
                disabled={isLoading}
              />
              <Button
                type="button"
                variant="outline"
                onClick={handleAddTag}
                disabled={isLoading || !tagInput.trim()}
              >
                Adicionar
              </Button>
            </div>

            {tags.length > 0 && (
              <div className="flex flex-wrap gap-2 mt-2">
                {tags.map((tag) => (
                  <Badge key={tag} variant="secondary" className="gap-1">
                    {tag}
                    <button
                      type="button"
                      onClick={() => handleRemoveTag(tag)}
                      className="ml-1 hover:text-destructive"
                      disabled={isLoading}
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </Badge>
                ))}
              </div>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="referenceImages">Imagens de Referência (opcional)</Label>
            <div className="flex gap-2">
              <Input
                id="referenceImages"
                placeholder="Cole a URL de uma imagem..."
                value={referenceImageInput}
                onChange={(e) => setReferenceImageInput(e.target.value)}
                onKeyDown={handleReferenceImageKeyDown}
                disabled={isLoading}
              />
              <Button
                type="button"
                variant="outline"
                onClick={handleAddReferenceImage}
                disabled={isLoading || !referenceImageInput.trim()}
              >
                Adicionar
              </Button>
            </div>

            {referenceImages.length > 0 && (
              <ReferenceImagesGrid
                images={referenceImages}
                editable={true}
                onRemove={handleRemoveReferenceImage}
                className="mt-2"
              />
            )}
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={isLoading}
            >
              Cancelar
            </Button>
            <Button type="submit" disabled={isLoading}>
              {isLoading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  {mode === 'create' ? 'Criando...' : 'Salvando...'}
                </>
              ) : (
                mode === 'create' ? 'Criar Prompt' : 'Salvar Alterações'
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
