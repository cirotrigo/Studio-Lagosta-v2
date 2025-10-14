"use client"

import { Card } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { TrendingUp, Users, Activity } from "lucide-react"
import type { ComponentType } from "react"

type SummaryCardProps = {
  title: string
  value: string
  subtitle?: string
  icon: ComponentType<{ className?: string }>
}

function SummaryCard({ title, value, subtitle, icon: Icon }: SummaryCardProps) {
  return (
    <Card className="flex h-full flex-col gap-2 border border-border/40 bg-card/60 p-5">
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 text-primary">
          <Icon className="h-5 w-5" />
        </div>
        <div>
          <p className="text-xs uppercase tracking-wide text-muted-foreground">{title}</p>
          <p className="text-2xl font-semibold text-foreground">{value}</p>
        </div>
      </div>
      {subtitle && <p className="text-xs text-muted-foreground">{subtitle}</p>}
    </Card>
  )
}

export interface AnalyticsSummaryCardsProps {
  isLoading: boolean
  totalCreditsUsed?: number
  totalOperations?: number
  membersActive?: number
  creditsPerMonth?: number
}

export function AnalyticsSummaryCards({
  isLoading,
  totalCreditsUsed = 0,
  totalOperations = 0,
  membersActive = 0,
  creditsPerMonth = 0,
}: AnalyticsSummaryCardsProps) {
  if (isLoading) {
    return (
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {Array.from({ length: 3 }).map((_, index) => (
          <Skeleton key={index} className="h-28 w-full" />
        ))}
      </div>
    )
  }

  const creditsSubtitle = creditsPerMonth
    ? `Plano: ${creditsPerMonth.toLocaleString()} créditos por ciclo`
    : undefined

  return (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
      <SummaryCard
        title="Créditos usados"
        value={totalCreditsUsed.toLocaleString()}
        subtitle={creditsSubtitle}
        icon={TrendingUp}
      />
      <SummaryCard
        title="Operações registrada"
        value={totalOperations.toLocaleString()}
        subtitle="Chamadas que consumiram créditos"
        icon={Activity}
      />
      <SummaryCard
        title="Membros ativos"
        value={membersActive.toLocaleString()}
        subtitle="Usuários que consumiram créditos no período"
        icon={Users}
      />
    </div>
  )
}
