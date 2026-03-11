import { Loader2, AlertCircle, Clock3 } from 'lucide-react'
import { useGenerationStore, GenerationJob } from '@/stores/generation.store'
import { cn } from '@/lib/utils'

interface GenerationQueueProps {
  jobs: GenerationJob[]
}

export default function GenerationQueue({ jobs }: GenerationQueueProps) {
  const removeJob = useGenerationStore((s) => s.removeJob)

  const getAspectClass = (format: string) => {
    switch (format) {
      case 'STORY':
        return 'aspect-[9/16]'
      case 'SQUARE':
        return 'aspect-square'
      default:
        return 'aspect-[4/5]'
    }
  }

  const getFormatLabel = (format: string) => {
    switch (format) {
      case 'STORY':
        return 'Story'
      case 'SQUARE':
        return 'Quadrado'
      default:
        return 'Feed'
    }
  }

  return (
    <div className="space-y-4">
      <h3 className="text-sm font-medium text-text-muted">Fila de geracao</h3>
      <div className="space-y-3">
        {jobs.map((job, idx) => (
          <div
            key={job.id}
            className="overflow-hidden rounded-xl border border-border bg-card p-4 animate-in fade-in slide-in-from-top-2 duration-200"
          >
            {job.status === 'error' ? (
              // Error state
              <div className="flex flex-col items-center gap-3 py-4 text-center">
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-error/10">
                  <AlertCircle size={24} className="text-error" />
                </div>
                <div>
                  <p className="text-sm font-medium text-text">Erro ao gerar</p>
                  <p className="mt-1 text-xs text-text-muted">{job.error || 'Tente novamente'}</p>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => removeJob(job.id)}
                    className="rounded-lg border border-border bg-card px-3 py-1.5 text-xs font-medium text-text-muted hover:bg-input"
                  >
                    Descartar
                  </button>
                </div>
              </div>
            ) : (
              // Loading state with skeleton
              <div className="flex items-start gap-4">
                {/* Skeleton Grid */}
                <div className={cn('w-24 flex-shrink-0', getAspectClass(job.params.format))}>
                  <div className="h-full w-full animate-pulse rounded-lg bg-input" />
                </div>

                {/* Info */}
                <div className="flex-1 space-y-2">
                  <div className="flex items-center gap-2">
                    {job.status === 'processing' ? (
                      <Loader2 size={16} className="animate-spin text-primary" />
                    ) : (
                      <Clock3 size={16} className="text-text-muted" />
                    )}
                    <span className="text-sm font-medium text-text">
                      {job.status === 'processing' ? 'Processando agora...' : 'Na fila de geracao'}
                    </span>
                  </div>
                  <div className="space-y-1">
                    {job.status === 'queued' && (
                      <p className="text-xs text-text-muted">
                        Posicao na fila: {idx + 1}
                      </p>
                    )}
                    <p className="text-xs text-text-muted">
                      Formato: {getFormatLabel(job.params.format)}
                    </p>
                    <p className="text-xs text-text-muted">
                      Variacoes: {job.params.variations}
                    </p>
                    <p className="text-xs text-text-muted">
                      Fundo: {job.params.backgroundMode === 'photo' ? 'Foto' : 'IA (fallback visual)'}
                    </p>
                    <p className="line-clamp-2 text-xs text-text-subtle">
                      "{job.params.text}"
                    </p>
                  </div>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
