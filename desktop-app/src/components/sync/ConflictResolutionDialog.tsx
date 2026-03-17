import { useState } from 'react'
import {
  AlertTriangle,
  Cloud,
  HardDrive,
  Copy,
  X,
  Clock,
  FileText,
} from 'lucide-react'
import {
  useSyncStore,
  useShowConflictDialog,
  useSelectedConflict,
  useSyncConflicts,
  type ConflictResolution,
} from '@/stores/sync.store'
import { cn } from '@/lib/utils'

const resolutionOptions: Array<{
  value: ConflictResolution
  label: string
  description: string
  icon: typeof Cloud
  color: string
}> = [
  {
    value: 'keep-local',
    label: 'Manter local',
    description: 'Sobrescreve a versao do servidor com sua versao local',
    icon: HardDrive,
    color: 'text-blue-500',
  },
  {
    value: 'keep-remote',
    label: 'Manter servidor',
    description: 'Descarta alteracoes locais e usa a versao do servidor',
    icon: Cloud,
    color: 'text-green-500',
  },
  {
    value: 'duplicate-local',
    label: 'Criar copia local',
    description: 'Mantem ambas: cria copia da versao local e usa servidor como original',
    icon: Copy,
    color: 'text-amber-500',
  },
]

function formatDate(dateStr: string): string {
  try {
    return new Date(dateStr).toLocaleString('pt-BR', {
      dateStyle: 'short',
      timeStyle: 'short',
    })
  } catch {
    return dateStr
  }
}

export default function ConflictResolutionDialog() {
  const isOpen = useShowConflictDialog()
  const selectedConflict = useSelectedConflict()
  const conflicts = useSyncConflicts()
  const closeDialog = useSyncStore((state) => state.closeConflictDialog)
  const resolveConflict = useSyncStore((state) => state.resolveConflict)
  const openConflictDialog = useSyncStore((state) => state.openConflictDialog)

  const [selectedResolution, setSelectedResolution] = useState<ConflictResolution>('keep-local')
  const [isResolving, setIsResolving] = useState(false)

  if (!isOpen || !selectedConflict) return null

  const currentIndex = conflicts.findIndex((c) => c.id === selectedConflict.id)
  const hasMore = conflicts.length > 1

  const handleResolve = async () => {
    setIsResolving(true)
    try {
      const success = await resolveConflict(selectedConflict.id, selectedResolution)
      if (success) {
        // If there are more conflicts, show the next one
        const nextConflict = conflicts.find((c) => c.id !== selectedConflict.id)
        if (nextConflict) {
          openConflictDialog(nextConflict)
        } else {
          closeDialog()
        }
      }
    } finally {
      setIsResolving(false)
    }
  }

  const localDoc = selectedConflict.localVersion.document as { name?: string }
  const remoteDoc = selectedConflict.remoteVersion.document as { name?: string }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-lg rounded-lg border border-border bg-[#0a0a0a]">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border p-4">
          <div className="flex items-center gap-2">
            <AlertTriangle size={20} className="text-amber-500" />
            <h3 className="text-lg font-semibold text-text">Conflito de Sincronizacao</h3>
          </div>
          <button
            onClick={closeDialog}
            className="rounded p-1 text-text-muted hover:bg-input"
          >
            <X size={18} />
          </button>
        </div>

        {/* Content */}
        <div className="space-y-4 p-4">
          {/* Conflict info */}
          <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-4">
            <div className="flex items-start gap-3">
              <FileText size={20} className="mt-0.5 text-amber-500" />
              <div className="flex-1">
                <p className="font-medium text-text">
                  {localDoc.name ?? remoteDoc.name ?? 'Template sem nome'}
                </p>
                <p className="mt-1 text-sm text-text-muted">
                  Este template foi modificado localmente e no servidor
                </p>
              </div>
            </div>
          </div>

          {/* Version comparison */}
          <div className="grid grid-cols-2 gap-3">
            {/* Local version */}
            <div className="rounded-lg border border-border bg-input p-3">
              <div className="flex items-center gap-2">
                <HardDrive size={14} className="text-blue-500" />
                <span className="text-xs font-medium text-text">Versao Local</span>
              </div>
              <div className="mt-2 flex items-center gap-1 text-xs text-text-muted">
                <Clock size={12} />
                {formatDate(selectedConflict.localVersion.updatedAt)}
              </div>
              <div className="mt-1 truncate text-xs text-text-subtle">
                Hash: {selectedConflict.localVersion.hash.slice(0, 8)}
              </div>
            </div>

            {/* Remote version */}
            <div className="rounded-lg border border-border bg-input p-3">
              <div className="flex items-center gap-2">
                <Cloud size={14} className="text-green-500" />
                <span className="text-xs font-medium text-text">Versao Servidor</span>
              </div>
              <div className="mt-2 flex items-center gap-1 text-xs text-text-muted">
                <Clock size={12} />
                {formatDate(selectedConflict.remoteVersion.updatedAt)}
              </div>
              <div className="mt-1 truncate text-xs text-text-subtle">
                Hash: {selectedConflict.remoteVersion.hash.slice(0, 8)}
              </div>
            </div>
          </div>

          {/* Resolution options */}
          <div className="space-y-2">
            <p className="text-sm font-medium text-text">Como resolver?</p>
            {resolutionOptions.map((option) => (
              <button
                key={option.value}
                onClick={() => setSelectedResolution(option.value)}
                className={cn(
                  'flex w-full items-start gap-3 rounded-lg border p-3 text-left transition-colors',
                  selectedResolution === option.value
                    ? 'border-primary bg-primary/5'
                    : 'border-border hover:bg-input',
                )}
              >
                <option.icon size={18} className={cn('mt-0.5', option.color)} />
                <div className="flex-1">
                  <p className="text-sm font-medium text-text">{option.label}</p>
                  <p className="text-xs text-text-muted">{option.description}</p>
                </div>
                <div
                  className={cn(
                    'h-4 w-4 rounded-full border-2',
                    selectedResolution === option.value
                      ? 'border-primary bg-primary'
                      : 'border-border',
                  )}
                />
              </button>
            ))}
          </div>

          {/* Progress indicator */}
          {hasMore && (
            <p className="text-center text-xs text-text-muted">
              Conflito {currentIndex + 1} de {conflicts.length}
            </p>
          )}
        </div>

        {/* Actions */}
        <div className="flex gap-2 border-t border-border p-4">
          <button
            onClick={closeDialog}
            disabled={isResolving}
            className="flex-1 rounded-lg border border-border px-4 py-2 text-sm font-medium text-text-muted hover:bg-input disabled:opacity-50"
          >
            Cancelar
          </button>
          <button
            onClick={handleResolve}
            disabled={isResolving}
            className="flex-1 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary-hover disabled:opacity-50"
          >
            {isResolving ? 'Resolvendo...' : 'Resolver'}
          </button>
        </div>
      </div>
    </div>
  )
}
