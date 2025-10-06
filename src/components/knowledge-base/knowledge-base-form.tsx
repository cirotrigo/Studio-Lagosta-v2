"use client"

import * as React from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
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
import { X } from 'lucide-react'
import type { EntryStatus, KnowledgeBaseEntry } from '@/hooks/use-knowledge-base'

const formSchema = z.object({
  title: z.string().min(1, 'Título é obrigatório'),
  content: z.string().min(1, 'Conteúdo é obrigatório'),
  status: z.enum(['ACTIVE', 'DRAFT', 'ARCHIVED']),
  tags: z.array(z.string()),
})

type FormData = z.infer<typeof formSchema>

interface KnowledgeBaseFormProps {
  initialData?: KnowledgeBaseEntry
  onSubmit: (data: FormData) => void | Promise<void>
  isLoading?: boolean
  onCancel?: () => void
}

export function KnowledgeBaseForm({
  initialData,
  onSubmit,
  isLoading = false,
  onCancel,
}: KnowledgeBaseFormProps) {
  const [tagInput, setTagInput] = React.useState('')
  const [tags, setTags] = React.useState<string[]>(initialData?.tags || [])

  const {
    register,
    handleSubmit,
    formState: { errors },
    setValue,
    watch,
  } = useForm<FormData>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      title: initialData?.title || '',
      content: initialData?.content || '',
      status: initialData?.status || 'ACTIVE',
      tags: initialData?.tags || [],
    },
  })

  const status = watch('status')

  const handleAddTag = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && tagInput.trim()) {
      e.preventDefault()
      const newTag = tagInput.trim()
      if (!tags.includes(newTag)) {
        const newTags = [...tags, newTag]
        setTags(newTags)
        setValue('tags', newTags)
      }
      setTagInput('')
    }
  }

  const handleRemoveTag = (tagToRemove: string) => {
    const newTags = tags.filter((tag) => tag !== tagToRemove)
    setTags(newTags)
    setValue('tags', newTags)
  }

  const onFormSubmit = async (data: FormData) => {
    await onSubmit(data)
  }

  return (
    <form onSubmit={handleSubmit(onFormSubmit)}>
      <Card className="p-6 space-y-6">
        <div className="space-y-2">
          <Label htmlFor="title">Título *</Label>
          <Input
            id="title"
            {...register('title')}
            placeholder="Digite o título da entrada..."
            disabled={isLoading}
          />
          {errors.title && (
            <p className="text-sm text-red-500">{errors.title.message}</p>
          )}
        </div>

        <div className="space-y-2">
          <Label htmlFor="content">Conteúdo *</Label>
          <Textarea
            id="content"
            {...register('content')}
            placeholder="Digite o conteúdo da entrada..."
            rows={12}
            disabled={isLoading}
            className="resize-none"
          />
          {errors.content && (
            <p className="text-sm text-red-500">{errors.content.message}</p>
          )}
        </div>

        <div className="space-y-2">
          <Label htmlFor="status">Status</Label>
          <Select
            value={status}
            onValueChange={(value) => setValue('status', value as EntryStatus)}
            disabled={isLoading}
          >
            <SelectTrigger id="status">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ACTIVE">Ativo</SelectItem>
              <SelectItem value="DRAFT">Rascunho</SelectItem>
              <SelectItem value="ARCHIVED">Arquivado</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label htmlFor="tags">Tags</Label>
          <Input
            id="tags"
            value={tagInput}
            onChange={(e) => setTagInput(e.target.value)}
            onKeyDown={handleAddTag}
            placeholder="Digite uma tag e pressione Enter..."
            disabled={isLoading}
          />
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

        <div className="flex items-center gap-3 pt-4">
          <Button type="submit" disabled={isLoading}>
            {isLoading ? 'Salvando...' : initialData ? 'Atualizar' : 'Criar'}
          </Button>
          {onCancel && (
            <Button
              type="button"
              variant="outline"
              onClick={onCancel}
              disabled={isLoading}
            >
              Cancelar
            </Button>
          )}
        </div>
      </Card>
    </form>
  )
}
