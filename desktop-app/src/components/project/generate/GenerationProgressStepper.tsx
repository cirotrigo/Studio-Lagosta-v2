import { Check, Database, FileText, Image, Layers } from 'lucide-react'
import { cn } from '@/lib/utils'

export type GenerationStep = 'context' | 'copy' | 'background' | 'render'

interface GenerationProgressStepperProps {
  currentStep: GenerationStep
  backgroundMode: 'photo' | 'ai'
  completedSteps: GenerationStep[]
}

const STEPS = [
  { id: 'context' as const, label: 'Contexto', icon: Database },
  { id: 'copy' as const, label: 'Copy', icon: FileText },
  { id: 'background' as const, label: 'Fundo', icon: Image },
  { id: 'render' as const, label: 'Montagem', icon: Layers },
]

export default function GenerationProgressStepper({
  currentStep,
  backgroundMode,
  completedSteps,
}: GenerationProgressStepperProps) {
  const visibleSteps = backgroundMode === 'photo'
    ? STEPS.filter((step) => step.id !== 'background')
    : STEPS

  const currentIndex = visibleSteps.findIndex((step) => step.id === currentStep)

  return (
    <div className="flex items-center justify-between gap-2">
      {visibleSteps.map((step, index) => {
        const Icon = step.icon
        const isCompleted = completedSteps.includes(step.id)
        const isCurrent = step.id === currentStep
        const isPending = !isCompleted && !isCurrent

        return (
          <div key={step.id} className="flex flex-1 items-center">
            <div className="flex flex-col items-center gap-1">
              <div
                className={cn(
                  'flex h-8 w-8 items-center justify-center rounded-full transition-colors',
                  isCompleted && 'bg-emerald-500 text-white',
                  isCurrent && 'bg-primary text-primary-foreground',
                  isPending && 'bg-input text-text-muted',
                )}
              >
                {isCompleted ? (
                  <Check size={16} />
                ) : (
                  <Icon size={16} className={cn(isCurrent && 'animate-pulse')} />
                )}
              </div>
              <span
                className={cn(
                  'text-[10px] font-medium',
                  isCompleted && 'text-emerald-400',
                  isCurrent && 'text-primary',
                  isPending && 'text-text-muted',
                )}
              >
                {step.label}
              </span>
            </div>

            {index < visibleSteps.length - 1 && (
              <div
                className={cn(
                  'mx-2 h-0.5 flex-1 rounded-full transition-colors',
                  index < currentIndex ? 'bg-emerald-500' : 'bg-border',
                )}
              />
            )}
          </div>
        )
      })}
    </div>
  )
}
