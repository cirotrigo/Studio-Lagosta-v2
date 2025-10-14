"use client"

import { useMemo, type ComponentType } from "react"
import { useOrganization } from "@clerk/nextjs"
import { Building2, Coins, FolderOpen, Users } from "lucide-react"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import Link from "next/link"
import { useSetPageMetadata } from "@/contexts/page-metadata"
import { Skeleton } from "@/components/ui/skeleton"
import { useOrganizationCredits, useOrganizationProjects } from "@/hooks/use-organizations"

export default function OrganizationDashboardPage({ params }: { params: { orgId: string } }) {
  const { organization, membership, isLoaded } = useOrganization()
  const isActiveOrganization = organization?.id === params.orgId
  const {
    data: creditsData,
    isLoading: creditsLoading,
  } = useOrganizationCredits(isActiveOrganization ? organization.id : null)
  const {
    data: projectsData,
    isLoading: projectsLoading,
  } = useOrganizationProjects(isActiveOrganization ? organization.id : null)

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
      { label: "Início", href: "/dashboard" },
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
            Você está tentando acessar <strong>{params.orgId}</strong>, mas atualmente está no contexto da organização <strong>{organization.name}</strong>.
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

        <Card className="border border-border/40 bg-card/60 p-6">
          <h3 className="text-lg font-semibold">O que fazer a seguir?</h3>
          <div className="mt-4 grid gap-4 md:grid-cols-2">
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
    params.orgId,
    projectsCount,
    projectsLoading,
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
