import { Download, Loader2, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { useEditorGenerationStore } from '@/stores/editor-generation.store'
import { cn } from '@/lib/utils'

function getAspectClass(format: string) {
  switch (format) {
    case 'STORY':
      return 'aspect-[9/16]'
    case 'SQUARE':
      return 'aspect-square'
    default:
      return 'aspect-[4/5]'
  }
}

export function EditorGenerationQueue() {
  const jobs = useEditorGenerationStore((state) => state.jobs)
  const removeJob = useEditorGenerationStore((state) => state.removeJob)
  const clearFinished = useEditorGenerationStore((state) => state.clearFinished)

  if (!jobs.length) {
    return null
  }

  const finishedCount = jobs.filter((job) => job.status === 'done' || job.status === 'error').length

  return (
    <div className="rounded-2xl border border-border bg-card/60 px-4 py-4">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-text">Fila de geração</h2>
          <p className="mt-1 text-xs text-text-muted">
            Jobs do editor continuam processando sem travar o canvas.
          </p>
        </div>

        <button
          type="button"
          disabled={finishedCount === 0}
          onClick={() => clearFinished()}
          className="h-9 rounded-xl border border-border px-3 text-sm text-text transition-colors hover:border-primary/40 disabled:opacity-40"
        >
          Limpar concluídos
        </button>
      </div>

      <div className="space-y-3">
        {jobs.map((job) => (
          <div key={job.id} className="rounded-2xl border border-border bg-background/40 p-4">
            <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-text">{job.pageName}</p>
                <p className="mt-1 text-xs text-text-muted">
                  {job.variations} variação(ões) • fonte: {job.photoSource}
                </p>
              </div>

              <div className="flex items-center gap-2">
                {job.status === 'processing' ? (
                  <span className="inline-flex items-center gap-2 rounded-full bg-primary/10 px-3 py-1 text-xs font-medium text-primary">
                    <Loader2 size={14} className="animate-spin" />
                    Processando
                  </span>
                ) : job.status === 'pending' ? (
                  <span className="rounded-full bg-input px-3 py-1 text-xs font-medium text-text-muted">
                    Na fila
                  </span>
                ) : job.status === 'error' ? (
                  <span className="rounded-full bg-error/10 px-3 py-1 text-xs font-medium text-error">
                    Erro
                  </span>
                ) : (
                  <span className="rounded-full bg-emerald-500/10 px-3 py-1 text-xs font-medium text-emerald-300">
                    Pronto
                  </span>
                )}

                <button
                  type="button"
                  onClick={() => removeJob(job.id)}
                  className="flex h-9 w-9 items-center justify-center rounded-xl border border-border text-text-muted transition-colors hover:border-error/40 hover:text-error"
                >
                  <Trash2 size={15} />
                </button>
              </div>
            </div>

            {job.status === 'error' ? (
              <p className="text-sm text-error">{job.error ?? 'Falha ao gerar a página.'}</p>
            ) : null}

            {job.results.length > 0 ? (
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                {job.results.map((result) => (
                  <div key={result.id} className="rounded-2xl border border-border bg-card p-3">
                    <div className={cn('overflow-hidden rounded-xl border border-border bg-[#0c111d]', getAspectClass(job.format))}>
                      <img
                        src={result.imageUrl}
                        alt={`${job.pageName} variação ${result.variationIndex + 1}`}
                        className="h-full w-full object-cover"
                      />
                    </div>

                    <div className="mt-3 flex items-center justify-between gap-2">
                      <div>
                        <p className="text-sm font-medium text-text">Variação {result.variationIndex + 1}</p>
                        <p className="text-xs text-text-muted">{job.format}</p>
                      </div>

                      <button
                        type="button"
                        onClick={() => {
                          try {
                            const link = document.createElement('a')
                            link.href = result.imageUrl
                            link.download = `${job.pageName.toLowerCase().replace(/\s+/g, '-')}-v${result.variationIndex + 1}.png`
                            document.body.appendChild(link)
                            link.click()
                            document.body.removeChild(link)
                          } catch (_error) {
                            toast.error('Não foi possível baixar a imagem gerada.')
                          }
                        }}
                        className="flex h-9 w-9 items-center justify-center rounded-xl border border-border text-text transition-colors hover:border-primary/40"
                      >
                        <Download size={15} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            ) : job.status !== 'error' ? (
              <div className={cn('w-full overflow-hidden rounded-2xl border border-dashed border-border bg-background/20', getAspectClass(job.format))}>
                <div className="flex h-full min-h-[180px] items-center justify-center">
                  <div className="text-center">
                    <Loader2 size={20} className="mx-auto animate-spin text-primary" />
                    <p className="mt-2 text-xs uppercase tracking-[0.18em] text-text-subtle">Gerando preview</p>
                  </div>
                </div>
              </div>
            ) : null}
          </div>
        ))}
      </div>
    </div>
  )
}
