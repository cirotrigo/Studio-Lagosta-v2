"use client"

import { useState } from "react"
import Link from "next/link"
import { useOrganization } from "@clerk/nextjs"
import { History, Plus } from "lucide-react"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Skeleton } from "@/components/ui/skeleton"
import { useSetPageMetadata } from "@/contexts/page-metadata"
import {
  useAdjustOrganizationCredits,
  useOrganizationCredits,
  useOrganizationCreditsUsage,
} from "@/hooks/use-organizations"
import { useToast } from "@/hooks/use-toast"

export default function OrganizationCreditsPage({ params }: { params: { orgId: string } }) {
  const { organization, membership, isLoaded } = useOrganization()
  const isActiveOrganization = organization?.id === params.orgId
  const isAdmin = membership?.role === "org:admin"
  const { toast } = useToast()
  const [amount, setAmount] = useState("100")
  const [reason, setReason] = useState("")
  const [dialogOpen, setDialogOpen] = useState(false)

  const creditsQuery = useOrganizationCredits(isActiveOrganization ? organization.id : null)
  const usageQuery = useOrganizationCreditsUsage(isActiveOrganization ? organization.id : null, {
    limit: 20,
  })

  const adjustMutation = useAdjustOrganizationCredits(isActiveOrganization ? organization.id : null)

  useSetPageMetadata({
    title: "Créditos da organização",
    description: "Acompanhe o saldo disponível, histórico de consumo e recargas de créditos compartilhados.",
    breadcrumbs: [
      { label: "Início", href: "/dashboard" },
      { label: "Organizações", href: "/organization" },
      { label: organization?.name ?? "Organização", href: `/organization/${params.orgId}` },
      { label: "Créditos" },
    ],
  })

  const handleAdjustCredits = async () => {
    const numericAmount = Number(amount)
    if (!Number.isFinite(numericAmount) || numericAmount <= 0) {
      toast({ variant: "destructive", title: "Valor inválido", description: "Informe um número inteiro maior que zero." })
      return
    }

    adjustMutation.mutate(
      { amount: numericAmount, reason: reason.trim() || undefined },
      {
        onSuccess: () => {
          toast({ title: "Créditos adicionados", description: `${numericAmount} créditos foram somados ao saldo da organização.` })
          setDialogOpen(false)
          setAmount("100")
          setReason("")
        },
        onError: () => {
          toast({ variant: "destructive", title: "Falha ao salvar", description: "Não foi possível ajustar os créditos. Tente novamente." })
        },
      },
    )
  }

  if (!isLoaded) {
    return <Skeleton className="h-60 w-full" />
  }

  if (!organization) {
    return (
      <Card className="border border-border/40 bg-card/60 p-8 text-sm text-muted-foreground">
        Selecione uma organização ativa para visualizar o saldo compartilhado.
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

  const credits = creditsQuery.data
  const usage = usageQuery.data?.data ?? []

  return (
    <div className="space-y-6">
      <Card className="border border-border/40 bg-card/60 p-6">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <h2 className="text-xl font-semibold">Saldo disponível</h2>
            <p className="text-sm text-muted-foreground">
              {credits
                ? `A organização recebe ${credits.limits.creditsPerMonth.toLocaleString()} créditos por ciclo.`
                : "Carregando informações de créditos..."}
            </p>
            <div className="mt-4 flex flex-wrap gap-4 text-sm">
              <SummaryPill label="Créditos atuais" value={credits ? credits.credits.current.toLocaleString() : "…"} />
              <SummaryPill label="Renovação mensal" value={credits ? credits.limits.creditsPerMonth.toLocaleString() : "…"} />
              <SummaryPill label="Última recarga" value={credits?.credits.lastRefill ? new Date(credits.credits.lastRefill).toLocaleDateString() : "—"} />
            </div>
          </div>
          {isAdmin && (
            <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
              <DialogTrigger asChild>
                <Button>
                  <Plus className="mr-2 h-4 w-4" />Adicionar créditos
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Adicionar créditos à organização</DialogTitle>
                  <DialogDescription>
                    Registre créditos extras comprados ou ajustes manuais. O valor será somado ao saldo atual imediatamente.
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="credit-amount">Quantidade de créditos</Label>
                    <Input
                      id="credit-amount"
                      type="number"
                      min={1}
                      value={amount}
                      onChange={(event) => setAmount(event.target.value)}
                      placeholder="Ex.: 250"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="credit-reason">Motivo (opcional)</Label>
                    <Textarea
                      id="credit-reason"
                      value={reason}
                      onChange={(event) => setReason(event.target.value)}
                      placeholder="Compra de pacote adicional, ajuste manual, etc."
                      rows={3}
                    />
                  </div>
                </div>
                <DialogFooter>
                  <Button
                    onClick={handleAdjustCredits}
                    disabled={adjustMutation.isPending}
                  >
                    {adjustMutation.isPending ? "Salvando..." : "Adicionar créditos"}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          )}
        </div>
      </Card>

      <Card className="border border-border/40 bg-card/60 p-6">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-lg font-semibold">Histórico de uso</h3>
            <p className="text-sm text-muted-foreground">Operações recentes envolvendo créditos desta organização.</p>
          </div>
          <History className="h-5 w-5 text-muted-foreground" />
        </div>

        {usageQuery.isLoading ? (
          <div className="mt-6 space-y-3">
            {Array.from({ length: 5 }).map((_, index) => (
              <Skeleton key={index} className="h-12 w-full" />
            ))}
          </div>
        ) : usage.length > 0 ? (
          <div className="mt-6 overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="text-left text-muted-foreground">
                  <th className="pb-3 pr-4 font-medium">Data</th>
                  <th className="pb-3 pr-4 font-medium">Usuário</th>
                  <th className="pb-3 pr-4 font-medium">Recurso</th>
                  <th className="pb-3 pr-4 font-medium">Créditos</th>
                  <th className="pb-3 font-medium">Detalhes</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/40">
                {usage.map((entry) => (
                  <tr key={entry.id} className="align-middle">
                    <td className="py-3 pr-4">{new Date(entry.createdAt).toLocaleString()}</td>
                    <td className="py-3 pr-4 font-medium">{entry.userId}</td>
                    <td className="py-3 pr-4">{entry.feature}</td>
                    <td className="py-3 pr-4 font-semibold text-foreground">{entry.credits > 0 ? `+${entry.credits}` : entry.credits}</td>
                    <td className="py-3 text-muted-foreground">
                      {typeof entry.metadata === "object" && entry.metadata !== null
                        ? JSON.stringify(entry.metadata)
                        : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="mt-6 rounded-lg border border-dashed border-border/40 p-6 text-sm text-muted-foreground">
            Nenhum uso registrado até o momento. Assim que membros utilizarem funcionalidades pagas, elas aparecerão aqui.
          </div>
        )}

        {usageQuery.data?.nextCursor && (
          <div className="mt-4 text-xs text-muted-foreground">
            Mostrando os 20 registros mais recentes. Use a API para paginação completa.
          </div>
        )}
      </Card>

      {!isAdmin && (
        <Card className="border border-border/40 bg-card/40 p-4 text-xs text-muted-foreground">
          Somente administradores podem adicionar créditos. Entre em contato com um responsável caso precise de saldo adicional.
        </Card>
      )}

      <div className="text-xs text-muted-foreground">
        Precisa de ajuda? Consulte o <Link href="/docs/credits" className="underline">guia de créditos</Link> para entender regras de renovação e limites.
      </div>
    </div>
  )
}

function SummaryPill({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-full border border-border/40 bg-background/60 px-4 py-2 text-xs">
      <span className="font-semibold text-foreground">{value}</span>
      <span className="ml-2 text-muted-foreground">{label}</span>
    </div>
  )
}
