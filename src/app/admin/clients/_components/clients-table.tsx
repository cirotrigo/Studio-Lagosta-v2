"use client"

import { Card } from "@/components/ui/card"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Button } from "@/components/ui/button"
import { Mail, MoreHorizontal, Repeat, X, Eye, Pencil } from "lucide-react"
import { InviteStatusBadge } from "./invite-status-badge"
import { CopyInviteLinkButton } from "./copy-invite-link-button"
import type { ClientInvite } from "@/hooks/admin/use-client-invites"

interface ClientsTableProps {
  invites: ClientInvite[]
  loading?: boolean
  onEdit: (invite: ClientInvite) => void
  onViewDetails: (invite: ClientInvite) => void
  onResend: (invite: ClientInvite) => void
  onCancel: (invite: ClientInvite) => void
}

const formatter = new Intl.DateTimeFormat("pt-BR", {
  dateStyle: "medium",
  timeStyle: "short",
})

export function ClientsTable({
  invites,
  loading,
  onEdit,
  onViewDetails,
  onResend,
  onCancel,
}: ClientsTableProps) {
  if (loading) {
    return (
      <Card className="flex min-h-[300px] items-center justify-center border-border/60">
        <div className="h-10 w-10 animate-spin rounded-full border-b-2 border-primary" />
      </Card>
    )
  }

  if (invites.length === 0) {
    return (
      <Card className="flex min-h-[200px] flex-col items-center justify-center gap-2 border-border/60 text-muted-foreground">
        <Mail className="h-6 w-6" />
        <p>Nenhum convite encontrado</p>
      </Card>
    )
  }

  return (
    <Card className="border-border/60">
      <Table>
        <TableHeader>
          <TableRow className="border-border/60">
            <TableHead>Email</TableHead>
            <TableHead>Cliente</TableHead>
            <TableHead>Projeto</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Criado em</TableHead>
            <TableHead>Link</TableHead>
            <TableHead className="text-right">Ações</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {invites.map((invite) => (
            <TableRow key={invite.id} className="border-border/60">
              <TableCell className="font-medium">{invite.email}</TableCell>
              <TableCell>
                <div className="space-y-0.5">
                  <p className="font-medium">{invite.clientName || "-"}</p>
                  {invite.user?.name && (
                    <p className="text-xs text-muted-foreground">
                      Usuário: {invite.user.name}
                    </p>
                  )}
                </div>
              </TableCell>
              <TableCell>
                <div className="space-y-0.5">
                  <p className="font-medium">{invite.projectName}</p>
                  {invite.project && (
                    <p className="text-xs text-muted-foreground">
                      ID #{invite.project.id}
                    </p>
                  )}
                </div>
              </TableCell>
              <TableCell>
                <InviteStatusBadge status={invite.status} />
              </TableCell>
              <TableCell className="text-sm text-muted-foreground">
                {formatter.format(new Date(invite.createdAt))}
              </TableCell>
              <TableCell>
                <CopyInviteLinkButton inviteUrl={invite.inviteUrl} />
              </TableCell>
              <TableCell className="text-right">
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon">
                      <MoreHorizontal className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    {invite.status === "PENDING" && (
                      <>
                        <DropdownMenuItem onClick={() => onEdit(invite)}>
                          <Pencil className="mr-2 h-4 w-4" />
                          Editar
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => onResend(invite)}>
                          <Repeat className="mr-2 h-4 w-4" />
                          Reenviar
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          className="text-destructive focus:text-destructive"
                          onClick={() => onCancel(invite)}
                        >
                          <X className="mr-2 h-4 w-4" />
                          Cancelar
                        </DropdownMenuItem>
                      </>
                    )}
                    {invite.status !== "PENDING" && (
                      <DropdownMenuItem onClick={() => onResend(invite)}>
                        <Repeat className="mr-2 h-4 w-4" />
                        Reenviar
                      </DropdownMenuItem>
                    )}
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onClick={() => onViewDetails(invite)}>
                      <Eye className="mr-2 h-4 w-4" />
                      Ver detalhes
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </Card>
  )
}
