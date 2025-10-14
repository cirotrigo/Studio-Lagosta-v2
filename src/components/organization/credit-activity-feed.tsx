"use client"

import { History } from "lucide-react"
import { Card } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"

export type CreditActivityEntry = {
  id: string
  userId: string
  credits: number
  feature: string
  createdAt: string
  metadata?: Record<string, unknown>
  project?: { id: number; name: string }
}

export interface CreditActivityFeedProps {
  title?: string
  subtitle?: string
  entries: CreditActivityEntry[]
  isLoading?: boolean
  emptyMessage?: string
}

export function CreditActivityFeed({
  title = "Atividade da equipe",
  subtitle = "Últimas ações realizadas por membros e automatizações",
  entries,
  isLoading,
  emptyMessage = "Assim que membros consumirem créditos, as atividades aparecerão aqui.",
}: CreditActivityFeedProps) {
  return (
    <Card className="border border-border/40 bg-card/60 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold text-foreground">{title}</h3>
          {subtitle && <p className="text-sm text-muted-foreground">{subtitle}</p>}
        </div>
        <History className="h-5 w-5 text-muted-foreground" />
      </div>

      <div className="mt-4 space-y-3">
        {isLoading ? (
          Array.from({ length: 5 }).map((_, index) => (
            <Skeleton key={index} className="h-12 w-full" />
          ))
        ) : entries.length > 0 ? (
          entries.slice(0, 8).map((entry) => (
            <FeedItem key={entry.id} entry={entry} />
          ))
        ) : (
          <p className="text-sm text-muted-foreground">{emptyMessage}</p>
        )}
      </div>
    </Card>
  )
}

function FeedItem({ entry }: { entry: CreditActivityEntry }) {
  const isCreditAddition = entry.credits < 0
  const absoluteCredits = Math.abs(entry.credits)
  const feature = formatFeature(entry.feature)
  const projectName = entry.project?.name

  return (
    <div className="flex items-start justify-between rounded-md border border-border/30 bg-background/40 px-3 py-2 text-sm">
      <div className="space-y-1">
        <div className="flex items-center gap-2 font-medium text-foreground">
          <span>{isCreditAddition ? "Créditos adicionados" : "Créditos usados"}</span>
          <Badge
            variant="outline"
            className={cn("text-xs", isCreditAddition ? "text-green-600" : "text-destructive")}
          >
            {isCreditAddition ? `+${absoluteCredits}` : `-${absoluteCredits}`}
          </Badge>
        </div>
        <p className="text-xs text-muted-foreground">
          {feature}
          {projectName ? ` · Projeto: ${projectName}` : ""}
        </p>
      </div>
      <div className="text-xs text-muted-foreground">
        {new Date(entry.createdAt).toLocaleString()}
      </div>
    </div>
  )
}

function formatFeature(feature: string) {
  return feature
    .replace(/_/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase())
}
