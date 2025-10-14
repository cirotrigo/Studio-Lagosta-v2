"use client"

import { useState, useMemo } from "react"
import Link from "next/link"
import { useOrganization } from "@clerk/nextjs"
import { Share2, ShieldAlert, Users, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Switch } from "@/components/ui/switch"
import { Skeleton } from "@/components/ui/skeleton"
import { cn } from "@/lib/utils"
import { toast } from "sonner"
import {
  useShareProjectMutation,
  useRemoveSharedProjectMutation,
  organizationKeys,
} from "@/hooks/use-organizations"
import { useQueryClient } from "@tanstack/react-query"

export type ProjectShare = {
  organizationId: string
  organizationName: string | null
  defaultCanEdit: boolean
  sharedAt: string
}

type Variant = "page" | "card"

interface ProjectShareControlsProps {
  projectId: number
  projectName?: string
  shares: ProjectShare[]
  className?: string
  variant?: Variant
}

export function ProjectShareControls({
  projectId,
  projectName,
  shares,
  className,
  variant = "page",
}: ProjectShareControlsProps) {
  const { organization, membership, isLoaded: isOrgLoaded } = useOrganization()
  const queryClient = useQueryClient()
  const shareProjectMutation = useShareProjectMutation(organization?.id ?? null)
  const removeShareMutation = useRemoveSharedProjectMutation(organization?.id ?? null)
  const [isDialogOpen, setIsDialogOpen] = useState(false)
  const [allowOrganizationEdit, setAllowOrganizationEdit] = useState(true)

  const organizationShares = shares ?? []
  const activeShare = useMemo(() => {
    if (!organization?.id) return undefined
    return organizationShares.find((share) => share.organizationId === organization.id)
  }, [organization?.id, organizationShares])

  const canManage =
    Boolean(organization) && membership?.role === "org:admin"

  const hasShares = organizationShares.length > 0
  const otherShares = useMemo(() => {
    if (!organization?.id) return organizationShares
    return organizationShares.filter((share) => share.organizationId !== organization.id)
  }, [organization?.id, organizationShares])

  const invalidateProjectQueries = () => {
    queryClient.invalidateQueries({ queryKey: ["project", projectId] })
    queryClient.invalidateQueries({ queryKey: ["projects"] })
    if (organization?.id) {
      queryClient.invalidateQueries({ queryKey: organizationKeys.projects(organization.id) })
    }
  }

  const handleShare = () => {
    if (!organization) {
      toast.error("Selecione uma organização no topo para compartilhar o projeto.")
      return
    }

    shareProjectMutation.mutate(
      {
        projectId,
        canEdit: allowOrganizationEdit,
      },
      {
        onSuccess: () => {
          invalidateProjectQueries()
          toast.success(
            `Projeto compartilhado com ${organization.name ?? "a organização"}`
          )
          setIsDialogOpen(false)
        },
        onError: () => {
          toast.error("Não foi possível compartilhar o projeto.")
        },
      },
    )
  }

  const handleRemoveShare = () => {
    if (!organization) {
      toast.error("Selecione uma organização no topo para gerenciar o compartilhamento.")
      return
    }

    removeShareMutation.mutate(projectId, {
      onSuccess: () => {
        invalidateProjectQueries()
        toast.success("Compartilhamento removido com sucesso.")
      },
      onError: () => {
        toast.error("Não foi possível remover o compartilhamento.")
      },
    })
  }

  if (!isOrgLoaded && variant === "card") {
    return <Skeleton className="h-8 w-full" />
  }

  if (variant === "card") {
    return (
      <div className={cn("flex flex-col gap-2", className)}>
        {hasShares && (
          <div className="flex flex-wrap gap-2">
            {organizationShares.map((share) => (
              <Badge key={share.organizationId} variant="outline">
                <Users className="mr-1 h-3 w-3" />
                {share.organizationName ?? share.organizationId}
                {!share.defaultCanEdit && (
                  <span className="ml-2 text-[11px] text-muted-foreground">(somente visualização)</span>
                )}
              </Badge>
            ))}
          </div>
        )}

        {activeShare ? (
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="outline" className="bg-secondary/30 text-secondary-foreground">
              <Users className="mr-1 h-3 w-3" />
              Compartilhado ({activeShare.defaultCanEdit ? "edição" : "visualização"})
            </Badge>
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                setAllowOrganizationEdit(activeShare.defaultCanEdit)
                setIsDialogOpen(true)
              }}
              disabled={!canManage}
            >
              Ajustar
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={handleRemoveShare}
              disabled={!canManage || removeShareMutation.isPending}
            >
              <X className="mr-1 h-4 w-4" />
              Remover
            </Button>
          </div>
        ) : organization ? (
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              setAllowOrganizationEdit(true)
              setIsDialogOpen(true)
            }}
            disabled={!canManage || shareProjectMutation.isPending}
          >
            <Share2 className="mr-1 h-4 w-4" />
            Compartilhar com {organization.name ?? "organização"}
          </Button>
        ) : hasShares ? null : (
          <p className="text-xs text-muted-foreground">
            Selecione uma organização para compartilhar este projeto com sua equipe.
          </p>
        )}

        {otherShares.length > 0 && (
          <p className="text-xs text-muted-foreground">
            Também compartilhado com{" "}
            {otherShares.map((share) => share.organizationName ?? share.organizationId).join(", ")}
          </p>
        )}

        <ShareDialog
          open={isDialogOpen}
          onOpenChange={setIsDialogOpen}
          allowOrganizationEdit={allowOrganizationEdit}
          setAllowOrganizationEdit={setAllowOrganizationEdit}
          canManage={canManage}
          onShare={handleShare}
          organizationName={organization?.name ?? organization?.id ?? ""}
          activeShare={activeShare}
        />
      </div>
    )
  }

  return (
    <div className={cn("flex flex-col gap-4 rounded-xl border border-border/40 bg-card/60 p-6", className)}>
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div className="space-y-2">
          <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
            <Share2 className="h-4 w-4" />
            Compartilhamento com equipes
          </div>
          <p className="text-sm text-muted-foreground">
            Controle com quais organizações este projeto está disponível. O contexto ativo no topo determina onde as ações são realizadas.
          </p>

          {hasShares ? (
            <div className="flex flex-wrap gap-2">
              {organizationShares.map((share) => (
                <Badge key={share.organizationId} variant="outline">
                  <Users className="mr-1 h-3 w-3" />
                  {share.organizationName ?? share.organizationId}
                  {!share.defaultCanEdit && (
                    <span className="ml-2 text-[11px] text-muted-foreground">(somente visualização)</span>
                  )}
                </Badge>
              ))}
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">
              Este projeto ainda não foi compartilhado com nenhuma organização.
            </p>
          )}

          {otherShares.length > 0 && (
            <p className="text-xs text-muted-foreground">
              Também disponível para:{" "}
              {otherShares.map((share) => share.organizationName ?? share.organizationId).join(", ")}
            </p>
          )}
        </div>

        <div className="flex w-full flex-col gap-2 md:w-auto md:items-end">
          {!isOrgLoaded ? (
            <Skeleton className="h-10 w-48" />
          ) : organization ? (
            activeShare ? (
              <div className="flex flex-col items-start gap-2 md:items-end">
                <div className="rounded-md border border-border/40 bg-background/60 px-3 py-2 text-xs text-muted-foreground">
                  Compartilhado com{" "}
                  <span className="font-medium text-foreground">
                    {organization.name ?? organization.id}
                  </span>{" "}
                  — {activeShare.defaultCanEdit ? "edição liberada" : "somente visualização"}
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setAllowOrganizationEdit(activeShare.defaultCanEdit)
                      setIsDialogOpen(true)
                    }}
                    disabled={!canManage}
                  >
                    Ajustar permissões
                  </Button>
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={handleRemoveShare}
                    disabled={!canManage || removeShareMutation.isPending}
                  >
                    Remover compartilhamento
                  </Button>
                </div>
                {!canManage && (
                  <p className="max-w-xs text-right text-xs text-muted-foreground">
                    Apenas administradores da organização podem alterar permissões de compartilhamento.
                  </p>
                )}
              </div>
            ) : (
              <div className="flex flex-col items-start gap-2 md:items-end">
                <Button
                  onClick={() => {
                    setAllowOrganizationEdit(true)
                    setIsDialogOpen(true)
                  }}
                  disabled={!canManage || shareProjectMutation.isPending}
                >
                  <Share2 className="mr-2 h-4 w-4" />
                  Compartilhar com {organization.name ?? "a organização"}
                </Button>
                {!canManage && (
                  <p className="max-w-xs text-right text-xs text-muted-foreground">
                    Apenas administradores da organização podem compartilhar novos projetos.
                  </p>
                )}
              </div>
            )
          ) : (
            <div className="flex items-center gap-2 rounded-md border border-dashed border-border/40 bg-background/40 px-3 py-2 text-xs text-muted-foreground">
              <ShieldAlert className="h-4 w-4 text-muted-foreground" />
              Selecione uma organização no topo para compartilhar este projeto com sua equipe.
            </div>
          )}
        </div>
      </div>

      <ShareDialog
        open={isDialogOpen}
        onOpenChange={setIsDialogOpen}
        allowOrganizationEdit={allowOrganizationEdit}
        setAllowOrganizationEdit={setAllowOrganizationEdit}
        canManage={canManage}
        onShare={handleShare}
        organizationName={organization?.name ?? organization?.id ?? ""}
        activeShare={activeShare}
      />

      {organization && (
        <div className="text-xs text-muted-foreground">
          Precisa convidar alguém? Gerencie convites em{" "}
          <Link href={`/organization/${organization.id}/members`} className="underline">
            membros da organização
          </Link>.
        </div>
      )}
    </div>
  )
}

