import { CheckCircle2, ExternalLink, Loader2, PencilLine } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { GenerationApprovalStatus } from '@/stores/generation.store'

interface ApprovalPanelProps {
  status: GenerationApprovalStatus
  approvalError?: string
  approvedAt?: number
  canOpenEditor: boolean
  canApprove: boolean
  onOpenEditor: () => void
  onApprove: () => void
  onOpenArts: () => void
}

function formatApprovedAt(timestamp: number | undefined) {
  if (!timestamp) {
    return null
  }

  return new Date(timestamp).toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export function ApprovalPanel({
  status,
  approvalError,
  approvedAt,
  canOpenEditor,
  canApprove,
  onOpenEditor,
  onApprove,
  onOpenArts,
}: ApprovalPanelProps) {
  const approvedAtLabel = formatApprovedAt(approvedAt)

  return (
    <div className="rounded-xl border border-border bg-background/40 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-[10px] font-medium uppercase tracking-[0.16em] text-text-subtle">
            Aprovação
          </p>
          <div className="mt-1 flex flex-wrap items-center gap-2">
            <span
              className={cn(
                'rounded-full px-2.5 py-1 text-[10px] font-medium uppercase tracking-[0.16em]',
                status === 'approved'
                  ? 'bg-emerald-500/10 text-emerald-300'
                  : status === 'syncing'
                    ? 'bg-primary/10 text-primary'
                    : status === 'error'
                      ? 'bg-error/10 text-error'
                      : 'bg-input text-text-muted',
              )}
            >
              {status === 'approved'
                ? 'Aprovada'
                : status === 'syncing'
                  ? 'Aprovando'
                  : status === 'error'
                    ? 'Erro na aprovação'
                    : 'Pendente'}
            </span>
            {approvedAtLabel ? (
              <span className="text-[11px] text-text-muted">Salva em Artes em {approvedAtLabel}</span>
            ) : null}
          </div>
        </div>
      </div>

      <p className="mt-3 text-xs text-text-muted">
        {status === 'approved'
          ? 'A variação já foi exportada para o projeto e pode ser usada no fluxo de publicação.'
          : status === 'syncing'
            ? 'Persistindo a arte aprovada no histórico do projeto.'
            : status === 'error'
              ? approvalError || 'Falha ao enviar a aprovação para o projeto.'
              : 'A aprovação exporta a arte para Artes. Se precisar microajustar antes, abra no editor.'}
      </p>

      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          disabled={!canOpenEditor || status === 'syncing'}
          onClick={onOpenEditor}
          className="inline-flex h-9 items-center gap-2 rounded-lg border border-border bg-card px-3 text-xs font-medium text-text transition-colors hover:border-primary/40 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <PencilLine size={14} />
          Microajuste no editor
        </button>

        <button
          type="button"
          disabled={!canApprove || status === 'approved' || status === 'syncing'}
          onClick={onApprove}
          className="inline-flex h-9 items-center gap-2 rounded-lg bg-primary px-3 text-xs font-medium text-primary-foreground transition-colors hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-50"
        >
          {status === 'syncing' ? (
            <>
              <Loader2 size={14} className="animate-spin" />
              Aprovando...
            </>
          ) : status === 'approved' ? (
            <>
              <CheckCircle2 size={14} />
              Aprovada
            </>
          ) : (
            <>
              <CheckCircle2 size={14} />
              {status === 'error' ? 'Aprovar novamente' : 'Aprovar'}
            </>
          )}
        </button>

        {status === 'approved' ? (
          <button
            type="button"
            onClick={onOpenArts}
            className="inline-flex h-9 items-center gap-2 rounded-lg border border-border bg-input/60 px-3 text-xs font-medium text-text transition-colors hover:bg-input"
          >
            <ExternalLink size={14} />
            Ver em Artes
          </button>
        ) : null}
      </div>
    </div>
  )
}
