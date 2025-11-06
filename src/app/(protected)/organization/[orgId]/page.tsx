"use client"

import { useMemo, type ComponentType } from "react"
import { useOrganization } from "@clerk/nextjs"
import {
  Building2,
  Coins,
  FolderOpen,
  Users,
} from "lucide-react"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import Link from "next/link"
import { useSetPageMetadata } from "@/contexts/page-metadata"
import { Skeleton } from "@/components/ui/skeleton"
import {
  useOrganizationCredits,
  useOrganizationProjects,
  useOrganizationCreditsUsage,
} from "@/hooks/use-organizations"
import { useParams } from "next/navigation"
import { CreditUsageCard, UsagePoint } from "@/components/organization/credit-usage-card"
import { CreditActivityFeed, CreditActivityEntry } from "@/components/organization/credit-activity-feed"

export default function OrganizationDashboardPage() {
  const params = useParams<{ orgId: string }>()
  const orgId = params.orgId
  const { organization, membership, isLoaded } = useOrganization()
  const isActiveOrganization = organization?.id === orgId
  const {
    data: creditsData,
    isLoading: creditsLoading,
  } = useOrganizationCredits(isActiveOrganization ? organization.id : null)
  const {
    data: projectsData,
    isLoading: projectsLoading,
  } = useOrganizationProjects(isActiveOrganization ? organization.id : null)
  const {
    data: usageData,
    isLoading: usageLoading,
    refetch: refetchUsage,
  } = useOrganizationCreditsUsage(isActiveOrganization ? organization.id : null, { limit: 50 })

  const membersCount = organization?.membersCount ?? 0
  const projectsCount = projectsData?.projects.length ?? 0
  const creditsCurrent = creditsData?.credits.current ?? 0
  const creditsTotal = creditsData?.limits.creditsPerMonth ?? 0
  useSetPageMetadata({
    title: organization?.name ?? "Organização",
    description: organization
      ? "Visão geral da sua equipe, créditos e atividades compartilhadas."
      : "Selecione uma organização ativa para visualizar o dashboard de equipe.",
    breadcrumbs: [
      { label: "Início", href: "/studio" },
      { label: "Organizações", href: "/organization" },
      { label: organization?.name ?? "Detalhes" },
    ],
  })

  const content = useMemo(() => {
    if (!isLoaded) {
      return <Skeleton className="h-60 w-full" />
    }

    if (!organization) {
      return (
        <Card className="border border-border/40 bg-card/60 p-8 text-sm text-muted-foreground">
          Nenhuma organização ativa. Use o seletor no topo para escolher ou criar uma equipe.
        </Card>
      )
    }

    if (!isActiveOrganization) {
      return (
        <Card className="border border-border/40 bg-card/60 p-8">
          <p className="text-sm text-muted-foreground">
            Você está tentando acessar <strong>{orgId}</strong>, mas atualmente está no contexto da organização <strong>{organization.name}</strong>.
          </p>
          <p className="mt-2 text-sm text-muted-foreground">
            Altere o contexto usando o seletor no topo para abrir este dashboard ou navegue até a organização ativa abaixo.
          </p>
          <Button className="mt-4" variant="default" asChild>
            <Link href={`/organization/${organization.id}`}>Ir para {organization.name}</Link>
          </Button>
        </Card>
      )
    }

    const usageEntries = (usageData?.data ?? []) as CreditActivityEntry[]
    const { spentThisWeek, addedThisWeek, dailySeries } = buildCreditsInsights(usageEntries)

    return (
      <div className="space-y-6">
        <Card className="border border-border/40 bg-card/60 p-6">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div className="flex items-start gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary">
                <Building2 className="h-6 w-6" />
              </div>
              <div>
                <h2 className="text-xl font-semibold">{organization.name}</h2>
                <p className="text-sm text-muted-foreground">
                  {membership?.role === "org:admin"
                    ? "Você é administrador desta equipe. Gerencie membros, créditos e limites."
                    : "Você está colaborando como membro desta equipe."}
                </p>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" asChild>
                <Link href={`/organization/${organization.id}/projects`}>Projetos</Link>
              </Button>
              <Button variant="outline" asChild>
                <Link href={`/organization/${organization.id}/members`}>Membros</Link>
              </Button>
              <Button variant="outline" asChild>
                <Link href={`/organization/${organization.id}/analytics`}>Analytics</Link>
              </Button>
              <Button variant="default" asChild>
                <Link href={`/organization/${organization.id}/credits`}>Créditos</Link>
              </Button>
            </div>
          </div>
        </Card>

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <SummaryCard
            title="Créditos disponíveis"
            value={creditsLoading ? "…" : creditsCurrent.toLocaleString()}
            subtitle={creditsTotal ? `de ${creditsTotal.toLocaleString()} por ciclo` : ""}
            icon={Coins}
          />
          <SummaryCard
            title="Projetos compartilhados"
            value={projectsLoading ? "…" : projectsCount}
            subtitle="Projetos acessíveis a toda a equipe"
            icon={FolderOpen}
          />
          <SummaryCard
            title="Membros"
            value={membersCount}
            subtitle="Contagem fornecida pelo Clerk"
            icon={Users}
          />
          <SummaryCard
            title="Função atual"
            value={membership?.role === "org:admin" ? "Administrador" : "Membro"}
            subtitle="Permissões definidas no Clerk"
            icon={Building2}
          />
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          <CreditUsageCard
            spentThisWeek={spentThisWeek}
            addedThisWeek={addedThisWeek}
            dailySeries={dailySeries}
            isLoading={usageLoading}
            onRefresh={() => refetchUsage()}
          />

          <CreditActivityFeed
            entries={usageEntries}
            isLoading={usageLoading}
          />
        </div>

        <Card className="border border-border/40 bg-card/60 p-6">
          <h3 className="text-lg font-semibold">O que fazer a seguir?</h3>
          <div className="mt-4 grid gap-4 md:grid-cols-3">
            <NextStep
              title="Compartilhar um projeto"
              description="Selecione projetos existentes para disponibilizar à equipe."
              href={`/organization/${organization.id}/projects`}
            />
            <NextStep
              title="Convidar novos membros"
              description="Gerencie convites, papéis e permissões diretamente pelo Clerk."
              href={`/organization/${organization.id}/members`}
            />
            <NextStep
              title="Analisar consumo"
              description="Veja quais recursos e membros consomem mais créditos."
              href={`/organization/${organization.id}/analytics`}
            />
          </div>
        </Card>
      </div>
    )
  }, [
    creditsCurrent,
    creditsLoading,
    creditsTotal,
    isActiveOrganization,
    isLoaded,
    membership?.role,
    membersCount,
    organization,
    orgId,
    projectsCount,
    projectsLoading,
    usageLoading,
    refetchUsage,
    usageData?.data,
  ])

  return content
}

