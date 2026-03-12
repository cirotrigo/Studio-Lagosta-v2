import { cn } from '@/lib/utils'
import type { TonePreset } from '@/stores/generation.store'

interface TonePresetsProps {
  value: TonePreset
  onChange: (value: TonePreset) => void
}

const TONE_PRESETS = [
  {
    id: 'casual' as const,
    label: 'Casual',
    description: 'Linguagem descontraida e amigavel',
  },
  {
    id: 'profissional' as const,
    label: 'Profissional',
    description: 'Tom corporativo e formal',
  },
  {
    id: 'urgente' as const,
    label: 'Urgente',
    description: 'Senso de urgencia e escassez',
  },
  {
    id: 'inspirador' as const,
    label: 'Inspirador',
    description: 'Motivacional e emocional',
  },
] as const

export default function TonePresets({ value, onChange }: TonePresetsProps) {
  return (
    <div className="space-y-2">
      <label className="block text-sm font-medium text-text">Tom da copy</label>
      <div className="flex flex-wrap gap-2">
        {TONE_PRESETS.map((preset) => {
          const isSelected = value === preset.id
          return (
            <button
              key={preset.id}
              type="button"
              onClick={() => onChange(isSelected ? null : preset.id)}
              title={preset.description}
              className={cn(
                'rounded-full border px-3 py-1.5 text-xs font-medium transition-colors',
                isSelected
                  ? 'border-primary bg-primary/10 text-primary'
                  : 'border-border bg-card text-text-muted hover:border-primary/30 hover:text-text',
              )}
            >
              {preset.label}
            </button>
          )
        })}
      </div>
    </div>
  )
}

export { TONE_PRESETS }
