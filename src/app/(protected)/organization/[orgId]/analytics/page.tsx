"use client"

import { useState } from "react"
import { useOrganization } from "@clerk/nextjs"
import { useParams } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { Card } from "@/components/ui/card"
import { useSetPageMetadata } from "@/contexts/page-metadata"
import {
  useOrganizationAnalytics,
  useOrganizationMemberAnalytics,
  useOrganizationTimeline,
} from "@/hooks/use-organizations"
import { AnalyticsSummaryCards } from "@/components/organization/analytics-summary-cards"
import { FeatureUsageList } from "@/components/organization/feature-usage-list"
import { MemberAnalyticsTable } from "@/components/organization/member-analytics-table"
import { UsageTrendChart } from "@/components/organizations/usage-trend-chart"
import { FeatureBreakdownChart } from "@/components/organizations/feature-breakdown-chart"
import { DateRangePicker } from "@/components/analytics/date-range-picker"
import { CalendarIcon, RefreshCw } from "lucide-react"
import { cn } from "@/lib/utils"
import { DateRange } from "react-day-picker"

const PERIOD_OPTIONS = [
  { label: "7 dias", value: "7d" },
  { label: "30 dias", value: "30d" },
  { label: "90 dias", value: "90d" },
  { label: "Customizado", value: "custom" },
]

