'use client'

import { useState } from 'react'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Plus, Tag, Trash2, Pencil, Check, X, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import {
  useProjectTags,
  useCreateProjectTag,
  useUpdateProjectTag,
  useDeleteProjectTag,
  type ProjectTag,
} from '@/hooks/use-project-tags'

interface ProjectTagsConfigProps {
  projectId: number
}

export function ProjectTagsConfig({ projectId }: ProjectTagsConfigProps) {
  const [newTagName, setNewTagName] = useState('')
  const [editingTagId, setEditingTagId] = useState<string | null>(null)
  const [editingTagName, setEditingTagName] = useState('')

  const { data: tags, isLoading } = useProjectTags({ projectId })
  const createMutation = useCreateProjectTag()
  const updateMutation = useUpdateProjectTag()
  const deleteMutation = useDeleteProjectTag()

  const handleCreate = () => {
    const trimmed = newTagName.trim()
    if (!trimmed) {
      toast.error('Digite um nome para a tag')
      return
    }

    // Check if tag already exists (case-insensitive)
    if (tags?.some((t) => t.name.toLowerCase() === trimmed.toLowerCase())) {
      toast.error('Ja existe uma tag com esse nome')
      return
    }

    createMutation.mutate(
      { projectId, name: trimmed },
      {
        onSuccess: () => {
          setNewTagName('')
          toast.success('Tag criada com sucesso!')
        },
        onError: (error) => {
          toast.error(error instanceof Error ? error.message : 'Erro ao criar tag')
        },
      },
    )
  }

  const handleStartEdit = (tag: ProjectTag) => {
    setEditingTagId(tag.id)
    setEditingTagName(tag.name)
  }

  const handleCancelEdit = () => {
    setEditingTagId(null)
    setEditingTagName('')
  }

  const handleSaveEdit = (tagId: string) => {
    const trimmed = editingTagName.trim()
    if (!trimmed) {
      toast.error('O nome da tag nao pode estar vazio')
      return
    }

    const currentTag = tags?.find((t) => t.id === tagId)
    if (currentTag && currentTag.name.toLowerCase() === trimmed.toLowerCase()) {
      handleCancelEdit()
      return
    }

    // Check for duplicates
    if (tags?.some((t) => t.id !== tagId && t.name.toLowerCase() === trimmed.toLowerCase())) {
      toast.error('Ja existe uma tag com esse nome')
      return
    }

    updateMutation.mutate(
      { projectId, tagId, name: trimmed },
      {
        onSuccess: () => {
          handleCancelEdit()
          toast.success('Tag atualizada com sucesso!')
        },
        onError: (error) => {
          toast.error(error instanceof Error ? error.message : 'Erro ao atualizar tag')
        },
      },
    )
  }

  const handleDelete = (tag: ProjectTag) => {
    if (tag.name.toLowerCase() === 'template') {
      toast.error('A tag "Template" nao pode ser removida')
      return
    }

    deleteMutation.mutate(
      { projectId, tagId: tag.id },
      {
        onSuccess: () => {
          toast.success('Tag removida com sucesso!')
        },
        onError: (error) => {
          toast.error(error instanceof Error ? error.message : 'Erro ao remover tag')
        },
      },
    )
  }

  return (
    <Card className="p-6">
      <div className="flex items-start gap-3 mb-6">
        <div className="p-2 bg-amber-500/10 rounded-lg">
          <Tag className="w-5 h-5 text-amber-500" />
        </div>
        <div>
          <h3 className="text-lg font-semibold">Tags do Projeto</h3>
          <p className="text-sm text-muted-foreground">
            Gerencie as tags que podem ser aplicadas as paginas dos templates
          </p>
        </div>
      </div>

      <div className="space-y-4">
        {/* Create new tag */}
        <div className="flex gap-2">
          <Input
            placeholder="Nome da nova tag..."
            value={newTagName}
            onChange={(e) => setNewTagName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                handleCreate()
              }
            }}
            className="flex-1"
          />
          <Button
            onClick={handleCreate}
            disabled={createMutation.isPending || !newTagName.trim()}
          >
            {createMutation.isPending ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Plus className="w-4 h-4" />
            )}
            <span className="ml-2">Adicionar</span>
          </Button>
        </div>

        {/* Tags list */}
        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
          </div>
        ) : tags && tags.length > 0 ? (
          <div className="space-y-2">
            {tags.map((tag) => (
              <div
                key={tag.id}
                className="flex items-center gap-3 p-3 rounded-lg border border-border bg-card/50"
              >
                {/* Color indicator */}
                <span
                  className="w-4 h-4 rounded-full flex-shrink-0"
                  style={{ backgroundColor: tag.color }}
                />

                {/* Tag name (editable) */}
                {editingTagId === tag.id ? (
                  <Input
                    value={editingTagName}
                    onChange={(e) => setEditingTagName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        handleSaveEdit(tag.id)
                      } else if (e.key === 'Escape') {
                        handleCancelEdit()
                      }
                    }}
                    className="flex-1 h-8"
                    autoFocus
                  />
                ) : (
                  <span className="flex-1 text-sm font-medium">{tag.name}</span>
                )}

                {/* Actions */}
                <div className="flex items-center gap-1">
                  {editingTagId === tag.id ? (
                    <>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleSaveEdit(tag.id)}
                        disabled={updateMutation.isPending}
                        className="h-8 w-8 p-0"
                      >
                        {updateMutation.isPending ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                          <Check className="w-4 h-4 text-green-500" />
                        )}
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={handleCancelEdit}
                        className="h-8 w-8 p-0"
                      >
                        <X className="w-4 h-4 text-muted-foreground" />
                      </Button>
                    </>
                  ) : (
                    <>
                      {/* Can only edit non-Template tags */}
                      {tag.name.toLowerCase() !== 'template' && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleStartEdit(tag)}
                          className="h-8 w-8 p-0"
                        >
                          <Pencil className="w-4 h-4 text-muted-foreground" />
                        </Button>
                      )}
                      {/* Can only delete non-Template tags */}
                      {tag.name.toLowerCase() !== 'template' ? (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleDelete(tag)}
                          disabled={deleteMutation.isPending}
                          className="h-8 w-8 p-0"
                        >
                          {deleteMutation.isPending ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                          ) : (
                            <Trash2 className="w-4 h-4 text-destructive" />
                          )}
                        </Button>
                      ) : (
                        <span className="text-xs text-muted-foreground px-2">Padrao</span>
                      )}
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-center py-8 text-muted-foreground">
            <Tag className="w-8 h-8 mx-auto mb-2 opacity-50" />
            <p className="text-sm">Nenhuma tag cadastrada</p>
            <p className="text-xs mt-1">
              A tag "Template" sera criada automaticamente
            </p>
          </div>
        )}

        {/* Help text */}
        <p className="text-xs text-muted-foreground pt-2">
          As tags sao usadas para organizar as paginas dos templates. Paginas com a tag "Template" aparecem no modo Arte Rapida.
        </p>
      </div>
    </Card>
  )
}
