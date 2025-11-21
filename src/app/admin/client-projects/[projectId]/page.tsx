"use client"

import Link from "next/link"
import { useParams } from "next/navigation"
import { ArrowLeft, User } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { ProjectConfigPanel } from "../_components/project-config-panel"
import { useClientProject } from "@/hooks/admin/use-client-projects"

const formatter = new Intl.DateTimeFormat("pt-BR", {
  dateStyle: "medium",
  timeStyle: "short",
})

export default function ClientProjectDetailsPage() {
  const params = useParams()
  const projectIdParam = Array.isArray(params?.projectId)
    ? params?.projectId[0]
    : params?.projectId
  const { data, isLoading } = useClientProject(projectIdParam ?? null)

  if (isLoading) {
    return (
      <div className="flex min-h-[300px] items-center justify-center">
        <div className="h-10 w-10 animate-spin rounded-full border-b-2 border-primary" />
      </div>
    )
  }

  if (!data) {
    return (
      <div className="space-y-4">
        <Button variant="ghost" asChild>
          <Link href="/admin/client-projects">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Voltar
          </Link>
        </Button>
        <Card className="p-6 text-center text-muted-foreground">
          Projeto não encontrado.
        </Card>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <Button variant="ghost" asChild>
        <Link href="/admin/client-projects">
          <ArrowLeft className="mr-2 h-4 w-4" />
          Voltar
        </Link>
      </Button>

      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="text-xs uppercase text-muted-foreground">Projeto</p>
          <h1 className="text-3xl font-bold">{data.name}</h1>
          <p className="text-muted-foreground">
            Atualizado em {formatter.format(new Date(data.updatedAt))}
          </p>
        </div>
        <Badge variant="outline">
          Status: {data.status === "ACTIVE" ? "Ativo" : data.status === "INACTIVE" ? "Inativo" : "Arquivado"}
        </Badge>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card className="border border-border/60 p-4">
          <div className="flex items-center gap-3">
            <div className="rounded-full bg-primary/10 p-2">
              <User className="h-5 w-5 text-primary" />
            </div>
            <div>
              <p className="text-sm font-semibold text-muted-foreground">Cliente</p>
              <p className="text-lg font-medium">
                {data.clientInvite?.clientName || data.clientInvite?.user?.name || "-"}
              </p>
              <p className="text-sm text-muted-foreground">
                {data.clientInvite?.email || data.clientInvite?.user?.email || "-"}
              </p>
            </div>
          </div>
          <div className="mt-4 space-y-2 text-sm text-muted-foreground">
            <p>Convite: {data.clientInvite?.id}</p>
            <p>
              Criado em:{" "}
              {data.clientInvite?.completedAt
                ? formatter.format(new Date(data.clientInvite.completedAt))
                : "-"}
            </p>
          </div>
        </Card>
        <Card className="border border-border/60 p-4">
          <p className="text-sm font-semibold text-muted-foreground">Descrição</p>
          <p className="mt-2 text-muted-foreground">
            {data.description || "Nenhuma descrição fornecida."}
          </p>
        </Card>
      </div>

      <ProjectConfigPanel project={data} />
    </div>
  )
}
