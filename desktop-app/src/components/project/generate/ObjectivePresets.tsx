import { Megaphone, Building2, Calendar, Tag } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { ObjectivePreset } from '@/stores/generation.store'

interface ObjectivePresetsProps {
  value: ObjectivePreset
  onChange: (value: ObjectivePreset) => void
  onPromptSuggestion?: (suggestion: string) => void
}

const OBJECTIVE_PRESETS = [
  {
    id: 'promocao' as const,
    label: 'Promocao',
    icon: Megaphone,
    promptBase: 'Crie uma arte promocional destacando',
  },
  {
    id: 'institucional' as const,
    label: 'Institucional',
    icon: Building2,
    promptBase: 'Crie uma arte institucional sobre',
  },
  {
    id: 'agenda' as const,
    label: 'Agenda',
    icon: Calendar,
    promptBase: 'Crie uma arte de agenda/evento sobre',
  },
  {
    id: 'oferta' as const,
    label: 'Oferta',
    icon: Tag,
    promptBase: 'Crie uma arte de oferta especial para',
  },
] as const

export default function ObjectivePresets({
  value,
  onChange,
  onPromptSuggestion,
}: ObjectivePresetsProps) {
  const handleSelect = (preset: typeof OBJECTIVE_PRESETS[number]) => {
    const isDeselecting = value === preset.id
    onChange(isDeselecting ? null : preset.id)

    if (!isDeselecting && onPromptSuggestion) {
      onPromptSuggestion(preset.promptBase)
    }
  }

  return (
    <div className="space-y-2">
      <label className="block text-sm font-medium text-text">Objetivo</label>
      <div className="grid grid-cols-2 gap-2">
        {OBJECTIVE_PRESETS.map((preset) => {
          const Icon = preset.icon
          const isSelected = value === preset.id
          return (
            <button
              key={preset.id}
              type="button"
              onClick={() => handleSelect(preset)}
              className={cn(
                'flex items-center gap-2 rounded-xl border-2 px-3 py-2 text-sm font-medium transition-colors',
                isSelected
                  ? 'border-primary bg-primary/10 text-primary'
                  : 'border-border bg-card text-text-muted hover:border-primary/30 hover:text-text',
              )}
            >
              <Icon size={16} />
              {preset.label}
            </button>
          )
        })}
      </div>
    </div>
  )
}

export { OBJECTIVE_PRESETS }
