"use client"

import Link from "next/link"
import { useMemo, useState } from "react"
import { ClipboardList } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Input } from "@/components/ui/input"
import { Card } from "@/components/ui/card"
import { ClientProjectsTable } from "./_components/client-projects-table"
import { ProjectStatsCards } from "./_components/project-stats-cards"
import { useClientProjects } from "@/hooks/admin/use-client-projects"
import type { ClientProject } from "@/hooks/admin/use-client-projects"

const STATUS_OPTIONS: ClientProject["status"][] = ["ACTIVE", "INACTIVE", "ARCHIVED"]

export default function ClientProjectsPage() {
  const [statusFilter, setStatusFilter] = useState<ClientProject["status"] | undefined>(undefined)
  const [search, setSearch] = useState("")

  const filters = useMemo(
    () => ({
      status: statusFilter,
      clientEmail: search ? search.trim() : undefined,
    }),
    [statusFilter, search]
  )

  const projectsQuery = useClientProjects(filters)
  const projects = projectsQuery.data ?? []

  const stats = useMemo(() => {
    return {
      total: projects.length,
      active: projects.filter((project) => project.status === "ACTIVE").length,
      inactive: projects.filter((project) => project.status === "INACTIVE").length,
      archived: projects.filter((project) => project.status === "ARCHIVED").length,
    }
  }, [projects])

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold">Projetos de Clientes</h1>
          <p className="text-muted-foreground">
            Configure e acompanhe os projetos criados automaticamente através dos convites.
          </p>
        </div>
        <Button variant="outline" size="sm" asChild>
          <Link href="/admin/clients">
            <ClipboardList className="mr-2 h-4 w-4" />
            Gerenciar convites
          </Link>
        </Button>
      </div>

      <ProjectStatsCards stats={stats} />

      <Card className="border border-border/60 p-4">
        <div className="flex flex-wrap items-center gap-3">
          <Select
            value={statusFilter ?? "all"}
            onValueChange={(value) =>
              setStatusFilter(value === "all" ? undefined : (value as ClientProject["status"]))
            }
          >
            <SelectTrigger className="w-48">
              <SelectValue placeholder="Status do projeto" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos os status</SelectItem>
              {STATUS_OPTIONS.map((status) => (
                <SelectItem key={status} value={status}>
                  {status === "ACTIVE"
                    ? "Ativos"
                    : status === "INACTIVE"
                      ? "Inativos"
                      : "Arquivados"}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <div className="flex-1 min-w-[220px]">
            <Input
              placeholder="Buscar por email do cliente"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          </div>
        </div>
      </Card>

      <ClientProjectsTable projects={projects} loading={projectsQuery.isLoading} />
    </div>
  )
}
