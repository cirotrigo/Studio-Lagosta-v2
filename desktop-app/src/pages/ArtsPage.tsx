import { useMemo } from 'react'
import { Download, Loader2, Send, Trash2, Image as ImageIcon } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import { API_BASE_URL } from '@/lib/constants'
import { useProjectStore } from '@/stores/project.store'
import ProjectBadge from '@/components/layout/ProjectBadge'
import {
  useDeleteGeneration,
  useProjectGenerations,
  type ProjectGenerationRecord,
} from '@/hooks/use-project-generations'
import { cn } from '@/lib/utils'

function resolveGenerationLabel(generation: ProjectGenerationRecord) {
  const pageName =
    typeof generation.fieldValues?.pageName === 'string'
      ? generation.fieldValues.pageName
      : null

  return pageName || generation.templateName || generation.Template?.name || 'Criativo'
}

function resolveGenerationFormat(generation: ProjectGenerationRecord) {
  const fieldFormat =
    typeof generation.fieldValues?.format === 'string' ? generation.fieldValues.format : null

  if (fieldFormat === 'STORY' || fieldFormat === 'FEED_PORTRAIT' || fieldFormat === 'SQUARE') {
    return fieldFormat
  }

  switch (generation.Template?.dimensions) {
    case '1080x1920':
      return 'STORY'
    case '1080x1080':
      return 'SQUARE'
    case '1080x1350':
    default:
      return 'FEED_PORTRAIT'
  }
}

function getAspectClass(format: 'STORY' | 'FEED_PORTRAIT' | 'SQUARE') {
  switch (format) {
    case 'STORY':
      return 'aspect-[9/16]'
    case 'SQUARE':
      return 'aspect-square'
    case 'FEED_PORTRAIT':
    default:
      return 'aspect-[4/5]'
  }
}

function formatDateTime(value: string) {
  return new Date(value).toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export default function ArtsPage() {
  const navigate = useNavigate()
  const currentProject = useProjectStore((state) => state.currentProject)
  const generationsQuery = useProjectGenerations(currentProject?.id)
  const deleteGeneration = useDeleteGeneration(currentProject?.id)

  const generations = useMemo(
    () =>
      (generationsQuery.data?.generations ?? []).filter(
        (generation) => generation.status === 'COMPLETED' && generation.resultUrl,
      ),
    [generationsQuery.data?.generations],
  )

  if (!currentProject) {
    return (
      <div className="flex h-full flex-col items-center justify-center p-8">
        <div className="text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/10">
            <ImageIcon size={32} className="text-primary" />
          </div>
          <h2 className="text-xl font-semibold text-text">Selecione um projeto</h2>
          <p className="mt-2 text-text-muted">
            Escolha um projeto na barra lateral para ver as artes geradas.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b border-border p-4">
        <div>
          <h1 className="text-xl font-semibold text-text">Artes</h1>
          <p className="text-sm text-text-muted">
            Criativos salvos no projeto e prontos para baixar, postar ou excluir.
          </p>
        </div>

        <ProjectBadge project={currentProject} />
      </div>

      <div className="flex-1 overflow-auto p-4">
        {generationsQuery.isLoading ? (
          <div className="flex h-full items-center justify-center">
            <div className="flex flex-col items-center gap-3">
              <Loader2 size={28} className="animate-spin text-primary" />
              <p className="text-sm text-text-muted">Carregando artes...</p>
            </div>
          </div>
        ) : generationsQuery.isError ? (
          <div className="flex h-full items-center justify-center">
            <div className="rounded-2xl border border-error/30 bg-card/70 p-6 text-center">
              <p className="text-sm text-error">
                {generationsQuery.error instanceof Error
                  ? generationsQuery.error.message
                  : 'Erro ao carregar artes.'}
              </p>
            </div>
          </div>
        ) : generations.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center">
            <div className="text-center">
              <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-card">
                <ImageIcon size={32} className="text-text-muted" />
              </div>
              <h3 className="text-lg font-medium text-text">Nenhuma arte gerada ainda</h3>
              <p className="mt-2 text-text-muted">
                Gere criativos no editor para que aparecam aqui.
              </p>
            </div>
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {generations.map((generation) => {
              const label = resolveGenerationLabel(generation)
              const imageUrl = generation.resultUrl
              const format = resolveGenerationFormat(generation)

              return (
                <div
                  key={generation.id}
                  className="overflow-hidden rounded-2xl border border-border bg-card/70"
                >
                  <div
                    className={cn(
                      'flex items-center justify-center overflow-hidden bg-[#0c111d] p-3',
                      getAspectClass(format),
                    )}
                  >
                    {imageUrl ? (
                      <img
                        src={imageUrl}
                        alt={label}
                        className="max-h-full max-w-full rounded-lg object-contain"
                      />
                    ) : (
                      <div className="flex h-full items-center justify-center">
                        <ImageIcon size={28} className="text-text-muted" />
                      </div>
                    )}
                  </div>

                  <div className="space-y-3 p-4">
                    <div>
                      <p className="truncate text-sm font-semibold text-text">{label}</p>
                      <p className="mt-1 text-xs text-text-muted">
                        {formatDateTime(generation.createdAt)}
                      </p>
                    </div>

                    <div className="grid grid-cols-3 gap-2">
                      <button
                        type="button"
                        onClick={async () => {
                          if (!generation.id) {
                            return
                          }

                          try {
                            const response = await window.electronAPI.downloadBlob(
                              `${API_BASE_URL}/api/generations/${generation.id}/download`,
                            )

                            if (!response.ok || !response.buffer) {
                              throw new Error(response.error || 'Falha ao baixar arte')
                            }

                            const blob = new Blob([response.buffer], {
                              type: response.contentType || 'image/jpeg',
                            })
                            const objectUrl = URL.createObjectURL(blob)
                            const link = document.createElement('a')
                            link.href = objectUrl
                            link.download = generation.fileName || `${label}.jpg`
                            document.body.appendChild(link)
                            link.click()
                            document.body.removeChild(link)
                            URL.revokeObjectURL(objectUrl)
                            toast.success('Arte baixada com sucesso.')
                          } catch (error) {
                            toast.error(
                              error instanceof Error ? error.message : 'Erro ao baixar arte.',
                            )
                          }
                        }}
                        className="flex h-10 items-center justify-center rounded-xl border border-border text-text transition-colors hover:border-primary/40"
                        title="Baixar"
                      >
                        <Download size={16} />
                      </button>

                      <button
                        type="button"
                        onClick={() =>
                          navigate('/new-post', {
                            state: {
                              imageUrl,
                              postType: 'STORY',
                            },
                          })}
                        className="flex h-10 items-center justify-center rounded-xl border border-border text-text transition-colors hover:border-primary/40"
                        title="Postar"
                      >
                        <Send size={16} />
                      </button>

                      <button
                        type="button"
                        disabled={deleteGeneration.isPending}
                        onClick={async () => {
                          try {
                            await deleteGeneration.mutateAsync(generation.id)
                            toast.success('Arte excluida com sucesso.')
                          } catch (error) {
                            toast.error(
                              error instanceof Error ? error.message : 'Erro ao excluir arte.',
                            )
                          }
                        }}
                        className="flex h-10 items-center justify-center rounded-xl border border-border text-text transition-colors hover:border-error/40 hover:text-error disabled:opacity-50"
                        title="Excluir"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
