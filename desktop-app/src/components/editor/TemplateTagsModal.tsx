import { useState, useEffect } from 'react'
import { X, Tag, AlertCircle } from 'lucide-react'
import { toast } from 'sonner'
import { useQueryClient } from '@tanstack/react-query'
import { useTagsStore } from '@/stores/tags.store'
import { api, ApiError } from '@/lib/api-client'
import type { Design } from '@/hooks/use-project-designs'
import { cn } from '@/lib/utils'

interface TemplateTagsModalProps {
  isOpen: boolean
  onClose: () => void
  design: Design | null
  projectId: number | undefined
}

export function TemplateTagsModal({
  isOpen,
  onClose,
  design,
  projectId,
}: TemplateTagsModalProps) {
  const queryClient = useQueryClient()
  const projectTags = useTagsStore((state) => state.tags)

  const [selectedTags, setSelectedTags] = useState<string[]>([])
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Initialize selected tags from design
  useEffect(() => {
    if (isOpen && design) {
      setSelectedTags(design.tags ?? [])
      setError(null)
    }
  }, [isOpen, design])

  if (!isOpen || !design) return null

  const toggleTag = (tagName: string) => {
    const normalizedName = tagName.toLowerCase()
    const hasTag = selectedTags.some((t) => t.toLowerCase() === normalizedName)

    if (hasTag) {
      // Check if removing would leave no tags
      const newTags = selectedTags.filter((t) => t.toLowerCase() !== normalizedName)
      if (newTags.length === 0) {
        setError('O design deve ter pelo menos 1 tag')
        return
      }
      setSelectedTags(newTags)
      setError(null)
    } else {
      setSelectedTags([...selectedTags, tagName])
      setError(null)
    }
  }

  const handleSave = async () => {
    if (selectedTags.length === 0) {
      setError('O design deve ter pelo menos 1 tag')
      return
    }

    if (!projectId) {
      toast.error('Projeto nao selecionado')
      return
    }

    try {
      setIsSaving(true)
      setError(null)

      await api.patch(`/api/projects/${projectId}/designs/${design.id}/tags`, {
        tags: selectedTags,
      })

      // Invalidate queries to refresh the gallery
      await queryClient.invalidateQueries({ queryKey: ['project-designs', projectId] })

      toast.success('Tags atualizadas com sucesso')
      onClose()
    } catch (err) {
      console.error('[TemplateTagsModal] Falha ao salvar tags:', err)
      if (err instanceof ApiError) {
        setError(err.message)
      } else {
        setError('Falha ao salvar tags')
      }
    } finally {
      setIsSaving(false)
    }
  }

  const getTagColor = (tagName: string): string => {
    const tag = projectTags.find((t) => t.name.toLowerCase() === tagName.toLowerCase())
    return tag?.color ?? '#6B7280'
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-2xl border border-border bg-card p-6 shadow-xl">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Tag size={20} className="text-primary" />
            <h2 className="text-lg font-semibold text-text">Tags do Design</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={isSaving}
            className="rounded-lg p-2 text-text-muted hover:bg-input hover:text-text disabled:opacity-50"
          >
            <X size={20} />
          </button>
        </div>

        <p className="mt-2 text-sm text-text-muted">
          Design: <span className="font-medium text-text">{design.name}</span>
        </p>
        <p className="text-xs text-text-subtle">
          Template: {design.templateName}
        </p>

        {/* Error message */}
        {error && (
          <div className="mt-3 flex items-center gap-2 rounded-lg border border-error/30 bg-error/10 px-3 py-2 text-sm text-error">
            <AlertCircle size={16} />
            {error}
          </div>
        )}

        <div className="mt-4">
          {projectTags.length === 0 ? (
            <p className="py-4 text-center text-sm text-text-muted">
              Nenhuma tag cadastrada neste projeto.
              <br />
              <span className="text-xs text-text-subtle">
                Crie tags no gerenciador de tags antes de continuar.
              </span>
            </p>
          ) : (
            <div className="space-y-2">
              <p className="text-xs font-medium uppercase tracking-[0.16em] text-text-subtle">
                Selecione as tags (minimo 1)
              </p>
              <div className="flex flex-wrap gap-2">
                {projectTags.map((tag) => {
                  const isSelected = selectedTags.some(
                    (t) => t.toLowerCase() === tag.name.toLowerCase(),
                  )

                  return (
                    <button
                      key={tag.id}
                      type="button"
                      onClick={() => toggleTag(tag.name)}
                      disabled={isSaving}
                      className={cn(
                        'inline-flex items-center gap-1.5 rounded-lg border-2 px-3 py-1.5 text-sm font-medium transition-colors disabled:opacity-50',
                        isSelected
                          ? 'border-transparent text-white'
                          : 'border-border bg-input text-text-muted hover:border-primary/40',
                      )}
                      style={isSelected ? { backgroundColor: tag.color } : undefined}
                    >
                      <Tag size={14} />
                      {tag.name}
                    </button>
                  )
                })}
              </div>
            </div>
          )}
        </div>

        {selectedTags.length > 0 && (
          <div className="mt-4 rounded-lg border border-border bg-input/50 p-3">
            <p className="text-xs font-medium uppercase tracking-[0.16em] text-text-subtle">
              Tags selecionadas ({selectedTags.length})
            </p>
            <div className="mt-2 flex flex-wrap gap-1">
              {selectedTags.map((tagName) => (
                <span
                  key={tagName}
                  className="inline-flex items-center gap-1 rounded px-2 py-0.5 text-xs font-medium text-white"
                  style={{ backgroundColor: getTagColor(tagName) }}
                >
                  {tagName}
                  <button
                    type="button"
                    onClick={() => toggleTag(tagName)}
                    disabled={isSaving}
                    className="rounded-full p-0.5 hover:bg-white/20 disabled:opacity-50"
                  >
                    <X size={10} />
                  </button>
                </span>
              ))}
            </div>
          </div>
        )}

        <div className="mt-6 flex justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            disabled={isSaving}
            className="rounded-xl border border-border px-4 py-2 text-sm font-medium text-text-muted hover:border-primary/40 hover:text-text disabled:opacity-50"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={isSaving || selectedTags.length === 0}
            className="rounded-xl bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary-hover disabled:opacity-50"
          >
            {isSaving ? 'Salvando...' : 'Salvar'}
          </button>
        </div>
      </div>
    </div>
  )
}
