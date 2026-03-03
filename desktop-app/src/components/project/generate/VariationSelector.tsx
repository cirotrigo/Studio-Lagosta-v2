import { cn } from '@/lib/utils'

interface VariationSelectorProps {
  value: 1 | 2 | 4
  onChange: (value: 1 | 2 | 4) => void
}

const OPTIONS: (1 | 2 | 4)[] = [1, 2, 4]

export default function VariationSelector({ value, onChange }: VariationSelectorProps) {
  return (
    <div className="flex gap-2">
      {OPTIONS.map((option) => (
        <button
          key={option}
          type="button"
          onClick={() => onChange(option)}
          className={cn(
            'flex h-10 w-10 items-center justify-center rounded-lg border-2 text-sm font-semibold transition-all duration-200',
            value === option
              ? 'border-primary bg-primary/10 text-primary'
              : 'border-border bg-card text-text-muted hover:border-primary/30'
          )}
        >
          {option}
        </button>
      ))}
    </div>
  )
}
