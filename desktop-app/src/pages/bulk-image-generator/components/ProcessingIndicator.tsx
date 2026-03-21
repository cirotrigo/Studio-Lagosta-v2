import { Loader2, Pause, WifiOff, CreditCard } from 'lucide-react'
import { motion } from 'framer-motion'
import { cn } from '@/lib/utils'
import type { QueuePauseReason } from '@/lib/queue/types'

interface ProcessingIndicatorProps {
  pending: number
  processing: number
  isPaused: boolean
  pauseReason?: QueuePauseReason
  onClick?: () => void
}

export default function ProcessingIndicator({
  pending,
  processing,
  isPaused,
  pauseReason,
  onClick,
}: ProcessingIndicatorProps) {
  const total = pending + processing

  if (total === 0 && !isPaused) return null

  const getIcon = () => {
    if (isPaused) {
      if (pauseReason === 'offline') return <WifiOff size={14} />
      if (pauseReason === 'no_credits') return <CreditCard size={14} />
      return <Pause size={14} />
    }
    if (processing > 0) {
      return <Loader2 size={14} className="animate-spin" />
    }
    return null
  }

  const getLabel = () => {
    if (isPaused) {
      if (pauseReason === 'offline') return 'Sem conexao'
      if (pauseReason === 'no_credits') return 'Sem creditos'
      return 'Pausado'
    }
    if (processing > 0) {
      return `${processing}/${total}`
    }
    return `${total} na fila`
  }

  return (
    <motion.button
      type="button"
      onClick={onClick}
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      className={cn(
        'flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-medium transition-all',
        isPaused
          ? 'bg-yellow-500/20 text-yellow-400 hover:bg-yellow-500/30'
          : 'bg-primary/20 text-primary hover:bg-primary/30'
      )}
    >
      {getIcon()}
      <span>{getLabel()}</span>
    </motion.button>
  )
}
