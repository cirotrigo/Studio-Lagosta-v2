import { useState, useCallback } from 'react'
import {
  X,
  Trash2,
  Check,
  AlertCircle,
  Clock,
  Loader2,
  ChevronDown,
  ChevronUp,
  RotateCcw,
  Pause,
  Play,
  XCircle,
  Eye,
} from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { cn } from '@/lib/utils'
import { formatDistanceToNow } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import type { QueueItem, QueueBatch, QueueItemStatus } from '@/lib/queue/types'
import { useImageQueue } from '../hooks/useImageQueue'
import ImagePreviewModal from './ImagePreviewModal'

// Status badge component
function StatusBadge({ status }: { status: QueueItemStatus }) {
  const config: Record<
    QueueItemStatus,
    { icon: React.ReactNode; color: string; label: string }
  > = {
    PENDING: {
      icon: <Clock size={12} />,
      color: 'bg-white/10 text-white/60',
      label: 'Aguardando',
    },
    PROCESSING: {
      icon: <Loader2 size={12} className="animate-spin" />,
      color: 'bg-primary/20 text-primary',
      label: 'Processando',
    },
    COMPLETED: {
      icon: <Check size={12} />,
      color: 'bg-green-500/20 text-green-400',
      label: 'Concluido',
    },
    FAILED: {
      icon: <AlertCircle size={12} />,
      color: 'bg-red-500/20 text-red-400',
      label: 'Falhou',
    },
    CANCELLED: {
      icon: <XCircle size={12} />,
      color: 'bg-white/10 text-white/40 line-through',
      label: 'Cancelado',
    },
  }

  const c = config[status]

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs',
        c.color
      )}
    >
      {c.icon}
      <span>{c.label}</span>
    </span>
  )
}

// Single queue item
function QueueSingleItem({
  item,
  onCancel,
  onRetry,
  onRemove,
  onPreview,
}: {
  item: QueueItem
  onCancel: () => void
  onRetry: () => void
  onRemove: () => void
  onPreview?: () => void
}) {
  const canCancel = item.status === 'PENDING'
  const canRetry = item.status === 'FAILED' || item.status === 'CANCELLED'
  const canRemove =
    item.status === 'COMPLETED' ||
    item.status === 'FAILED' ||
    item.status === 'CANCELLED'

  return (
    <motion.div
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -20 }}
      className={cn(
        'p-3 rounded-xl border transition-all',
        item.status === 'PROCESSING'
          ? 'border-primary/30 bg-primary/5'
          : 'border-white/[0.06] bg-white/[0.02]'
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <p className="text-sm text-white truncate">{item.request.prompt}</p>
          <div className="flex items-center gap-2 mt-1">
            <StatusBadge status={item.status} />
            <span className="text-xs text-white/40">
              {formatDistanceToNow(new Date(item.createdAt), {
                addSuffix: true,
                locale: ptBR,
              })}
            </span>
          </div>
          {item.error && (
            <p className="text-xs text-red-400 mt-1 line-clamp-2">
              {item.error.message}
            </p>
          )}
        </div>

        {/* Actions */}
        <div className="flex items-center gap-1 shrink-0">
          {canRetry && (
            <button
              type="button"
              onClick={onRetry}
              className="p-1.5 rounded-lg hover:bg-white/[0.06] text-white/50 hover:text-white transition-colors"
              title="Tentar novamente"
            >
              <RotateCcw size={14} />
            </button>
          )}
          {canCancel && (
            <button
              type="button"
              onClick={onCancel}
              className="p-1.5 rounded-lg hover:bg-white/[0.06] text-white/50 hover:text-white transition-colors"
              title="Cancelar"
            >
              <XCircle size={14} />
            </button>
          )}
          {canRemove && (
            <button
              type="button"
              onClick={onRemove}
              className="p-1.5 rounded-lg hover:bg-red-500/20 text-white/50 hover:text-red-400 transition-colors"
              title="Remover"
            >
              <Trash2 size={14} />
            </button>
          )}
        </div>
      </div>

      {/* Result thumbnail */}
      {item.result?.thumbnailUrl && (
        <button
          type="button"
          onClick={onPreview}
          className="mt-2 relative group cursor-pointer"
        >
          <img
            src={item.result.thumbnailUrl}
            alt="Generated"
            className="h-16 w-16 rounded-lg object-cover transition-transform group-hover:scale-105"
          />
          <div className="absolute inset-0 rounded-lg bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
            <Eye size={20} className="text-white" />
          </div>
        </button>
      )}
    </motion.div>
  )
}

