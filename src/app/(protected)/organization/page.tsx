"use client"

import { useOrganization } from "@clerk/nextjs"
import { OrganizationList } from "@clerk/nextjs"
import Link from "next/link"
import { Building2, ArrowRight, PlusCircle } from "lucide-react"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { useSetPageMetadata } from "@/contexts/page-metadata"

export default function OrganizationLandingPage() {
  const { organization, isLoaded } = useOrganization()

  useSetPageMetadata({
    title: "Organizações",
    description: "Gerencie suas equipes e alternância de contexto de trabalho.",
    breadcrumbs: [
      { label: "Início", href: "/dashboard" },
      { label: "Organizações" },
    ],
  })

  return (
    <div className="space-y-6">
      <Card className="border border-border/40 bg-card/60 p-6">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div className="flex items-start gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary">
              <Building2 className="h-6 w-6" />
            </div>
            <div>
              <h2 className="text-xl font-semibold">
                {organization?.name ? `Você está em ${organization.name}` : "Nenhuma organização ativa"}
              </h2>
              <p className="text-sm text-muted-foreground">
                {organization
                  ? "Utilize o menu ao lado ou os atalhos abaixo para acessar as páginas da organização selecionada."
                  : "Crie ou selecione uma organização para colaborar com sua equipe."}
              </p>
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            {organization && (
              <Button asChild variant="default">
                <Link href={`/organization/${organization.id}`}>
                  Ir para o dashboard
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Link>
              </Button>
            )}
            <Button asChild variant="outline">
              <Link href="/dashboard">
                Voltar ao painel pessoal
              </Link>
            </Button>
          </div>
        </div>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="border border-border/40 bg-card/60 p-6">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h3 className="text-lg font-semibold">Suas organizações</h3>
              <p className="text-sm text-muted-foreground">
                Use a lista abaixo para criar, gerenciar ou entrar em equipes existentes.
              </p>
            </div>
            <PlusCircle className="h-5 w-5 text-muted-foreground" />
          </div>
          <div className="mt-4 rounded-lg border border-dashed border-border/60 p-4">
            {isLoaded ? (
              <OrganizationList
                afterCreateOrganizationUrl="/organization/:id"
                afterSelectOrganizationUrl="/organization/:id"
                hidePersonal={false}
                appearance={{
                  elements: {
                    organizationList: "gap-4",
                    organizationListItem: "rounded-lg border border-border/40 bg-background/80 p-4",
                  },
                }}
              />
            ) : (
              <p className="text-sm text-muted-foreground">Carregando organizações…</p>
            )}
          </div>
        </Card>

        <Card className="border border-border/40 bg-card/60 p-6">
          <h3 className="text-lg font-semibold">Como funciona</h3>
          <div className="mt-4 space-y-3 text-sm text-muted-foreground">
            <p>
              • Selecione uma organização ativa com o seletor no topo ou com a lista ao lado para que os créditos e projetos sejam compartilhados com sua equipe.
            </p>
            <p>
              • Cada organização possui permissões específicas. Os administradores podem convidar membros, ajustar créditos e definir limites.
            </p>
            <p>
              • O contexto pessoal continua disponível para projetos individuais. Volte a ele a qualquer momento pelo seletor de organização.
            </p>
          </div>
        </Card>
      </div>
    </div>
  )
}
