import { useState, useEffect, type ReactNode } from 'react'
import { ChevronDown, Settings2 } from 'lucide-react'
import { cn } from '@/lib/utils'

interface AdvancedOptionsDrawerProps {
  children: ReactNode
  defaultOpen?: boolean
  persistKey?: string
}

const STORAGE_PREFIX = 'lagosta_advanced_drawer_'

export default function AdvancedOptionsDrawer({
  children,
  defaultOpen = false,
  persistKey = 'generate',
}: AdvancedOptionsDrawerProps) {
  const [isOpen, setIsOpen] = useState(() => {
    if (typeof window === 'undefined') return defaultOpen
    const stored = sessionStorage.getItem(`${STORAGE_PREFIX}${persistKey}`)
    return stored !== null ? stored === 'true' : defaultOpen
  })

  useEffect(() => {
    sessionStorage.setItem(`${STORAGE_PREFIX}${persistKey}`, String(isOpen))
  }, [isOpen, persistKey])

  return (
    <div className="rounded-xl border border-border bg-card/30">
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="flex w-full items-center justify-between px-4 py-3"
      >
        <div className="flex items-center gap-2">
          <Settings2 size={16} className="text-text-muted" />
          <span className="text-sm font-medium text-text">Opcoes avancadas</span>
        </div>
        <ChevronDown
          size={16}
          className={cn(
            'text-text-muted transition-transform',
            isOpen && 'rotate-180',
          )}
        />
      </button>

      <div
        className={cn(
          'grid transition-[grid-template-rows] duration-200',
          isOpen ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]',
        )}
      >
        <div className="overflow-hidden">
          <div className="space-y-4 border-t border-border px-4 pb-4 pt-4">
            {children}
          </div>
        </div>
      </div>
    </div>
  )
}
