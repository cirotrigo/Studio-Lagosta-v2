"use client"

import { Loader2, TrendingDown, TrendingUp } from "lucide-react"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import type { ComponentType } from "react"

export type UsagePoint = {
  dateKey: string
  dateLabel: string
  spent: number
  added: number
}

export interface CreditUsageCardProps {
  title?: string
  subtitle?: string
  spentThisWeek: number
  addedThisWeek: number
  dailySeries: UsagePoint[]
  isLoading?: boolean
  onRefresh?: () => void
}

export function CreditUsageCard({
  title = "Uso recente de créditos",
  subtitle = "Saldos consumidos ou adicionados nos últimos dias",
  spentThisWeek,
  addedThisWeek,
  dailySeries,
  isLoading,
  onRefresh,
}: CreditUsageCardProps) {
  return (
    <Card className="border border-border/40 bg-card/60 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold text-foreground">{title}</h3>
          {subtitle && <p className="text-sm text-muted-foreground">{subtitle}</p>}
        </div>
        {onRefresh && (
          <Button variant="outline" size="sm" onClick={onRefresh} disabled={isLoading}>
            {isLoading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Atualizando
              </>
            ) : (
              "Atualizar"
            )}
          </Button>
        )}
      </div>

      <div className="mt-4 flex flex-wrap gap-4 text-sm">
        <TrendBadge
          icon={TrendingDown}
          label="Consumidos nesta semana"
          highlight={`-${spentThisWeek} créditos`}
        />
        <TrendBadge
          icon={TrendingUp}
          label="Adicionados nesta semana"
          highlight={`+${addedThisWeek} créditos`}
        />
      </div>

      <div className="mt-6 space-y-3">
        {isLoading ? (
          Array.from({ length: 5 }).map((_, index) => (
            <Skeleton key={index} className="h-12 w-full" />
          ))
        ) : dailySeries.length > 0 ? (
          dailySeries.map((point, index) => (
            <div
              key={`${point.dateKey}-${index}`}
              className="flex items-center justify-between rounded-md border border-border/30 bg-background/50 px-3 py-2 text-sm"
            >
              <div className="font-medium text-foreground">{point.dateLabel}</div>
              <div className="flex items-center gap-3 text-xs text-muted-foreground">
                <span className="flex items-center gap-1 text-destructive">
                  <TrendingDown className="h-3 w-3" />
                  {point.spent} usados
                </span>
                <span className="flex items-center gap-1 text-green-500">
                  <TrendingUp className="h-3 w-3" />
                  {point.added} adicionados
                </span>
              </div>
            </div>
          ))
        ) : (
          <p className="text-sm text-muted-foreground">
            Nenhum uso registrado recentemente. As operações da equipe aparecerão aqui.
          </p>
        )}
      </div>
    </Card>
  )
}

function TrendBadge({
  icon: Icon,
  label,
  highlight,
}: {
  icon: ComponentType<{ className?: string }>
  label: string
  highlight: string
}) {
  return (
    <div className="flex items-center gap-2 rounded-md border border-border/40 bg-background/60 px-3 py-2">
      <Icon className="h-4 w-4 text-primary" />
      <div className="text-xs leading-tight">
        <p className="font-semibold text-foreground">{highlight}</p>
        <p className="text-muted-foreground">{label}</p>
      </div>
    </div>
  )
}
