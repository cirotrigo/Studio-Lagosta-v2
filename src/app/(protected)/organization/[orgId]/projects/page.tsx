"use client"

import Link from "next/link"
import { useOrganization } from "@clerk/nextjs"
import { FolderOpen, Share2, ExternalLink } from "lucide-react"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { useSetPageMetadata } from "@/contexts/page-metadata"
import { useOrganizationProjects } from "@/hooks/use-organizations"
import { useParams } from "next/navigation"

export default function OrganizationProjectsPage() {
  const params = useParams<{ orgId: string }>()
  const { organization, isLoaded } = useOrganization()
  const orgId = params.orgId
  const isActiveOrganization = organization?.id === orgId
  const {
    data: projectsData,
    isLoading,
  } = useOrganizationProjects(isActiveOrganization ? organization.id : null)

  useSetPageMetadata({
    title: "Projetos da organização",
    description: "Visualize e gerencie os projetos compartilhados com a sua equipe.",
    breadcrumbs: [
      { label: "Início", href: "/studio" },
      { label: "Organizações", href: "/organization" },
      { label: organization?.name ?? "Organização", href: `/organization/${orgId}` },
      { label: "Projetos" },
    ],
  })

  if (!isLoaded) {
    return <Skeleton className="h-60 w-full" />
  }

  if (!organization) {
    return (
      <Card className="border border-border/40 bg-card/60 p-8 text-sm text-muted-foreground">
        Selecione uma organização ativa para visualizar os projetos compartilhados.
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

  return (
    <div className="space-y-6">
      <Card className="border border-border/40 bg-card/60 p-6">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <h2 className="text-xl font-semibold">Projetos compartilhados</h2>
            <p className="text-sm text-muted-foreground">
              Organize os projetos disponíveis para toda a equipe. Apenas o proprietário pode compartilhar ou remover compartilhamentos.
            </p>
          </div>
          <Button variant="outline" asChild>
            <Link href="/projects">
              Acessar projetos pessoais
              <ExternalLink className="ml-2 h-4 w-4" />
            </Link>
          </Button>
        </div>
      </Card>

      {isLoading ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 4 }).map((_, index) => (
            <Card key={index} className="border border-border/40 bg-card/60 p-5">
              <Skeleton className="mb-3 h-6 w-3/4" />
              <Skeleton className="h-4 w-1/2" />
              <Skeleton className="mt-4 h-10 w-full" />
            </Card>
          ))}
        </div>
      ) : projectsData && projectsData.projects.length > 0 ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {projectsData.projects.map((project) => (
            <Card key={project.id} className="flex h-full flex-col justify-between border border-border/40 bg-card/60 p-5">
              <div className="space-y-2">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 text-primary">
                    <FolderOpen className="h-5 w-5" />
                  </div>
                  <div>
                    <h3 className="text-base font-semibold text-foreground">{project.name}</h3>
                    <p className="text-xs text-muted-foreground">Compartilhado em {new Date(project.sharedAt).toLocaleDateString()}</p>
                  </div>
                </div>
                {project.description && (
                  <p className="text-sm text-muted-foreground line-clamp-3">{project.description}</p>
                )}
              </div>
              <div className="mt-4 flex items-center justify-between text-xs text-muted-foreground">
                <span>Proprietário: {project.ownerId}</span>
                <span>{project.defaultCanEdit ? "Edição liberada" : "Somente visualização"}</span>
              </div>
              <Button className="mt-4" variant="outline" asChild>
                <Link href={`/projects/${project.id}`}>
                  Abrir projeto
                  <Share2 className="ml-2 h-4 w-4" />
                </Link>
              </Button>
            </Card>
          ))}
        </div>
      ) : (
        <Card className="border border-border/40 bg-card/50 p-8 text-sm text-muted-foreground">
          Nenhum projeto foi compartilhado com esta organização ainda. Acesse um projeto pessoal e use o botão “Compartilhar com equipe”.
        </Card>
      )}
    </div>
  )
}
