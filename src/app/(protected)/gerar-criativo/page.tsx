'use client'

import { GerarCriativoProvider } from '@/components/gerar-criativo/gerar-criativo-context'
import { StepperProvider, useStepper, steps } from '@/components/gerar-criativo/stepper'
import { ProjectSelectionStep } from '@/components/gerar-criativo/steps/project-selection-step'
import { TemplateSelectionStep } from '@/components/gerar-criativo/steps/template-selection-step'
import { ModelPageStep } from '@/components/gerar-criativo/steps/model-page-step'
import { ImageSelectionStep } from '@/components/gerar-criativo/steps/image-selection-step'
import { AdjustmentsStep } from '@/components/gerar-criativo/steps/adjustments-step'
import { ScheduleStep } from '@/components/gerar-criativo/steps/schedule-step'
import { useMediaQuery } from '@/hooks/use-media-query'
import { cn } from '@/lib/utils'

function StepperNavigation() {
  const stepper = useStepper()
  const isMobile = useMediaQuery('(max-width: 768px)')

  if (isMobile) {
    const currentIndex = steps.findIndex((s) => s.id === stepper.current.id)
    return (
      <div className="flex items-center justify-between mb-6">
        <div className="text-sm font-medium">{stepper.current.label}</div>
        <div className="text-sm text-muted-foreground">
          {currentIndex + 1} / {steps.length}
        </div>
      </div>
    )
  }

  return (
    <nav className="flex items-center justify-between mb-8" aria-label="Progress">
      <ol className="flex items-center w-full">
        {steps.map((step, index) => {
          const currentIndex = steps.findIndex((s) => s.id === stepper.current.id)
          const isCompleted = index < currentIndex
          const isCurrent = step.id === stepper.current.id

          return (
            <li
              key={step.id}
              className={cn(
                'flex items-center',
                index < steps.length - 1 && 'flex-1'
              )}
            >
              <div className="flex flex-col items-center">
                <div
                  className={cn(
                    'flex items-center justify-center w-10 h-10 rounded-full border-2 text-sm font-medium transition-colors',
                    isCompleted && 'bg-primary border-primary text-primary-foreground',
                    isCurrent && 'border-primary text-primary',
                    !isCompleted && !isCurrent && 'border-muted-foreground/25 text-muted-foreground'
                  )}
                >
                  {isCompleted ? (
                    <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                      <path
                        fillRule="evenodd"
                        d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                        clipRule="evenodd"
                      />
                    </svg>
                  ) : (
                    index + 1
                  )}
                </div>
                <span
                  className={cn(
                    'mt-2 text-xs font-medium hidden lg:block',
                    isCurrent ? 'text-foreground' : 'text-muted-foreground'
                  )}
                >
                  {step.label}
                </span>
              </div>
              {index < steps.length - 1 && (
                <div
                  className={cn(
                    'flex-1 h-0.5 mx-2',
                    index < currentIndex ? 'bg-primary' : 'bg-muted-foreground/25'
                  )}
                />
              )}
            </li>
          )
        })}
      </ol>
    </nav>
  )
}

function WizardContent() {
  const stepper = useStepper()

  return (
    <div className="container max-w-4xl mx-auto py-6 px-4">
      <div className="mb-6">
        <h1 className="text-2xl font-bold">Gerar Criativo</h1>
        <p className="text-muted-foreground">
          Crie e agende criativos de forma rapida e facil
        </p>
      </div>

      <StepperNavigation />

      <div className="mt-6">
        {stepper.switch({
          projeto: () => <ProjectSelectionStep />,
          template: () => <TemplateSelectionStep />,
          pagina: () => <ModelPageStep />,
          imagem: () => <ImageSelectionStep />,
          ajustes: () => <AdjustmentsStep />,
          agendar: () => <ScheduleStep />,
        })}
      </div>
    </div>
  )
}

export default function GerarCriativoPage() {
  return (
    <GerarCriativoProvider>
      <StepperProvider>
        <WizardContent />
      </StepperProvider>
    </GerarCriativoProvider>
  )
}
