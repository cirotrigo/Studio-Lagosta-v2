import { cn, formatDateTimeLocal } from '@/lib/utils'
import { ScheduleType } from '@/lib/constants'

interface SchedulePickerProps {
  scheduleType: ScheduleType
  onScheduleTypeChange: (type: ScheduleType) => void
  scheduledDatetime: string
  onScheduledDatetimeChange: (datetime: string) => void
}

export default function SchedulePicker({
  scheduleType,
  onScheduleTypeChange,
  scheduledDatetime,
  onScheduledDatetimeChange,
}: SchedulePickerProps) {
  // Get minimum datetime (now + 5 minutes)
  const minDatetime = formatDateTimeLocal(new Date(Date.now() + 5 * 60 * 1000))

  return (
    <div className="space-y-4">
      {/* Schedule type toggle */}
      <div className="flex rounded-lg border border-border bg-input p-1">
        <button
          type="button"
          onClick={() => onScheduleTypeChange('IMMEDIATE')}
          className={cn(
            'flex-1 rounded-md px-4 py-2 text-sm font-medium',
            'transition-all duration-200',
            scheduleType === 'IMMEDIATE'
              ? 'bg-primary text-primary-foreground'
              : 'text-text-muted hover:text-text'
          )}
        >
          Publicar agora
        </button>
        <button
          type="button"
          onClick={() => onScheduleTypeChange('SCHEDULED')}
          className={cn(
            'flex-1 rounded-md px-4 py-2 text-sm font-medium',
            'transition-all duration-200',
            scheduleType === 'SCHEDULED'
              ? 'bg-primary text-primary-foreground'
              : 'text-text-muted hover:text-text'
          )}
        >
          Agendar
        </button>
      </div>

      {/* Datetime picker */}
      {scheduleType === 'SCHEDULED' && (
        <div className="space-y-2">
          <label className="block text-sm font-medium text-text">
            Data e hora <span className="text-error">*</span>
          </label>
          <input
            type="datetime-local"
            value={scheduledDatetime}
            onChange={(e) => onScheduledDatetimeChange(e.target.value)}
            min={minDatetime}
            className={cn(
              'w-full rounded-lg border border-border bg-input px-3 py-2 text-text',
              'focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20',
              '[&::-webkit-calendar-picker-indicator]:invert [&::-webkit-calendar-picker-indicator]:opacity-50'
            )}
          />
          <p className="text-xs text-text-subtle">
            O post será enviado para publicação na data e hora selecionadas
          </p>
        </div>
      )}

      {scheduleType === 'IMMEDIATE' && (
        <div className="rounded-lg border border-primary/20 bg-primary/5 p-3">
          <p className="text-sm text-text-muted">
            O post será enviado para publicação imediatamente após a confirmação.
          </p>
        </div>
      )}
    </div>
  )
}
