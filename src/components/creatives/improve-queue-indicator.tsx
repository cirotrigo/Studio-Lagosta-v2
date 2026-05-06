'use client'

import * as React from 'react'
import Image from 'next/image'
import {
  Sparkles,
  Loader2,
  CheckCircle2,
  XCircle,
  Trash2,
  RotateCw,
  X,
  ImageIcon,
  Tag,
} from 'lucide-react'
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { cn } from '@/lib/utils'
import {
  useImproveQueueStore,
  type ImproveJob,
  type ImproveJobStatus,
} from '@/stores/improve-queue-store'

const STATUS_CONFIG: Record<
  ImproveJobStatus,
  { label: string; color: string; icon: React.ComponentType<{ className?: string }> }
> = {
  pending: { label: 'Aguardando', color: 'text-muted-foreground', icon: Sparkles },
  processing: { label: 'Melhorando…', color: 'text-primary', icon: Loader2 },
  completed: { label: 'Concluído', color: 'text-emerald-500', icon: CheckCircle2 },
  failed: { label: 'Erro', color: 'text-destructive', icon: XCircle },
}

export function ImproveQueueIndicator() {
  const [open, setOpen] = React.useState(false)
  const hasHydrated = useImproveQueueStore((s) => s.hasHydrated)
  const jobs = useImproveQueueStore((s) => s.jobs)
  const activeCount = React.useMemo(
    () => jobs.filter((j) => j.status === 'pending' || j.status === 'processing').length,
    [jobs]
  )

  if (!hasHydrated) return null
  if (jobs.length === 0) return null

  const processingJob = jobs.find((j) => j.status === 'processing')

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={cn(
          'fixed bottom-6 right-6 z-50 flex items-center gap-2 rounded-full px-4 py-2.5 shadow-lg backdrop-blur-md',
          'bg-background/95 border border-border/60 hover:border-primary/50 transition-all',
          'hover:shadow-xl group'
        )}
        aria-label="Abrir fila de melhorias"
      >
        {processingJob ? (
          <Loader2 className="h-4 w-4 animate-spin text-primary" />
        ) : (
          <Sparkles className="h-4 w-4 text-primary" />
        )}
        <span className="text-sm font-medium">
          {activeCount > 0 ? `Melhorando ${activeCount}` : `${jobs.length} concluídas`}
        </span>
        {jobs.length > 0 && (
          <span className="ml-1 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1.5 text-xs font-semibold text-primary-foreground">
            {jobs.length}
          </span>
        )}
      </button>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="right" className="flex w-full max-w-md flex-col gap-0 p-0">
          <SheetHeader className="border-b border-border/40 px-5 py-4">
            <SheetTitle className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-primary" />
              Fila de melhorias
            </SheetTitle>
            <SheetDescription>
              Cada melhoria custa 25 créditos e é processada uma de cada vez.
            </SheetDescription>
          </SheetHeader>

          <QueueList />

          <QueueFooter />
        </SheetContent>
      </Sheet>
    </>
  )
}

function QueueList() {
  const jobs = useImproveQueueStore((s) => s.jobs)
  const removeJob = useImproveQueueStore((s) => s.removeJob)
  const retryJob = useImproveQueueStore((s) => s.retryJob)

  // Ordena: processing → pending → failed → completed (mais recentes primeiro dentro de cada grupo)
  const ordered = React.useMemo(() => {
    const order: Record<ImproveJobStatus, number> = {
      processing: 0,
      pending: 1,
      failed: 2,
      completed: 3,
    }
    return [...jobs].sort((a, b) => {
      const diff = order[a.status] - order[b.status]
      if (diff !== 0) return diff
      return b.createdAt - a.createdAt
    })
  }, [jobs])

  if (ordered.length === 0) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-3 px-6 text-center text-sm text-muted-foreground">
        <Sparkles className="h-8 w-8 opacity-40" />
        <p>Nenhuma melhoria na fila.</p>
      </div>
    )
  }

  return (
    <ScrollArea className="flex-1">
      <div className="flex flex-col divide-y divide-border/40">
        {ordered.map((job) => (
          <QueueItem key={job.id} job={job} onRemove={removeJob} onRetry={retryJob} />
        ))}
      </div>
    </ScrollArea>
  )
}

interface QueueItemProps {
  job: ImproveJob
  onRemove: (id: string) => void
  onRetry: (id: string) => void
}

