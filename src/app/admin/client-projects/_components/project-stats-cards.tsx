"use client"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"

interface ProjectStatsCardsProps {
  stats: {
    total: number
    active: number
    inactive: number
    archived: number
  }
}

export function ProjectStatsCards({ stats }: ProjectStatsCardsProps) {
  const items = [
    { label: "Total", value: stats.total },
    { label: "Ativos", value: stats.active },
    { label: "Inativos", value: stats.inactive },
    { label: "Arquivados", value: stats.archived },
  ]

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {items.map((item) => (
        <Card key={item.label} className="border-border/60">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              {item.label}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{item.value}</p>
          </CardContent>
        </Card>
      ))}
    </div>
  )
}
