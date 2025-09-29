"use client";

import { Card } from "@/components/ui/card";
import {
  Users,
  TrendingUp,
  Activity
} from "lucide-react";
import { MrrBarChart, ArrBarChart, ChurnLineChart } from "@/components/charts/revenue-charts";
import { useDashboard } from "@/hooks/use-dashboard";

export default function AdminDashboard() {
  const { data: stats, isLoading, error } = useDashboard();

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-center">
          <p className="text-muted-foreground">Failed to load dashboard data</p>
          <p className="text-sm text-destructive mt-1">
            {error instanceof Error ? error.message : 'Unknown error'}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-foreground">Painel do Administrador</h1>
          <p className="text-muted-foreground mt-2">Visão geral do sistema e análises</p>
        </div>
        <div />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <Card className="p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-muted-foreground text-sm">Total de Usuários</p>
              <p className="text-2xl font-bold text-foreground mt-1">
                {stats?.totalUsers || 0}
              </p>
            </div>
            <Users className="h-8 w-8 text-blue-500" />
          </div>
          <div className="mt-4 flex items-center text-sm">
            <TrendingUp className="h-4 w-4 text-green-500 mr-1" />
            <span className="text-green-500">+12%</span>
            <span className="text-muted-foreground ml-2">do último mês</span>
          </div>
        </Card>

        <Card className="p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-muted-foreground text-sm">Usuários Ativos</p>
              <p className="text-2xl font-bold text-foreground mt-1">
                {stats?.activeUsers || 0}
              </p>
            </div>
            <Activity className="h-8 w-8 text-green-500" />
          </div>
          <div className="mt-4 flex items-center text-sm">
            <TrendingUp className="h-4 w-4 text-green-500 mr-1" />
            <span className="text-green-500">+8%</span>
            <span className="text-muted-foreground ml-2">da última semana</span>
          </div>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="p-6">
          <div className="mb-4 flex items-center justify-between gap-3">
            <div>
              <h2 className="text-xl font-semibold text-foreground">MRR</h2>
              <p className="text-sm text-muted-foreground">Receita Recorrente Mensal</p>
            </div>
            {stats?.mrrSeries && <DeltaBadge series={stats.mrrSeries} goodWhenPositive />}
          </div>
          {stats?.mrrSeries && <MrrBarChart data={stats.mrrSeries} />}
        </Card>

        <Card className="p-6">
          <div className="mb-4 flex items-center justify-between gap-3">
            <div>
              <h2 className="text-xl font-semibold text-foreground">ARR</h2>
              <p className="text-sm text-muted-foreground">Receita Recorrente Anual</p>
            </div>
            {stats?.arrSeries && <DeltaBadge series={stats.arrSeries} goodWhenPositive />}
          </div>
          {stats?.arrSeries && <ArrBarChart data={stats.arrSeries} />}
        </Card>

        <Card className="p-6">
          <div className="mb-4 flex items-center justify-between gap-3">
            <div>
              <h2 className="text-xl font-semibold text-foreground">Churn</h2>
              <p className="text-sm text-muted-foreground">Taxa de cancelamento de clientes</p>
            </div>
            {stats?.churnSeries && <DeltaBadge series={stats.churnSeries} goodWhenPositive={false} suffix="%" />}
          </div>
          {stats?.churnSeries && <ChurnLineChart data={stats.churnSeries} />}
        </Card>
      </div>
    </div>
  );
}

function DeltaBadge({ series, goodWhenPositive = true, suffix = "" }: { series: { label: string; value: number }[]; goodWhenPositive?: boolean; suffix?: string }) {
  if (!series || series.length < 2) return null
  const last = series[series.length - 1].value
  const prev = series[series.length - 2].value
  const deltaRaw = last - prev
  const deltaPct = prev === 0 ? (last > 0 ? 100 : 0) : (deltaRaw / prev) * 100
  const isGood = goodWhenPositive ? deltaPct > 0 : deltaPct < 0
  const isBad = goodWhenPositive ? deltaPct < 0 : deltaPct > 0
  const color = isGood ? "emerald" : isBad ? "red" : "zinc"
  const sign = deltaPct > 0 ? "+" : ""

  return (
    <span
      className={
        `inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-medium ` +
        (color === 'emerald'
          ? 'border-emerald-500/20 bg-emerald-500/10 text-emerald-600'
          : color === 'red'
          ? 'border-red-500/20 bg-red-500/10 text-red-600'
          : 'border-muted bg-muted/50 text-foreground/60')
      }
      title="Variação mês a mês"
    >
      {`${sign}${deltaPct.toFixed(1)}${suffix} MoM`}
    </span>
  )
}

// Removed seed/backfill demo buttons to simplify admin surface