export default function OrganizationAnalyticsPage() {
  const params = useParams<{ orgId: string }>()
  const orgIdParam = params.orgId
  const { organization, isLoaded, membership } = useOrganization()
  const isActiveOrganization = organization?.id === orgIdParam
  const [period, setPeriod] = useState<string>("30d")
  const [customDateRange, setCustomDateRange] = useState<DateRange | undefined>()
  const [searchQuery, setSearchQuery] = useState<string>("")
  const [sortBy, setSortBy] = useState<string>("totalCreditsUsed")
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc')

  const analyticsParams = period === 'custom' && customDateRange?.from && customDateRange?.to
    ? {
        period: 'custom',
        startDate: customDateRange.from.toISOString(),
        endDate: customDateRange.to.toISOString(),
      }
    : { period }

  const analyticsQuery = useOrganizationAnalytics(
    isActiveOrganization ? organization.id : null,
    analyticsParams,
  )
  const membersQuery = useOrganizationMemberAnalytics(
    isActiveOrganization ? organization.id : null,
    {
      ...analyticsParams,
      search: searchQuery || undefined,
      sortBy,
      order: sortOrder,
    },
  )
  const timelineQuery = useOrganizationTimeline(
    isActiveOrganization ? organization.id : null,
    { period: period === 'custom' && customDateRange?.from && customDateRange?.to ? '30d' : period },
  )

  useSetPageMetadata({
    title: organization?.name ? `${organization.name} · Analytics` : "Analytics da organização",
    description: "Acompanhe o desempenho da equipe e entenda quais recursos consomem mais créditos.",
    breadcrumbs: [
      { label: "Início", href: "/studio" },
      { label: "Organizações", href: "/organization" },
      { label: organization?.name ?? "Organização", href: `/organization/${orgIdParam}` },
      { label: "Analytics" },
    ],
  })

  if (!isLoaded) {
    return <Skeleton className="h-60 w-full" />
  }

  if (!organization) {
    return (
      <Card className="border border-border/40 bg-card/60 p-8 text-sm text-muted-foreground">
        Selecione uma organização ativa para visualizar os analytics da equipe.
      </Card>
    )
  }

  if (!isActiveOrganization) {
    return (
      <Card className="border border-border/40 bg-card/60 p-8 text-sm text-muted-foreground">
        Troque para a organização correta usando o seletor no topo para acessar esta página.
      </Card>
    )
  }

  const summary = analyticsQuery.data?.summary
  const features = analyticsQuery.data?.features ?? []
  const recentActivity = (analyticsQuery.data?.recentActivity ?? []).map((entry) => ({
    id: entry.id,
    userId: entry.userId ?? "",
    credits: entry.credits,
    feature: entry.feature,
    createdAt: entry.createdAt,
    metadata: entry.projectId ? { projectId: entry.projectId } : undefined,
  }))

  const members = membersQuery.data?.members ?? []

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <h2 className="text-xl font-semibold text-foreground">
            Analytics de créditos · {organization.name}
          </h2>
          <p className="text-sm text-muted-foreground">
            Visualize a distribuição de consumo de créditos pelos recursos e membros da equipe.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <PeriodToggle
            value={period}
            onChange={setPeriod}
            disabled={analyticsQuery.isFetching || membersQuery.isFetching}
          />
          {period === 'custom' && (
            <DateRangePicker
              value={customDateRange}
              onChange={setCustomDateRange}
              disabled={analyticsQuery.isFetching || membersQuery.isFetching}
            />
          )}
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              analyticsQuery.refetch()
              membersQuery.refetch()
              timelineQuery.refetch()
            }}
            disabled={analyticsQuery.isFetching || membersQuery.isFetching || timelineQuery.isFetching}
          >
            <RefreshCw
              className={cn(
                "mr-2 h-4 w-4",
                (analyticsQuery.isFetching || membersQuery.isFetching || timelineQuery.isFetching) && "animate-spin",
              )}
            />
            Atualizar
          </Button>
        </div>
      </div>

      <AnalyticsSummaryCards
        isLoading={analyticsQuery.isLoading}
        totalCreditsUsed={summary?.totalCreditsUsed}
        totalOperations={summary?.totalOperations}
        membersActive={summary?.membersActive}
        creditsPerMonth={analyticsQuery.data?.organization.creditsPerMonth}
      />

      {/* Usage Trend Chart */}
      <UsageTrendChart
        data={timelineQuery.data?.timeline ?? []}
        period={period}
        isLoading={timelineQuery.isLoading}
      />

      {/* Feature Breakdown Chart */}
      <FeatureBreakdownChart
        data={features}
        isLoading={analyticsQuery.isLoading}
      />

      <div className="grid gap-4 lg:grid-cols-2">
        <FeatureUsageList
          features={features}
          isLoading={analyticsQuery.isLoading}
          totalCreditsUsed={summary?.totalCreditsUsed}
          recentActivity={recentActivity}
        />
        <Card className="border border-border/40 bg-card/60 p-6">
          <h3 className="text-lg font-semibold text-foreground">Período analisado</h3>
          <p className="mt-2 text-sm text-muted-foreground">
            Os dados abaixo refletem as atividades registradas no período selecionado.
          </p>
          <div className="mt-4 flex items-center gap-2 rounded-md border border-border/40 bg-background/60 px-3 py-2 text-sm text-muted-foreground">
            <CalendarIcon className="h-4 w-4" />
            <span>
              {analyticsQuery.data?.period
                ? `${new Date(analyticsQuery.data.period.start).toLocaleDateString()} até ${new Date(analyticsQuery.data.period.end).toLocaleDateString()}`
                : "Período desconhecido"}
            </span>
          </div>
          <p className="mt-4 text-xs text-muted-foreground">
            Os relatórios são atualizados automaticamente conforme novas operações de créditos são registradas.
            Você pode forçar uma atualização manual a qualquer momento.
          </p>
        </Card>
      </div>

      <MemberAnalyticsTable
        members={members}
        isLoading={membersQuery.isLoading}
        totals={membersQuery.data?.totals}
        searchValue={searchQuery}
        onSearchChange={setSearchQuery}
        sortBy={sortBy}
        sortOrder={sortOrder}
        onSortChange={(newSortBy, newOrder) => {
          setSortBy(newSortBy)
          setSortOrder(newOrder)
        }}
      />

      {membership?.role !== "org:admin" && (
        <Card className="border border-border/40 bg-card/40 p-4 text-xs text-muted-foreground">
          Algumas ações (como exportar relatórios) podem exigir permissões adicionais. Contate um administrador se precisar de acessos extras.
        </Card>
      )}
    </div>
  )
}

function PeriodToggle({
  value,
  onChange,
  disabled,
}: {
  value: string
  onChange: (value: string) => void
  disabled?: boolean
}) {
  return (
    <div className="flex items-center overflow-hidden rounded-md border border-border/40 bg-background/60">
      {PERIOD_OPTIONS.map((option) => {
        const isActive = option.value === value
        return (
          <button
            key={option.value}
            type="button"
            onClick={() => onChange(option.value)}
            disabled={disabled}
            className={cn(
              "px-3 py-2 text-xs font-medium transition-colors",
              isActive
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:bg-muted/50",
            )}
          >
            {option.label}
          </button>
        )
      })}
    </div>
  )
}
