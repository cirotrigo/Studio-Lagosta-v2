"use client"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"

interface ClientStatsCardsProps {
  stats: {
    total: number
    pending: number
    accepted: number
    completed: number
    cancelled: number
    expired: number
  }
}

const ITEMS: Array<{
  key: keyof ClientStatsCardsProps["stats"]
  label: string
}> = [
  { key: "total", label: "Total" },
  { key: "pending", label: "Pendentes" },
  { key: "completed", label: "Completos" },
  { key: "accepted", label: "Aceitos" },
  { key: "cancelled", label: "Cancelados" },
  { key: "expired", label: "Expirados" },
]

export function ClientStatsCards({ stats }: ClientStatsCardsProps) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-6">
      {ITEMS.map((item) => (
        <Card key={item.key} className="border-border/60">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              {item.label}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{stats[item.key]}</p>
          </CardContent>
        </Card>
      ))}
    </div>
  )
}