function SummaryCard({
  title,
  value,
  subtitle,
  icon: Icon,
}: {
  title: string
  value: string | number
  subtitle?: string
  icon: ComponentType<{ className?: string }>
}) {
  return (
    <Card className="flex flex-col gap-3 border border-border/40 bg-card/60 p-5">
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

function NextStep({ title, description, href }: { title: string; description: string; href: string }) {
  return (
    <Card className="flex h-full flex-col justify-between gap-3 border border-dashed border-border/40 bg-card/40 p-5">
      <div>
        <h4 className="text-base font-semibold text-foreground">{title}</h4>
        <p className="mt-2 text-sm text-muted-foreground">{description}</p>
      </div>
      <Button variant="link" className="justify-start px-0" asChild>
        <Link href={href}>
          Abrir página
          <span className="ml-1 text-primary">→</span>
        </Link>
      </Button>
    </Card>
  )
}

function getWeekStart(date: Date) {
  const copy = new Date(date)
  const day = copy.getDay() // 0 (Sun) - 6 (Sat)
  const diff = copy.getDate() - day + (day === 0 ? -6 : 1) // start Monday
  copy.setDate(diff)
  copy.setHours(0, 0, 0, 0)
  return copy
}

function buildCreditsInsights(entries: CreditActivityEntry[]) {
  if (entries.length === 0) {
    return {
      spentThisWeek: 0,
      addedThisWeek: 0,
      dailySeries: [],
    }
  }

  const now = new Date()
  const weekStart = getWeekStart(now)

  let spentThisWeek = 0
  let addedThisWeek = 0

  const map = new Map<string, UsagePoint>()

  for (const entry of entries) {
    const date = new Date(entry.createdAt)
    const dayKey = date.toISOString().slice(0, 10)
    const dayLabel = date.toLocaleDateString(undefined, { day: "2-digit", month: "short" })

    if (!map.has(dayKey)) {
      map.set(dayKey, { dateKey: dayKey, dateLabel: dayLabel, spent: 0, added: 0 })
    }
    const bucket = map.get(dayKey)!

    if (entry.credits >= 0) {
      bucket.spent += entry.credits
    } else {
      bucket.added += Math.abs(entry.credits)
    }

    if (date >= weekStart) {
      if (entry.credits >= 0) spentThisWeek += entry.credits
      else addedThisWeek += Math.abs(entry.credits)
    }
  }

  const dailySeries = Array.from(map.entries())
    .sort(([a], [b]) => (a < b ? 1 : -1))
    .slice(0, 7)
    .map(([, value]) => value)

  return {
    spentThisWeek,
    addedThisWeek,
    dailySeries,
  }
}