interface ShareDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  allowOrganizationEdit: boolean
  setAllowOrganizationEdit: (value: boolean) => void
  canManage: boolean
  onShare: () => void
  organizationName: string
  activeShare?: ProjectShare
}

function ShareDialog({
  open,
  onOpenChange,
  allowOrganizationEdit,
  setAllowOrganizationEdit,
  canManage,
  onShare,
  organizationName,
  activeShare,
}: ShareDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>
        <span />
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {activeShare ? "Atualizar permissões da organização" : "Compartilhar projeto com a organização"}
          </DialogTitle>
          <DialogDescription>
            O projeto ficará disponível para {organizationName}. Defina se membros podem editar os templates ou apenas visualizar.
          </DialogDescription>
        </DialogHeader>
        <div className="rounded-lg border border-border/40 bg-card/60 px-4 py-3">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-sm font-medium text-foreground">Permitir edição pelos membros</p>
              <p className="text-xs text-muted-foreground">
                Quando ativado, todos os membros com acesso poderão editar os templates deste projeto.
              </p>
            </div>
            <Switch
              checked={allowOrganizationEdit}
              onCheckedChange={(value) => setAllowOrganizationEdit(Boolean(value))}
              disabled={!canManage}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button onClick={onShare} disabled={!canManage}>
            {activeShare ? "Atualizar compartilhamento" : "Compartilhar projeto"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
