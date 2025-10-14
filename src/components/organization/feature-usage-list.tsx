"use client"

import { Card } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { CreditActivityEntry } from "@/components/organization/credit-activity-feed"

type FeatureUsage = {
  feature: string
  operations: number
  creditsUsed: number
}

function formatFeatureName(feature: string) {
  return feature
    .replace(/_/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase())
}

function toPercentage(part: number, total: number) {
  if (!total) return "0%"
  return `${Math.round((part / total) * 100)}%`
}

export interface FeatureUsageListProps {
  features: FeatureUsage[]
  isLoading?: boolean
  totalCreditsUsed?: number
  recentActivity?: CreditActivityEntry[]
}

export function FeatureUsageList({
  features,
  isLoading,
  totalCreditsUsed = 0,
  recentActivity = [],
}: FeatureUsageListProps) {
  return (
    <Card className="border border-border/40 bg-card/60 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold text-foreground">Recursos que mais consomem créditos</h3>
          <p className="text-sm text-muted-foreground">
            Distribuição das chamadas que utilizaram créditos no período selecionado.
          </p>
        </div>
      </div>

      {isLoading ? (
        <div className="mt-6 space-y-3">
          {Array.from({ length: 5 }).map((_, idx) => (
            <Skeleton key={idx} className="h-14 w-full" />
          ))}
        </div>
      ) : features.length > 0 ? (
        <div className="mt-6 space-y-3">
          {features.map((feature) => (
            <div
              key={feature.feature}
              className="flex items-center justify-between rounded-md border border-border/30 bg-background/40 px-3 py-3 text-sm"
            >
              <div>
                <p className="font-medium text-foreground">{formatFeatureName(feature.feature)}</p>
                <p className="text-xs text-muted-foreground">
                  {feature.operations.toLocaleString()} operações · {feature.creditsUsed.toLocaleString()} créditos
                </p>
              </div>
              <span className="text-xs font-semibold text-primary">
                {toPercentage(feature.creditsUsed, totalCreditsUsed)}
              </span>
            </div>
          ))}
        </div>
      ) : (
        <p className="mt-6 text-sm text-muted-foreground">
          Nenhum registro de uso foi encontrado para o período selecionado.
        </p>
      )}

      {recentActivity.length > 0 && (
        <div className="mt-6">
          <h4 className="text-sm font-semibold text-foreground">Atividades recentes</h4>
          <ul className="mt-3 space-y-2 text-xs text-muted-foreground">
            {recentActivity.slice(0, 5).map((entry) => (
              <li key={entry.id} className="flex justify-between">
                <span>{formatFeatureName(entry.feature)}</span>
                <span className="font-medium text-foreground">
                  {entry.credits > 0 ? `-${entry.credits}` : entry.credits} créditos
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </Card>
  )
}
