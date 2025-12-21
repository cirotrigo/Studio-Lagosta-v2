'use client'

import { Check } from 'lucide-react'
import { cn } from '@/lib/utils'

export interface Step {
  id: number
  title: string
  description?: string
}

interface StepperProps {
  steps: Step[]
  currentStep: number
  onStepClick?: (stepId: number) => void
}

export function Stepper({ steps, currentStep, onStepClick }: StepperProps) {
  return (
    <div className="w-full">
      {/* Mobile: Compact progress bar */}
      <div className="md:hidden">
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm font-medium">
            Etapa {currentStep + 1} de {steps.length}
          </span>
          <span className="text-xs text-muted-foreground">
            {steps[currentStep]?.title}
          </span>
        </div>
        <div className="h-2 bg-muted rounded-full overflow-hidden">
          <div
            className="h-full bg-primary transition-all duration-300"
            style={{ width: `${((currentStep + 1) / steps.length) * 100}%` }}
          />
        </div>
      </div>

      {/* Desktop: Full stepper */}
      <div className="hidden md:block">
        <div className="flex items-center justify-between">
          {steps.map((step, index) => {
            const isCompleted = index < currentStep
            const isCurrent = index === currentStep
            const isClickable = onStepClick && index <= currentStep

            return (
              <div key={step.id} className="flex items-center flex-1">
                {/* Step circle */}
                <button
                  onClick={() => isClickable && onStepClick(index)}
                  disabled={!isClickable}
                  className={cn(
                    'flex flex-col items-center gap-2 transition-all',
                    isClickable && 'cursor-pointer hover:scale-105'
                  )}
                >
                  <div
                    className={cn(
                      'flex items-center justify-center w-10 h-10 rounded-full border-2 transition-all',
                      isCompleted &&
                        'bg-primary border-primary text-primary-foreground',
                      isCurrent &&
                        'border-primary bg-primary/10 text-primary font-semibold',
                      !isCompleted &&
                        !isCurrent &&
                        'border-border bg-background text-muted-foreground'
                    )}
                  >
                    {isCompleted ? (
                      <Check className="h-5 w-5" />
                    ) : (
                      <span className="text-sm font-medium">{step.id}</span>
                    )}
                  </div>

                  <div className="text-center">
                    <div
                      className={cn(
                        'text-xs font-medium transition-colors',
                        isCurrent && 'text-primary',
                        isCompleted && 'text-foreground',
                        !isCurrent && !isCompleted && 'text-muted-foreground'
                      )}
                    >
                      {step.title}
                    </div>
                    {step.description && (
                      <div className="text-[10px] text-muted-foreground mt-0.5 max-w-[100px] truncate">
                        {step.description}
                      </div>
                    )}
                  </div>
                </button>

                {/* Connector line */}
                {index < steps.length - 1 && (
                  <div
                    className={cn(
                      'flex-1 h-0.5 mx-4 transition-colors',
                      index < currentStep ? 'bg-primary' : 'bg-border'
                    )}
                  />
                )}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
