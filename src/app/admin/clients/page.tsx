"use client"

import { useMemo, useState } from "react"
import { Filter, UserPlus } from "lucide-react"
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
import { ClientsTable } from "./_components/clients-table"
import { ClientInviteDialog } from "./_components/client-invite-dialog"
import { EditInviteDialog } from "./_components/edit-invite-dialog"
import { InviteDetailsDialog } from "./_components/invite-details-dialog"
import { ClientStatsCards } from "./_components/client-stats-cards"
import {
  useCancelClientInvite,
  useClientInvites,
  useResendClientInvite,
  type ClientInvite,
} from "@/hooks/admin/use-client-invites"
import type { ClientInviteStatus } from "@/lib/validations/client-invite"

const STATUS_OPTIONS: Array<{ label: string; value?: ClientInviteStatus }> = [
  { label: "Todos", value: undefined },
  { label: "Pendentes", value: "PENDING" },
  { label: "Aceitos", value: "ACCEPTED" },
  { label: "Completos", value: "COMPLETED" },
  { label: "Cancelados", value: "CANCELLED" },
  { label: "Expirados", value: "EXPIRED" },
]

export default function ClientsPage() {
  const [createOpen, setCreateOpen] = useState(false)
  const [editOpen, setEditOpen] = useState(false)
  const [detailsOpen, setDetailsOpen] = useState(false)
  const [selectedInvite, setSelectedInvite] = useState<ClientInvite | null>(null)
  const [statusFilter, setStatusFilter] = useState<ClientInviteStatus | undefined>(undefined)
  const [search, setSearch] = useState("")

  const filters = useMemo(
    () => ({
      status: statusFilter,
      email: search ? search.trim() : undefined,
    }),
    [statusFilter, search]
  )

  const invitesQuery = useClientInvites(filters)
  const resendInvite = useResendClientInvite()
  const cancelInvite = useCancelClientInvite()

  const stats = useMemo(() => {
    const data = invitesQuery.data ?? []
    return {
      total: data.length,
      pending: data.filter((invite) => invite.status === "PENDING").length,
      accepted: data.filter((invite) => invite.status === "ACCEPTED").length,
      completed: data.filter((invite) => invite.status === "COMPLETED").length,
      cancelled: data.filter((invite) => invite.status === "CANCELLED").length,
      expired: data.filter((invite) => invite.status === "EXPIRED").length,
    }
  }, [invitesQuery.data])

  const handleResend = (invite: ClientInvite) => {
    if (invite.status !== "PENDING" && !window.confirm("Deseja reenviar este convite?")) {
      return
    }
    resendInvite.mutate(invite.id)
  }

  const handleCancel = (invite: ClientInvite) => {
    if (!window.confirm("Tem certeza que deseja cancelar este convite?")) {
      return
    }
    cancelInvite.mutate(invite.id)
  }

  const invites = invitesQuery.data ?? []

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold">Clientes</h1>
          <p className="text-muted-foreground">
            Envie convites personalizados e acompanhe o status de cada cliente.
          </p>
        </div>
        <Button onClick={() => setCreateOpen(true)}>
          <UserPlus className="mr-2 h-4 w-4" />
          Novo convite
        </Button>
      </div>

      <ClientStatsCards stats={stats} />

      <Card className="border border-border/60 p-4">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
            <Filter className="h-4 w-4" />
            Filtros
          </div>
          <Select
            value={statusFilter ?? "all"}
            onValueChange={(value) =>
              setStatusFilter(value === "all" ? undefined : (value as ClientInviteStatus))
            }
          >
            <SelectTrigger className="w-48">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos os status</SelectItem>
              {STATUS_OPTIONS.map((option) => (
                <SelectItem
                  key={option.value ?? "all-option"}
                  value={option.value ?? "all"}
                >
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <div className="flex-1 min-w-[220px]">
            <Input
              placeholder="Buscar por email"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          </div>
        </div>
      </Card>

      <ClientsTable
        invites={invites}
        loading={invitesQuery.isLoading}
        onEdit={(invite) => {
          setSelectedInvite(invite)
          setEditOpen(true)
        }}
        onViewDetails={(invite) => {
          setSelectedInvite(invite)
          setDetailsOpen(true)
        }}
        onResend={handleResend}
        onCancel={handleCancel}
      />

      <ClientInviteDialog open={createOpen} onOpenChange={setCreateOpen} />
      <EditInviteDialog
        open={editOpen}
        onOpenChange={(open) => {
          setEditOpen(open)
          if (!open) setSelectedInvite(null)
        }}
        invite={selectedInvite}
      />
      <InviteDetailsDialog
        open={detailsOpen}
        onOpenChange={(open) => {
          setDetailsOpen(open)
          if (!open) setSelectedInvite(null)
        }}
        invite={selectedInvite}
      />
    </div>
  )
}
