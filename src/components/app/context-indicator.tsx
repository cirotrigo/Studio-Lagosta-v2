"use client"

import { Building2, User } from "lucide-react"
import { useOrganization, useUser } from "@clerk/nextjs"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import { cn } from "@/lib/utils"

export function ContextIndicator() {
  const { organization, membership, isLoaded: isOrganizationLoaded } = useOrganization()
  const { user, isLoaded: isUserLoaded } = useUser()

  if (!isOrganizationLoaded || !isUserLoaded) {
    return <Skeleton className="mb-6 h-16 w-full" />
  }

  if (!organization) {
    if (!user) return null

    return (
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4 rounded-xl border border-border/40 bg-primary/5 px-5 py-4">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 text-primary">
            <User className="h-5 w-5" />
          </div>
          <div>
            <p className="text-sm font-semibold text-foreground">Conta pessoal ativa</p>
            <p className="text-xs text-muted-foreground">
              Usando créditos e recursos do plano pessoal de {user.fullName ?? "você"}
            </p>
          </div>
        </div>
        <Badge className="bg-primary/10 text-primary hover:bg-primary/20">Pessoal</Badge>
      </div>
    )
  }

  const roleLabel = membership?.role === "org:admin" ? "Administrador" : "Membro"

  return (
    <div className="mb-6 flex flex-wrap items-center justify-between gap-4 rounded-xl border border-primary/40 bg-primary/10 px-5 py-4">
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary text-primary-foreground">
          {organization.imageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={organization.imageUrl}
              alt={organization.name ?? "Organização"}
              className="h-10 w-10 rounded-full object-cover"
            />
          ) : (
            <Building2 className="h-5 w-5" />
          )}
        </div>
        <div>
          <p className="text-sm font-semibold text-foreground">
            {organization.name ?? "Organização ativa"}
          </p>
          <p className="text-xs text-muted-foreground">
            Usando créditos compartilhados da organização — acesso como {roleLabel}
          </p>
        </div>
      </div>
      <Badge className={cn("bg-primary text-primary-foreground hover:bg-primary/90")}>Organização</Badge>
    </div>
  )
}
