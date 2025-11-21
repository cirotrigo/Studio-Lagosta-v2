"use client"

import Link from "next/link"
import { ExternalLink } from "lucide-react"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import type { ClientProject } from "@/hooks/admin/use-client-projects"

interface ClientProjectsTableProps {
  projects: ClientProject[]
  loading?: boolean
}

const formatter = new Intl.DateTimeFormat("pt-BR", {
  dateStyle: "medium",
  timeStyle: "short",
})

const STATUS_LABELS: Record<ClientProject["status"], string> = {
  ACTIVE: "Ativo",
  INACTIVE: "Inativo",
  ARCHIVED: "Arquivado",
}

export function ClientProjectsTable({ projects, loading }: ClientProjectsTableProps) {
  if (loading) {
    return (
      <Card className="flex min-h-[300px] items-center justify-center border-border/60">
        <div className="h-10 w-10 animate-spin rounded-full border-b-2 border-primary" />
      </Card>
    )
  }

  if (projects.length === 0) {
    return (
      <Card className="flex min-h-[200px] flex-col items-center justify-center border-border/60 text-muted-foreground">
        <p>Nenhum projeto de cliente encontrado.</p>
      </Card>
    )
  }

  return (
    <Card className="border-border/60">
      <Table>
        <TableHeader>
          <TableRow className="border-border/60">
            <TableHead>Projeto</TableHead>
            <TableHead>Cliente</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Atualizado</TableHead>
            <TableHead className="text-right">Ações</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {projects.map((project) => (
            <TableRow key={project.id} className="border-border/60">
              <TableCell>
                <div className="space-y-1">
                  <p className="font-medium">{project.name}</p>
                  <p className="text-xs text-muted-foreground">
                    #{project.id} • {project.clientInvite?.email}
                  </p>
                </div>
              </TableCell>
              <TableCell>
                <div className="space-y-1">
                  <p className="font-medium">
                    {project.clientInvite?.clientName || project.clientInvite?.user?.name || "-"}
                  </p>
                  {project.clientInvite?.user?.email && (
                    <p className="text-xs text-muted-foreground">
                      {project.clientInvite.user.email}
                    </p>
                  )}
                </div>
              </TableCell>
              <TableCell>
                <Badge variant="outline">{STATUS_LABELS[project.status]}</Badge>
              </TableCell>
              <TableCell className="text-sm text-muted-foreground">
                {formatter.format(new Date(project.updatedAt))}
              </TableCell>
              <TableCell className="text-right">
                <Button variant="outline" size="sm" asChild>
                  <Link href={`/admin/client-projects/${project.id}`}>
                    <ExternalLink className="mr-2 h-4 w-4" />
                    Gerenciar
                  </Link>
                </Button>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </Card>
  )
}