// Batch item with expandable children
function QueueBatchItem({
  batch,
  items,
  onCancelBatch,
  onRemoveBatch,
  onRetryItem,
  onCancelItem,
  onRemoveItem,
  onPreviewItem,
}: {
  batch: QueueBatch
  items: QueueItem[]
  onCancelBatch: () => void
  onRemoveBatch: () => void
  onRetryItem: (id: string) => void
  onCancelItem: (id: string) => void
  onRemoveItem: (id: string) => void
  onPreviewItem: (item: QueueItem) => void
}) {
  const [isExpanded, setIsExpanded] = useState(false)

  const isProcessing = items.some((i) => i.status === 'PROCESSING')
  const allDone = items.every(
    (i) =>
      i.status === 'COMPLETED' ||
      i.status === 'FAILED' ||
      i.status === 'CANCELLED'
  )
  const hasPending = items.some((i) => i.status === 'PENDING')

  const progressPercent =
    (batch.progress.completed / batch.progress.total) * 100

  return (
    <motion.div
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -20 }}
      className={cn(
        'rounded-xl border overflow-hidden transition-all',
        isProcessing
          ? 'border-primary/30 bg-primary/5'
          : 'border-white/[0.06] bg-white/[0.02]'
      )}
    >
      {/* Header */}
      <button
        type="button"
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full p-3 flex items-center justify-between hover:bg-white/[0.02] transition-colors"
      >
        <div className="flex-1 min-w-0 text-left">
          <p className="text-sm font-medium text-white truncate">{batch.name}</p>
          <div className="flex items-center gap-2 mt-1">
            <span className="text-xs text-white/50">
              {batch.progress.completed}/{batch.progress.total} concluidas
            </span>
            {batch.progress.failed > 0 && (
              <span className="text-xs text-red-400">
                {batch.progress.failed} falhas
              </span>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2">
          {hasPending && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation()
                onCancelBatch()
              }}
              className="px-2 py-1 text-xs rounded-lg bg-white/[0.06] hover:bg-white/[0.1] text-white/70 transition-colors"
            >
              Cancelar
            </button>
          )}
          {allDone && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation()
                onRemoveBatch()
              }}
              className="p-1.5 rounded-lg hover:bg-red-500/20 text-white/50 hover:text-red-400 transition-colors"
            >
              <Trash2 size={14} />
            </button>
          )}
          {isExpanded ? (
            <ChevronUp size={16} className="text-white/50" />
          ) : (
            <ChevronDown size={16} className="text-white/50" />
          )}
        </div>
      </button>

      {/* Progress bar */}
      <div className="h-1 bg-white/[0.06]">
        <motion.div
          className="h-full bg-primary"
          initial={{ width: 0 }}
          animate={{ width: `${progressPercent}%` }}
          transition={{ duration: 0.3 }}
        />
      </div>

      {/* Expanded items */}
      <AnimatePresence>
        {isExpanded && (
          <motion.div
            initial={{ height: 0 }}
            animate={{ height: 'auto' }}
            exit={{ height: 0 }}
            className="overflow-hidden"
          >
            <div className="p-2 space-y-2 border-t border-white/[0.06]">
              {items.map((item) => (
                <QueueSingleItem
                  key={item.id}
                  item={item}
                  onCancel={() => onCancelItem(item.id)}
                  onRetry={() => onRetryItem(item.id)}
                  onRemove={() => onRemoveItem(item.id)}
                  onPreview={() => onPreviewItem(item)}
                />
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  )
}

// Main drawer component
export default function QueueDrawer() {
  const {
    items,
    batches,
    stats,
    isProcessing,
    isPaused,
    pauseReason,
    isDrawerOpen,
    setDrawerOpen,
    cancelItem,
    retryItem,
    removeItem,
    cancelBatch,
    removeBatch,
    clearCompleted,
    pauseQueue,
    resumeQueue,
    startProcessing,
  } = useImageQueue()

  // Preview state
  const [previewItem, setPreviewItem] = useState<QueueItem | null>(null)

  const handlePreview = useCallback((item: QueueItem) => {
    if (item.result?.fileUrl) {
      setPreviewItem(item)
    }
  }, [])

  const closePreview = useCallback(() => {
    setPreviewItem(null)
  }, [])

  // Group items by batch
  const standaloneItems = items.filter((i: QueueItem) => !i.batchId)
  const batchedItems = batches.map((batch: QueueBatch) => ({
    batch,
    items: items.filter((i: QueueItem) => i.batchId === batch.id),
  }))

  const hasItems = items.length > 0
  const hasCompletedOrFailed = items.some(
    (i) => i.status === 'COMPLETED' || i.status === 'FAILED'
  )

  return (
    <>
      {/* Drawer */}
      <AnimatePresence>
        {isDrawerOpen && (
          <>
            {/* Overlay */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setDrawerOpen(false)}
              className="fixed inset-0 bg-black/40 z-40 lg:hidden"
            />

            {/* Drawer Panel */}
            <motion.div
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              transition={{ type: 'spring', damping: 20 }}
              className="fixed right-0 top-0 bottom-0 w-full max-w-md z-50 bg-[#0a0a0a] border-l border-white/[0.06] flex flex-col"
            >
              {/* Header */}
              <div className="flex items-center justify-between p-4 border-b border-white/[0.06]">
                <div>
                  <h2 className="text-lg font-semibold text-white">
                    Fila de Geracao
                  </h2>
                  <p className="text-sm text-white/50">
                    {stats.pending} pendentes, {stats.processing} em andamento
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setDrawerOpen(false)}
                  className="p-2 rounded-lg hover:bg-white/[0.06] transition-colors"
                >
                  <X size={18} className="text-white/70" />
                </button>
              </div>

              {/* Controls */}
              <div className="flex items-center gap-2 p-4 border-b border-white/[0.06]">
                {isPaused ? (
                  <button
                    type="button"
                    onClick={resumeQueue}
                    className="flex items-center gap-2 px-3 py-2 rounded-xl bg-primary text-white text-sm font-medium transition-colors"
                  >
                    <Play size={14} />
                    <span>Retomar</span>
                  </button>
                ) : isProcessing ? (
                  <button
                    type="button"
                    onClick={() => pauseQueue('manual')}
                    className="flex items-center gap-2 px-3 py-2 rounded-xl bg-white/[0.06] text-white/70 text-sm font-medium hover:bg-white/[0.1] transition-colors"
                  >
                    <Pause size={14} />
                    <span>Pausar</span>
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={startProcessing}
                    disabled={stats.pending === 0}
                    className="flex items-center gap-2 px-3 py-2 rounded-xl bg-primary text-white text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    <Play size={14} />
                    <span>Iniciar</span>
                  </button>
                )}

                {hasCompletedOrFailed && (
                  <button
                    type="button"
                    onClick={clearCompleted}
                    className="flex items-center gap-2 px-3 py-2 rounded-xl bg-white/[0.06] text-white/70 text-sm font-medium hover:bg-white/[0.1] transition-colors"
                  >
                    <Trash2 size={14} />
                    <span>Limpar concluidos</span>
                  </button>
                )}
              </div>

              {/* Pause reason banner */}
              {isPaused && pauseReason && (
                <div
                  className={cn(
                    'px-4 py-2 text-sm',
                    pauseReason === 'offline' && 'bg-yellow-500/20 text-yellow-400',
                    pauseReason === 'no_credits' && 'bg-red-500/20 text-red-400',
                    pauseReason === 'rate_limit' && 'bg-orange-500/20 text-orange-400',
                    pauseReason === 'manual' && 'bg-white/10 text-white/70'
                  )}
                >
                  {pauseReason === 'offline' && 'Fila pausada: sem conexao'}
                  {pauseReason === 'no_credits' && 'Fila pausada: creditos insuficientes'}
                  {pauseReason === 'rate_limit' && 'Fila pausada: limite de requisicoes'}
                  {pauseReason === 'manual' && 'Fila pausada manualmente'}
                </div>
              )}

              {/* Content */}
              <div className="flex-1 overflow-y-auto p-4 space-y-3">
                {!hasItems ? (
                  <div className="flex flex-col items-center justify-center h-full text-white/40">
                    <Clock size={32} />
                    <p className="mt-2">Fila vazia</p>
                    <p className="text-xs mt-1">
                      Adicione imagens para comecar a gerar
                    </p>
                  </div>
                ) : (
                  <AnimatePresence mode="popLayout">
                    {/* Batches */}
                    {batchedItems.map(({ batch, items }) => (
                      <QueueBatchItem
                        key={batch.id}
                        batch={batch}
                        items={items}
                        onCancelBatch={() => cancelBatch(batch.id)}
                        onRemoveBatch={() => removeBatch(batch.id)}
                        onRetryItem={retryItem}
                        onCancelItem={cancelItem}
                        onRemoveItem={removeItem}
                        onPreviewItem={handlePreview}
                      />
                    ))}

                    {/* Standalone items */}
                    {standaloneItems.map((item) => (
                      <QueueSingleItem
                        key={item.id}
                        item={item}
                        onCancel={() => cancelItem(item.id)}
                        onRetry={() => retryItem(item.id)}
                        onRemove={() => removeItem(item.id)}
                        onPreview={() => handlePreview(item)}
                      />
                    ))}
                  </AnimatePresence>
                )}
              </div>

              {/* Footer Stats */}
              <div className="p-4 border-t border-white/[0.06] bg-white/[0.02]">
                <div className="grid grid-cols-4 gap-2 text-center text-xs">
                  <div>
                    <p className="text-white font-medium">{stats.pending}</p>
                    <p className="text-white/40">Pendentes</p>
                  </div>
                  <div>
                    <p className="text-primary font-medium">{stats.processing}</p>
                    <p className="text-white/40">Gerando</p>
                  </div>
                  <div>
                    <p className="text-green-400 font-medium">{stats.completed}</p>
                    <p className="text-white/40">Concluidas</p>
                  </div>
                  <div>
                    <p className="text-red-400 font-medium">{stats.failed}</p>
                    <p className="text-white/40">Falhas</p>
                  </div>
                </div>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Image Preview Modal */}
      <ImagePreviewModal
        isOpen={previewItem !== null}
        onClose={closePreview}
        imageUrl={previewItem?.result?.fileUrl || null}
        prompt={previewItem?.request.prompt}
      />
    </>
  )
}
