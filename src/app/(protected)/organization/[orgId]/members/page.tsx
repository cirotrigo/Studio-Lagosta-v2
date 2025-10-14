"use client"

import { OrganizationProfile, useOrganization } from "@clerk/nextjs"
import { Card } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { useSetPageMetadata } from "@/contexts/page-metadata"

export default function OrganizationMembersPage({ params }: { params: { orgId: string } }) {
  const { organization, isLoaded } = useOrganization()
  const isActiveOrganization = organization?.id === params.orgId

  useSetPageMetadata({
    title: "Membros da organização",
    description: "Convide pessoas, defina cargos e acompanhe a equipe pela interface do Clerk.",
    breadcrumbs: [
      { label: "Início", href: "/dashboard" },
      { label: "Organizações", href: "/organization" },
      { label: organization?.name ?? "Organização", href: `/organization/${params.orgId}` },
      { label: "Membros" },
    ],
  })

  if (!isLoaded) {
    return <Skeleton className="h-60 w-full" />
  }

  if (!organization) {
    return (
      <Card className="border border-border/40 bg-card/60 p-8 text-sm text-muted-foreground">
        Selecione uma organização ativa para gerenciar membros.
      </Card>
    )
  }

  if (!isActiveOrganization) {
    return (
      <Card className="border border-border/40 bg-card/60 p-8 text-sm text-muted-foreground">
        Troque para a organização correta usando o seletor no topo para acessar a página de membros.
      </Card>
    )
  }

  return (
    <Card className="border border-border/40 bg-card/60 p-6">
      <OrganizationProfile
        appearance={{
          elements: {
            rootBox: "w-full",
            card: "bg-background/80 border border-border/40 shadow-sm",
          },
        }}
      />
    </Card>
  )
}