function QueueItem({ job, onRemove, onRetry }: QueueItemProps) {
  const { label, color, icon: StatusIcon } = STATUS_CONFIG[job.status]
  const isProcessing = job.status === 'processing'
  const isFinished = job.status === 'completed' || job.status === 'failed'
  const isFailed = job.status === 'failed'

  return (
    <div className="flex gap-3 px-5 py-4">
      <div className="relative h-14 w-14 flex-shrink-0 overflow-hidden rounded-md border border-border/40 bg-muted">
        {job.generationThumbnailUrl ? (
          <Image
            src={job.generationThumbnailUrl}
            alt={job.generationLabel}
            fill
            sizes="56px"
            className="object-cover"
          />
        ) : null}
      </div>

      <div className="flex flex-1 flex-col gap-1 min-w-0">
        <div className="flex items-center gap-2">
          <StatusIcon className={cn('h-3.5 w-3.5 flex-shrink-0', color, isProcessing && 'animate-spin')} />
          <span className={cn('text-xs font-medium', color)}>{label}</span>
          <span className="ml-auto text-[11px] text-muted-foreground">{formatRelative(job.createdAt)}</span>
        </div>
        <p className="text-sm font-medium truncate">{job.generationLabel}</p>
        <p className="text-xs text-muted-foreground line-clamp-2 italic">
          {job.userRequest.length > 0 ? job.userRequest : 'Aprimoramento geral (sem alterações de conteúdo)'}
        </p>
        {(job.backgroundImageUrl ||
          (job.selectedLogoIds && job.selectedLogoIds.length > 0) ||
          (job.selectedElementIds && job.selectedElementIds.length > 0)) && (
          <div className="mt-1 flex flex-wrap gap-1">
            {job.backgroundImageUrl && (
              <Chip icon={ImageIcon}>fundo personalizado</Chip>
            )}
            {job.selectedLogoIds && job.selectedLogoIds.length > 0 && (
              <Chip icon={Tag}>
                {job.selectedLogoIds.length} logo
              </Chip>
            )}
            {job.selectedElementIds && job.selectedElementIds.length > 0 && (
              <Chip icon={Sparkles}>
                {job.selectedElementIds.length} elemento{job.selectedElementIds.length === 1 ? '' : 's'}
              </Chip>
            )}
          </div>
        )}
        {isFailed && job.errorMessage && (
          <p className="mt-1 rounded bg-destructive/10 px-2 py-1 text-[11px] text-destructive line-clamp-2">
            {job.errorMessage}
          </p>
        )}
      </div>

      <div className="flex flex-col items-end gap-1">
        {isFailed && (
          <Button
            type="button"
            size="icon"
            variant="ghost"
            className="h-7 w-7"
            onClick={() => onRetry(job.id)}
            title="Tentar novamente"
          >
            <RotateCw className="h-3.5 w-3.5" />
          </Button>
        )}
        {(job.status === 'pending' || isFinished) && (
          <Button
            type="button"
            size="icon"
            variant="ghost"
            className="h-7 w-7 text-muted-foreground hover:text-destructive"
            onClick={() => onRemove(job.id)}
            title={job.status === 'pending' ? 'Cancelar' : 'Remover'}
          >
            {job.status === 'pending' ? <X className="h-3.5 w-3.5" /> : <Trash2 className="h-3.5 w-3.5" />}
          </Button>
        )}
      </div>
    </div>
  )
}

function QueueFooter() {
  const jobs = useImproveQueueStore((s) => s.jobs)
  const clearFinished = useImproveQueueStore((s) => s.clearFinished)
  const finishedCount = jobs.filter((j) => j.status === 'completed' || j.status === 'failed').length

  if (finishedCount === 0) return null

  return (
    <div className="border-t border-border/40 px-5 py-3">
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="w-full text-xs text-muted-foreground"
        onClick={clearFinished}
      >
        Limpar concluídos ({finishedCount})
      </Button>
    </div>
  )
}

function Chip({
  icon: Icon,
  children,
}: {
  icon: React.ComponentType<{ className?: string }>
  children: React.ReactNode
}) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-[10px] text-primary">
      <Icon className="h-3 w-3" />
      {children}
    </span>
  )
}

function formatRelative(timestamp: number): string {
  const seconds = Math.floor((Date.now() - timestamp) / 1000)
  if (seconds < 60) return 'agora'
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}min`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h`
  const days = Math.floor(hours / 24)
  return `${days}d`
}
