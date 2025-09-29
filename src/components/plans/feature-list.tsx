import { Check } from 'lucide-react'
import { cn } from '@/lib/utils'

type Feature = {
  name: string
  description?: string
  included: boolean
}

type FeatureListProps = {
  features: Feature[]
  className?: string
}

export function FeatureList({ features, className }: FeatureListProps) {
  if (features.length === 0) {
    return null
  }

  return (
    <div className={cn("space-y-4", className)}>
      {features.map((feature) => (
        <div key={feature.name} className="flex gap-4">
          <div
            className={cn(
              'mt-1 p-0.5 rounded-full transition-colors duration-200',
              feature.included
                ? 'text-emerald-600 dark:text-emerald-400'
                : 'text-zinc-400 dark:text-zinc-600'
            )}
          >
            <Check className="w-4 h-4" />
          </div>
          <div>
            <div className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
              {feature.name}
            </div>
            {feature.description && (
              <div className="text-sm text-zinc-500 dark:text-zinc-400">
                {feature.description}
              </div>
            )}
          </div>
        </div>
      ))}
    </div>
  )
}
