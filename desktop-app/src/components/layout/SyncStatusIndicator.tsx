import { useSyncStatus } from '@/hooks/use-sync-status'
import { useProjectStore } from '@/stores/project.store'
import { cn } from '@/lib/utils'
import {
  Cloud,
  CloudOff,
  RefreshCw,
  AlertTriangle,
  CheckCircle2,
  AlertCircle,
} from 'lucide-react'

export default function SyncStatusIndicator() {
  const currentProject = useProjectStore((state) => state.currentProject)
  const { state, isOnline, isSyncing, pending, hasConflicts, sync, openConflictDialog } =
    useSyncStatus()

  // Don't show if no project selected
  if (!currentProject) return null

  const getIcon = () => {
    if (!isOnline) return CloudOff
    if (isSyncing) return RefreshCw
    if (hasConflicts) return AlertTriangle
    if (state === 'error') return AlertCircle
    if (pending > 0) return Cloud
    return CheckCircle2
  }

  const getStatusText = () => {
    if (!isOnline) return 'Offline'
    if (isSyncing) return 'Sincronizando...'
    if (hasConflicts) return 'Conflitos'
    if (state === 'error') return 'Erro'
    if (pending > 0) return `${pending} pendente${pending > 1 ? 's' : ''}`
    return 'Sincronizado'
  }

  const getStatusColor = () => {
    if (!isOnline) return 'text-text-subtle'
    if (isSyncing) return 'text-primary'
    if (hasConflicts) return 'text-amber-500'
    if (state === 'error') return 'text-red-500'
    if (pending > 0) return 'text-blue-500'
    return 'text-green-500'
  }

  const Icon = getIcon()

  const handleClick = () => {
    if (hasConflicts) {
      openConflictDialog()
    } else if (!isSyncing && isOnline) {
      sync()
    }
  }

  return (
    <button
      onClick={handleClick}
      disabled={isSyncing || !isOnline}
      className={cn(
        'flex items-center gap-2 rounded-lg px-3 py-2 text-sm transition-all duration-200',
        'hover:bg-card',
        'disabled:cursor-not-allowed disabled:opacity-50',
        getStatusColor(),
      )}
      title={hasConflicts ? 'Resolver conflitos' : 'Sincronizar agora'}
    >
      <Icon
        size={16}
        className={cn(isSyncing && 'animate-spin')}
      />
      <span className="text-xs">{getStatusText()}</span>
      {hasConflicts && (
        <span className="flex h-4 min-w-4 items-center justify-center rounded-full bg-amber-500 px-1 text-[10px] font-medium text-white">
          !
        </span>
      )}
    </button>
  )
}
