'use client'

import { useState } from 'react'
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { Label } from '@/components/ui/label'
import { Check, X, Plus, Trash2 } from 'lucide-react'
import type { TrainingPreview } from '@/lib/knowledge/training-pipeline'
import { KnowledgeCategory } from '@prisma/client'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

const CATEGORY_LABELS: Record<KnowledgeCategory, string> = {
  ESTABELECIMENTO_INFO: 'Informações Gerais',
  HORARIOS: 'Horários',
  CARDAPIO: 'Cardápio',
  DELIVERY: 'Delivery',
  POLITICAS: 'Políticas',
  TOM_DE_VOZ: 'Tom de Voz',
  CAMPANHAS: 'Campanhas',
  DIFERENCIAIS: 'Diferenciais',
  FAQ: 'FAQ',
}

const OPERATION_CONFIG = {
  CREATE: { emoji: '📝', label: 'Criar', color: 'bg-green-600 hover:bg-green-700' },
  UPDATE: { emoji: '✏️', label: 'Atualizar', color: 'bg-blue-600 hover:bg-blue-700' },
  REPLACE: { emoji: '🔄', label: 'Substituir', color: 'bg-orange-600 hover:bg-orange-700' },
  DELETE: { emoji: '🗑️', label: 'Deletar', color: 'bg-red-600 hover:bg-red-700' },
}

interface EditPreviewFormProps {
  preview: TrainingPreview
  onSave: (updatedPreview: TrainingPreview) => void
  onCancel: () => void
  isLoading?: boolean
}

export function EditPreviewForm({ preview, onSave, onCancel, isLoading = false }: EditPreviewFormProps) {
  const config = OPERATION_CONFIG[preview.operation]

  const [title, setTitle] = useState(preview.title)
  const [content, setContent] = useState(preview.content)
  const [category, setCategory] = useState<KnowledgeCategory>(preview.category)
  const [tags, setTags] = useState<string[]>(preview.tags)
  const [newTag, setNewTag] = useState('')
  const [metadataJson, setMetadataJson] = useState(
    preview.metadata ? JSON.stringify(preview.metadata, null, 2) : ''
  )
  const [metadataError, setMetadataError] = useState('')

  const handleAddTag = () => {
    const trimmed = newTag.trim()
    if (trimmed && !tags.includes(trimmed)) {
      setTags([...tags, trimmed])
      setNewTag('')
    }
  }

  const handleRemoveTag = (tagToRemove: string) => {
    setTags(tags.filter(t => t !== tagToRemove))
  }

  const handleSave = () => {
    // Validar metadata JSON se houver
    let parsedMetadata: Record<string, unknown> | undefined

    if (metadataJson.trim()) {
      try {
        parsedMetadata = JSON.parse(metadataJson)
        setMetadataError('')
      } catch (error) {
        setMetadataError('JSON inválido nos metadados')
        return
      }
    }

    // Criar preview atualizado
    const updatedPreview: TrainingPreview = {
      ...preview,
      title,
      content,
      category,
      tags,
      metadata: parsedMetadata,
    }

    onSave(updatedPreview)
  }

  return (
    <Card className="border-2 border-primary/30 bg-gradient-to-br from-primary/5 via-background to-background">
      <CardHeader>
        <div className="flex items-center gap-3">
          <span className="text-3xl">{config.emoji}</span>
          <CardTitle className="text-lg">Editar {config.label} conhecimento</CardTitle>
        </div>
      </CardHeader>

      <CardContent className="space-y-4 max-h-[60vh] overflow-y-auto pr-2">
        {/* Categoria */}
        <div className="space-y-2">
          <Label htmlFor="category" className="text-xs uppercase tracking-wide text-muted-foreground">
            Categoria
          </Label>
          <Select value={category} onValueChange={(val) => setCategory(val as KnowledgeCategory)}>
            <SelectTrigger id="category">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {Object.entries(CATEGORY_LABELS).map(([key, label]) => (
                <SelectItem key={key} value={key}>
                  {label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Título */}
        <div className="space-y-2">
          <Label htmlFor="title" className="text-xs uppercase tracking-wide text-muted-foreground">
            Título
          </Label>
          <Input
            id="title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Título da entrada..."
            className="font-semibold"
          />
        </div>

        {/* Conteúdo */}
        <div className="space-y-2">
          <Label htmlFor="content" className="text-xs uppercase tracking-wide text-muted-foreground">
            Conteúdo
          </Label>
          <Textarea
            id="content"
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder="Conteúdo da entrada..."
            rows={6}
            className="resize-none font-mono text-sm"
          />
        </div>

        {/* Tags */}
        <div className="space-y-2">
          <Label className="text-xs uppercase tracking-wide text-muted-foreground">Tags</Label>
          <div className="flex gap-2">
            <Input
              value={newTag}
              onChange={(e) => setNewTag(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault()
                  handleAddTag()
                }
              }}
              placeholder="Adicionar tag..."
              className="flex-1"
            />
            <Button type="button" onClick={handleAddTag} variant="outline" size="sm">
              <Plus className="h-4 w-4" />
            </Button>
          </div>
          {tags.length > 0 && (
            <div className="flex flex-wrap gap-2 mt-2">
              {tags.map((tag) => (
                <Badge key={tag} variant="secondary" className="gap-1 text-xs">
                  {tag}
                  <button
                    type="button"
                    onClick={() => handleRemoveTag(tag)}
                    className="ml-1 hover:text-destructive"
                  >
                    <Trash2 className="h-3 w-3" />
                  </button>
                </Badge>
              ))}
            </div>
          )}
        </div>

        {/* Metadados (JSON) */}
        <div className="space-y-2">
          <Label htmlFor="metadata" className="text-xs uppercase tracking-wide text-muted-foreground">
            Metadados (JSON - opcional)
          </Label>
          <Textarea
            id="metadata"
            value={metadataJson}
            onChange={(e) => {
              setMetadataJson(e.target.value)
              setMetadataError('')
            }}
            placeholder='{"chave": "valor"}'
            rows={4}
            className="resize-none font-mono text-xs"
          />
          {metadataError && <p className="text-xs text-destructive">{metadataError}</p>}
        </div>
      </CardContent>

      <CardFooter className="flex gap-2">
        <Button
          onClick={handleSave}
          disabled={isLoading || !title.trim() || !content.trim()}
          className={`flex-1 gap-2 ${config.color}`}
        >
          <Check className="h-4 w-4" />
          {isLoading ? 'Salvando...' : 'Salvar Alterações'}
        </Button>
        <Button onClick={onCancel} disabled={isLoading} variant="ghost" className="gap-2">
          <X className="h-4 w-4" />
          Cancelar
        </Button>
      </CardFooter>
    </Card>
  )
}
