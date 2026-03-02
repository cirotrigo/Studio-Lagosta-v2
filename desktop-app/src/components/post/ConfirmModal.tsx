import { AlertTriangle } from 'lucide-react'
import { formatDateTime, truncate } from '@/lib/utils'
import { PostType, POST_TYPE_LABELS, ScheduleType } from '@/lib/constants'
import { Project } from '@/stores/project.store'
import ProjectBadge from '@/components/layout/ProjectBadge'

interface ConfirmModalProps {
  isOpen: boolean
  onClose: () => void
  onConfirm: () => void
  project: Project
  postType: PostType
  imageCount: number
  caption: string
  scheduleType: ScheduleType
  scheduledDatetime: string
}

export default function ConfirmModal({
  isOpen,
  onClose,
  onConfirm,
  project,
  postType,
  imageCount,
  caption,
  scheduleType,
  scheduledDatetime,
}: ConfirmModalProps) {
  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-md rounded-lg border border-border bg-card">
        {/* Header */}
        <div className="border-b border-border p-4">
          <h3 className="text-lg font-semibold text-text">Confirmar Agendamento</h3>
        </div>

        {/* Content */}
        <div className="space-y-4 p-4">
          {/* Project badge - prominent */}
          <div className="flex flex-col items-center gap-2 rounded-lg border border-primary/30 bg-primary/5 p-4">
            <AlertTriangle size={24} className="text-primary" />
            <p className="text-sm text-text-muted">Este post será publicado em:</p>
            <ProjectBadge project={project} size="lg" />
          </div>

          {/* Post details */}
          <div className="space-y-3 rounded-lg border border-border bg-input p-4">
            <div className="flex justify-between">
              <span className="text-sm text-text-muted">Tipo</span>
              <span className="text-sm font-medium text-text">
                {POST_TYPE_LABELS[postType]}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-sm text-text-muted">Imagens</span>
              <span className="text-sm font-medium text-text">{imageCount}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-sm text-text-muted">Agendamento</span>
              <span className="text-sm font-medium text-text">
                {scheduleType === 'IMMEDIATE'
                  ? 'Publicar agora'
                  : formatDateTime(scheduledDatetime)}
              </span>
            </div>
            {caption && (
              <div className="border-t border-border pt-3">
                <p className="text-xs text-text-muted">Legenda</p>
                <p className="mt-1 text-sm text-text">{truncate(caption, 100)}</p>
              </div>
            )}
          </div>

          {/* Warning */}
          <p className="text-center text-xs text-text-muted">
            Verifique se o projeto está correto antes de confirmar
          </p>
        </div>

        {/* Actions */}
        <div className="flex gap-2 border-t border-border p-4">
          <button
            onClick={onClose}
            className="flex-1 rounded-lg border border-border px-4 py-2 text-sm font-medium text-text-muted hover:bg-input"
          >
            Cancelar
          </button>
          <button
            onClick={onConfirm}
            className="flex-1 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary-hover"
          >
            Confirmar e Agendar
          </button>
        </div>
      </div>
    </div>
  )
}
