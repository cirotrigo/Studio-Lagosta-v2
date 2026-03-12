import { cn } from '@/lib/utils'

interface SwitchProps {
  checked: boolean
  onChange: (checked: boolean) => void
  disabled?: boolean
  size?: 'sm' | 'md'
}

export function Switch({ checked, onChange, disabled, size = 'md' }: SwitchProps) {
  const sizes = {
    sm: {
      track: 'h-5 w-9',
      thumb: 'h-3.5 w-3.5',
      translate: checked ? 'translate-x-[18px]' : 'translate-x-[2px]',
    },
    md: {
      track: 'h-6 w-11',
      thumb: 'h-4 w-4',
      translate: checked ? 'translate-x-[22px]' : 'translate-x-[2px]',
    },
  }

  const { track, thumb, translate } = sizes[size]

  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => !disabled && onChange(!checked)}
      className={cn(
        'relative inline-flex items-center rounded-full transition-colors duration-200',
        track,
        checked ? 'bg-primary' : 'bg-input border border-border',
        disabled && 'opacity-50 cursor-not-allowed'
      )}
    >
      <span
        className={cn(
          'inline-block rounded-full bg-white shadow-sm transition-transform duration-200',
          thumb,
          translate
        )}
      />
    </button>
  )
}
