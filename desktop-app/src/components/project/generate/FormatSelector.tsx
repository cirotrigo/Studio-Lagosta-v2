import { cn } from '@/lib/utils'
import { ArtFormat } from '@/stores/generation.store'

interface FormatSelectorProps {
  value: ArtFormat
  onChange: (value: ArtFormat) => void
}

interface FormatOption {
  value: ArtFormat
  label: string
  dimensions: string
  aspectClass: string
}

const FORMAT_OPTIONS: FormatOption[] = [
  {
    value: 'FEED_PORTRAIT',
    label: 'Feed Retrato',
    dimensions: '1080x1350',
    aspectClass: 'w-8 h-10',
  },
  {
    value: 'STORY',
    label: 'Story',
    dimensions: '1080x1920',
    aspectClass: 'w-6 h-10',
  },
  {
    value: 'SQUARE',
    label: 'Quadrado',
    dimensions: '1080x1080',
    aspectClass: 'w-9 h-9',
  },
]

export default function FormatSelector({ value, onChange }: FormatSelectorProps) {
  return (
    <div className="grid grid-cols-3 gap-3">
      {FORMAT_OPTIONS.map((option) => (
        <button
          key={option.value}
          type="button"
          onClick={() => onChange(option.value)}
          className={cn(
            'flex flex-col items-center gap-2 rounded-xl border-2 p-3 transition-all duration-200',
            value === option.value
              ? 'border-primary bg-primary/10'
              : 'border-border bg-card hover:border-primary/30'
          )}
        >
          {/* Visual aspect ratio indicator */}
          <div
            className={cn(
              'rounded-md bg-input',
              option.aspectClass,
              value === option.value && 'bg-primary/20'
            )}
          />
          <div className="text-center">
            <p className={cn(
              'text-xs font-medium',
              value === option.value ? 'text-primary' : 'text-text'
            )}>
              {option.label}
            </p>
            <p className="text-[10px] text-text-subtle">{option.dimensions}</p>
          </div>
        </button>
      ))}
    </div>
  )
}
