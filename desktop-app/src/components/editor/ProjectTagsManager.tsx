import { useState } from 'react'
import { Plus, Pencil, Trash2, Check, X, Loader2, Tag, Settings2 } from 'lucide-react'
import { toast } from 'sonner'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { api, ApiError } from '@/lib/api-client'
import { useTagsStore } from '@/stores/tags.store'
import { useAuthStore } from '@/stores/auth.store'
import type { ProjectTag } from '@/types/template'

interface ProjectTagsManagerProps {
  projectId: number
  isOpen: boolean
  onClose: () => void
}

export function ProjectTagsManager({ projectId, isOpen, onClose }: ProjectTagsManagerProps) {
  const queryClient = useQueryClient()
  const { logout } = useAuthStore()
  const tags = useTagsStore((state) => state.tags)
  const setTags = useTagsStore((state) => state.setTags)

  const [newTagName, setNewTagName] = useState('')
  const [editingTagId, setEditingTagId] = useState<string | null>(null)
  const [editingTagName, setEditingTagName] = useState('')

  const createMutation = useMutation({
    mutationFn: async (name: string) => {
      try {
        return await api.post<ProjectTag>(`/api/projects/${projectId}/tags`, { name })
      } catch (error) {
        if (error instanceof ApiError && error.status === 401) {
          await logout()
        }
        throw error
      }
    },
    onSuccess: (newTag) => {
      setTags([...tags, newTag])
      queryClient.invalidateQueries({ queryKey: ['project-tags', projectId] })
      setNewTagName('')
      toast.success('Tag criada com sucesso!')
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : 'Erro ao criar tag')
    },
  })

  const updateMutation = useMutation({
    mutationFn: async ({ tagId, name }: { tagId: string; name: string }) => {
      try {
        return await api.put<ProjectTag>(`/api/projects/${projectId}/tags/${tagId}`, { name })
      } catch (error) {
        if (error instanceof ApiError && error.status === 401) {
          await logout()
        }
        throw error
      }
    },
    onSuccess: (updatedTag) => {
      setTags(tags.map((t) => (t.id === updatedTag.id ? updatedTag : t)))
      queryClient.invalidateQueries({ queryKey: ['project-tags', projectId] })
      setEditingTagId(null)
      setEditingTagName('')
      toast.success('Tag atualizada!')
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : 'Erro ao atualizar tag')
    },
  })

  const deleteMutation = useMutation({
    mutationFn: async (tagId: string) => {
      try {
        return await api.delete(`/api/projects/${projectId}/tags/${tagId}`)
      } catch (error) {
        if (error instanceof ApiError && error.status === 401) {
          await logout()
        }
        throw error
      }
    },
    onSuccess: (_, tagId) => {
      setTags(tags.filter((t) => t.id !== tagId))
      queryClient.invalidateQueries({ queryKey: ['project-tags', projectId] })
      toast.success('Tag removida!')
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : 'Erro ao remover tag')
    },
  })

  const handleCreate = () => {
    const trimmed = newTagName.trim()
    if (!trimmed) {
      toast.error('Digite um nome para a tag')
      return
    }

    if (tags.some((t) => t.name.toLowerCase() === trimmed.toLowerCase())) {
      toast.error('Ja existe uma tag com esse nome')
      return
    }

    createMutation.mutate(trimmed)
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

    const currentTag = tags.find((t) => t.id === tagId)
    if (currentTag && currentTag.name.toLowerCase() === trimmed.toLowerCase()) {
      handleCancelEdit()
      return
    }

    if (tags.some((t) => t.id !== tagId && t.name.toLowerCase() === trimmed.toLowerCase())) {
      toast.error('Ja existe uma tag com esse nome')
      return
    }

    updateMutation.mutate({ tagId, name: trimmed })
  }

  const handleDelete = (tag: ProjectTag) => {
    if (tag.name.toLowerCase() === 'template') {
      toast.error('A tag "Template" nao pode ser removida')
      return
    }

    deleteMutation.mutate(tag.id)
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-2xl border border-border bg-card p-6 shadow-xl">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Settings2 size={20} className="text-primary" />
            <h2 className="text-lg font-semibold text-text">Gerenciar Tags</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-2 text-text-muted hover:bg-input hover:text-text"
          >
            <X size={20} />
          </button>
        </div>

        <p className="mt-2 text-sm text-text-muted">
          Crie e gerencie as tags que podem ser aplicadas as paginas dos templates.
        </p>

        <div className="mt-4 space-y-4">
          {/* Create new tag */}
          <div className="flex gap-2">
            <input
              type="text"
              placeholder="Nome da nova tag..."
              value={newTagName}
              onChange={(e) => setNewTagName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  handleCreate()
                }
              }}
              className="flex-1 rounded-lg border border-border bg-input px-3 py-2 text-sm text-text placeholder:text-text-subtle focus:border-primary focus:outline-none"
            />
            <button
              type="button"
              onClick={handleCreate}
              disabled={createMutation.isPending || !newTagName.trim()}
              className="flex items-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:bg-primary-hover disabled:opacity-50"
            >
              {createMutation.isPending ? (
                <Loader2 size={16} className="animate-spin" />
              ) : (
                <Plus size={16} />
              )}
              Adicionar
            </button>
          </div>

          {/* Tags list */}
          <div className="max-h-[300px] space-y-2 overflow-y-auto">
            {tags.length === 0 ? (
              <div className="py-8 text-center">
                <Tag size={32} className="mx-auto mb-2 text-text-subtle opacity-50" />
                <p className="text-sm text-text-muted">Nenhuma tag cadastrada</p>
                <p className="mt-1 text-xs text-text-subtle">
                  A tag "Template" sera criada automaticamente
                </p>
              </div>
            ) : (
              tags.map((tag) => (
                <div
                  key={tag.id}
                  className="flex items-center gap-3 rounded-lg border border-border bg-background/50 p-3"
                >
                  {/* Color indicator */}
                  <span
                    className="h-4 w-4 flex-shrink-0 rounded-full"
                    style={{ backgroundColor: tag.color }}
                  />

                  {/* Tag name */}
                  {editingTagId === tag.id ? (
                    <input
                      type="text"
                      value={editingTagName}
                      onChange={(e) => setEditingTagName(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          handleSaveEdit(tag.id)
                        } else if (e.key === 'Escape') {
                          handleCancelEdit()
                        }
                      }}
                      className="flex-1 rounded border border-border bg-input px-2 py-1 text-sm text-text focus:border-primary focus:outline-none"
                      autoFocus
                    />
                  ) : (
                    <span className="flex-1 text-sm font-medium text-text">{tag.name}</span>
                  )}

                  {/* Actions */}
                  <div className="flex items-center gap-1">
                    {editingTagId === tag.id ? (
                      <>
                        <button
                          type="button"
                          onClick={() => handleSaveEdit(tag.id)}
                          disabled={updateMutation.isPending}
                          className="rounded p-1.5 text-green-500 hover:bg-green-500/10"
                        >
                          {updateMutation.isPending ? (
                            <Loader2 size={14} className="animate-spin" />
                          ) : (
                            <Check size={14} />
                          )}
                        </button>
                        <button
                          type="button"
                          onClick={handleCancelEdit}
                          className="rounded p-1.5 text-text-muted hover:bg-input"
                        >
                          <X size={14} />
                        </button>
                      </>
                    ) : (
                      <>
                        {tag.name.toLowerCase() !== 'template' && (
                          <button
                            type="button"
                            onClick={() => handleStartEdit(tag)}
                            className="rounded p-1.5 text-text-muted hover:bg-input hover:text-text"
                          >
                            <Pencil size={14} />
                          </button>
                        )}
                        {tag.name.toLowerCase() !== 'template' ? (
                          <button
                            type="button"
                            onClick={() => handleDelete(tag)}
                            disabled={deleteMutation.isPending}
                            className="rounded p-1.5 text-text-muted hover:bg-error/10 hover:text-error"
                          >
                            {deleteMutation.isPending ? (
                              <Loader2 size={14} className="animate-spin" />
                            ) : (
                              <Trash2 size={14} />
                            )}
                          </button>
                        ) : (
                          <span className="px-2 text-xs text-text-subtle">Padrao</span>
                        )}
                      </>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>

          {/* Help text */}
          <p className="text-xs text-text-subtle">
            Paginas com a tag "Template" aparecem por padrao no Editor. Use tags para organizar
            seus templates por categoria ou campanha.
          </p>
        </div>

        <div className="mt-6 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary-hover"
          >
            Fechar
          </button>
        </div>
      </div>
    </div>
  )
}
