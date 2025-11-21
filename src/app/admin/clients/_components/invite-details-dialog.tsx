"use client"

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Badge } from "@/components/ui/badge"
import type { ClientInvite } from "@/hooks/admin/use-client-invites"
import { InviteStatusBadge } from "./invite-status-badge"

interface InviteDetailsDialogProps {
  open: boolean
  invite: ClientInvite | null
  onOpenChange: (open: boolean) => void
}

const formatter = new Intl.DateTimeFormat("pt-BR", {
  dateStyle: "medium",
  timeStyle: "short",
})

function InfoRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 border-b border-border/60 py-2 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium text-right">{value || "-"}</span>
    </div>
  )
}

export function InviteDetailsDialog({ open, invite, onOpenChange }: InviteDetailsDialogProps) {
  if (!invite) {
    return null
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[80vh] max-w-3xl overflow-y-auto border-border/60">
        <DialogHeader>
          <DialogTitle>Detalhes do convite</DialogTitle>
          <DialogDescription>{invite.email}</DialogDescription>
        </DialogHeader>

        <div className="space-y-6">
          <div className="rounded-xl border border-border/60 p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs uppercase text-muted-foreground">Status</p>
                <InviteStatusBadge status={invite.status} />
              </div>
              <Badge variant="secondary">ID: {invite.id}</Badge>
            </div>
            <div className="mt-4 grid gap-2 sm:grid-cols-2">
              <InfoRow
                label="Criado em"
                value={formatter.format(new Date(invite.createdAt))}
              />
              {invite.acceptedAt && (
                <InfoRow
                  label="Aceito em"
                  value={formatter.format(new Date(invite.acceptedAt))}
                />
              )}
              {invite.completedAt && (
                <InfoRow
                  label="Projeto criado em"
                  value={formatter.format(new Date(invite.completedAt))}
                />
              )}
              {invite.cancelledAt && (
                <InfoRow
                  label="Cancelado em"
                  value={formatter.format(new Date(invite.cancelledAt))}
                />
              )}
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="rounded-xl border border-border/60 p-4">
              <p className="text-xs uppercase text-muted-foreground">Cliente</p>
              <div className="mt-3 space-y-2 text-sm">
                <InfoRow label="Nome" value={invite.clientName || "-"} />
                <InfoRow label="Usuário" value={invite.user?.name || "-"} />
                <InfoRow label="Email" value={invite.email} />
              </div>
            </div>
            <div className="rounded-xl border border-border/60 p-4">
              <p className="text-xs uppercase text-muted-foreground">Projeto</p>
              <div className="mt-3 space-y-2 text-sm">
                <InfoRow label="Nome" value={invite.projectName} />
                <InfoRow label="Descrição" value={invite.projectDescription || "-"} />
                <InfoRow
                  label="Projeto criado"
                  value={invite.project ? `#${invite.project.id}` : "-"}
                />
              </div>
            </div>
          </div>

          <div className="rounded-xl border border-border/60 p-4">
            <p className="text-xs uppercase text-muted-foreground">Google Drive</p>
            <div className="mt-3 grid gap-3 text-sm sm:grid-cols-2">
              <InfoRow label="Backup" value={invite.googleDriveFolderName || invite.googleDriveFolderId || "-"} />
              <InfoRow label="Imagens" value={invite.googleDriveImagesFolderName || invite.googleDriveImagesFolderId || "-"} />
              <InfoRow label="Vídeos" value={invite.googleDriveVideosFolderName || invite.googleDriveVideosFolderId || "-"} />
            </div>
          </div>

          <div className="rounded-xl border border-border/60 p-4">
            <p className="text-xs uppercase text-muted-foreground">Instagram & Webhooks</p>
            <div className="mt-3 grid gap-3 text-sm sm:grid-cols-2">
              <InfoRow label="Conta" value={invite.instagramAccountId || "-"} />
              <InfoRow label="Usuário" value={invite.instagramUsername || "-"} />
            </div>
            <InfoRow label="Zapier" value={invite.zapierWebhookUrl || "-"} />
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
