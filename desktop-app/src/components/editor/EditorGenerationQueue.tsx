import { ExternalLink, Loader2, Trash2 } from 'lucide-react'
import { Link } from 'react-router-dom'
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
          <h2 className="text-sm font-semibold text-text">Fila de exportação</h2>
          <p className="mt-1 text-xs text-text-muted">
            Os criativos são exportados em segundo plano e salvos em `Artes`.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Link
            to="/arts"
            className="inline-flex h-9 items-center gap-2 rounded-xl border border-border px-3 text-sm text-text transition-colors hover:border-primary/40"
          >
            <ExternalLink size={14} />
            Abrir Artes
          </Link>
          <button
            type="button"
            disabled={finishedCount === 0}
            onClick={() => clearFinished()}
            className="h-9 rounded-xl border border-border px-3 text-sm text-text transition-colors hover:border-primary/40 disabled:opacity-40"
          >
            Limpar concluídos
          </button>
        </div>
      </div>

      <div className="space-y-3">
        {jobs.map((job) => (
          <div key={job.id} className="rounded-2xl border border-border bg-background/40 p-4">
            <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-text">{job.pageName}</p>
                <p className="mt-1 text-xs text-text-muted">
                  {job.format} • {job.width}x{job.height}
                </p>
              </div>

              <div className="flex items-center gap-2">
                {job.status === 'processing' ? (
                  <span className="inline-flex items-center gap-2 rounded-full bg-primary/10 px-3 py-1 text-xs font-medium text-primary">
                    <Loader2 size={14} className="animate-spin" />
                    Exportando
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
                    Salvo em Artes
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
              <p className="text-sm text-error">{job.error ?? 'Falha ao exportar a página.'}</p>
            ) : null}

            {job.result?.resultUrl ? (
              <div className="grid gap-3 sm:grid-cols-[180px_minmax(0,1fr)]">
                <div
                  className={cn(
                    'flex items-center justify-center overflow-hidden rounded-2xl border border-border bg-[#0c111d] p-3',
                    getAspectClass(job.format),
                  )}
                >
                  <img
                    src={job.result.resultUrl}
                    alt={job.pageName}
                    className="max-h-full max-w-full rounded-lg object-contain"
                  />
                </div>

                <div className="flex flex-col justify-between gap-3 rounded-2xl border border-border bg-card p-4">
                  <div>
                    <p className="text-sm font-medium text-text">Criativo persistido no projeto</p>
                    <p className="mt-1 text-xs text-text-muted">
                      {job.result.fileName ?? 'Arquivo salvo com nome automático.'}
                    </p>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <Link
                      to="/arts"
                      className="inline-flex h-9 items-center gap-2 rounded-xl border border-border px-3 text-sm text-text transition-colors hover:border-primary/40"
                    >
                      <ExternalLink size={14} />
                      Ver em Artes
                    </Link>
                  </div>
                </div>
              </div>
            ) : job.status !== 'error' ? (
              <div
                className={cn(
                  'w-full overflow-hidden rounded-2xl border border-dashed border-border bg-background/20',
                  getAspectClass(job.format),
                )}
              >
                <div className="flex h-full min-h-[180px] items-center justify-center">
                  <div className="text-center">
                    <Loader2 size={20} className="mx-auto animate-spin text-primary" />
                    <p className="mt-2 text-xs uppercase tracking-[0.18em] text-text-subtle">
                      Exportando criativo
                    </p>
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
