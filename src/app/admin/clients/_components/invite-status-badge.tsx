"use client"

import { Badge } from "@/components/ui/badge"
import type { ClientInviteStatus } from "@/lib/validations/client-invite"

const STATUS_CONFIG: Record<
  ClientInviteStatus,
  { label: string; className: string }
> = {
  PENDING: { label: "Pendente", className: "bg-amber-100 text-amber-900 border-transparent" },
  ACCEPTED: { label: "Aceito", className: "bg-blue-100 text-blue-900 border-transparent" },
  COMPLETED: { label: "Completo", className: "bg-emerald-100 text-emerald-900 border-transparent" },
  CANCELLED: { label: "Cancelado", className: "bg-gray-100 text-gray-900 border-transparent" },
  EXPIRED: { label: "Expirado", className: "bg-red-100 text-red-900 border-transparent" },
}

export function InviteStatusBadge({ status }: { status: ClientInviteStatus }) {
  const config = STATUS_CONFIG[status]
  return (
    <Badge variant="outline" className={config.className}>
      {config.label}
    </Badge>
  )
}
