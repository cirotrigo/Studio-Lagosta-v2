import { useState, useEffect } from 'react'
import { X, Tag, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { useQueryClient } from '@tanstack/react-query'
import { useTagsStore } from '@/stores/tags.store'
import { useEditorStore, selectCurrentPageState } from '@/stores/editor.store'
import { useProjectStore } from '@/stores/project.store'
import { api, ApiError } from '@/lib/api-client'
import { cn } from '@/lib/utils'

interface PageTagsModalProps {
  isOpen: boolean
  onClose: () => void
}

export function PageTagsModal({ isOpen, onClose }: PageTagsModalProps) {
  const queryClient = useQueryClient()
  const projectTags = useTagsStore((state) => state.tags)
  const currentPage = useEditorStore(selectCurrentPageState)
  const document = useEditorStore((state) => state.document)
  const updatePage = useEditorStore((state) => state.updatePage)
  const currentProject = useProjectStore((state) => state.currentProject)

  const [selectedTags, setSelectedTags] = useState<string[]>([])
  const [isSaving, setIsSaving] = useState(false)

  // Initialize selected tags from current page
  useEffect(() => {
    if (isOpen && currentPage) {
      setSelectedTags(currentPage.tags ?? [])
    }
  }, [isOpen, currentPage])

  if (!isOpen || !currentPage) return null

  const toggleTag = (tagName: string) => {
    const normalizedName = tagName.toLowerCase()
    const hasTag = selectedTags.some((t) => t.toLowerCase() === normalizedName)

    if (hasTag) {
      setSelectedTags(selectedTags.filter((t) => t.toLowerCase() !== normalizedName))
    } else {
      setSelectedTags([...selectedTags, tagName])
    }
  }

  const handleSave = async () => {
    // Update locally first
    updatePage(currentPage.id, { tags: selectedTags })

    // Also sync to server if template has a remote ID
    const remoteId = document?.meta?.remoteId
    if (remoteId && currentProject?.id) {
      setIsSaving(true)
      try {
        // Try to sync tags to server
        await api.patch(`/api/projects/${currentProject.id}/designs/${currentPage.id}/tags`, {
          tags: selectedTags,
        })
        // Invalidate queries to refresh the carousel
        await queryClient.invalidateQueries({ queryKey: ['project-designs', currentProject.id] })
        toast.success('Tags atualizadas')
      } catch (error) {
        // If page doesn't exist on server yet, that's OK - it will sync when template is saved
        if (error instanceof ApiError && error.status !== 404) {
          console.warn('[PageTagsModal] Failed to sync tags to server:', error)
          toast.info('Tags salvas localmente. Sincronize o template para atualizar no servidor.')
        }
      } finally {
        setIsSaving(false)
      }
    }

    onClose()
  }

  const getTagColor = (tagName: string): string => {
    const tag = projectTags.find((t) => t.name.toLowerCase() === tagName.toLowerCase())
    return tag?.color ?? '#6B7280'
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-2xl border border-border bg-[#0a0a0a] p-6 shadow-xl">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Tag size={20} className="text-primary" />
            <h2 className="text-lg font-semibold text-text">Tags da Pagina</h2>
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
          Pagina: <span className="font-medium text-text">{currentPage.name}</span>
        </p>

        <div className="mt-4">
          {projectTags.length === 0 ? (
            <p className="py-4 text-center text-sm text-text-muted">
              Nenhuma tag cadastrada neste projeto.
              <br />
              <span className="text-xs text-text-subtle">
                As tags sao gerenciadas no painel web do projeto.
              </span>
            </p>
          ) : (
            <div className="space-y-2">
              <p className="text-xs font-medium uppercase tracking-[0.16em] text-text-subtle">
                Selecione as tags
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
                      className={cn(
                        'inline-flex items-center gap-1.5 rounded-lg border-2 px-3 py-1.5 text-sm font-medium transition-colors',
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
          <div className="mt-4 rounded-lg border border-border bg-white/[0.03] p-3">
            <p className="text-xs font-medium uppercase tracking-[0.16em] text-text-subtle">
              Tags selecionadas
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
                    className="hover:bg-white/20 rounded-full p-0.5"
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
            disabled={isSaving}
            className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary-hover disabled:opacity-50"
          >
            {isSaving && <Loader2 size={14} className="animate-spin" />}
            {isSaving ? 'Salvando...' : 'Salvar'}
          </button>
        </div>
      </div>
    </div>
  )
}
