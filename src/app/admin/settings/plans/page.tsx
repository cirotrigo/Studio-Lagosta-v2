"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { useAdminPlans, useClerkPlans, useCreatePlan, useUpdatePlan, useDeletePlan, useRefreshPlanPricing } from "@/hooks/use-admin-plans";
import type { ClerkPlan } from "@/hooks/use-admin-plans";
import { PlansTable } from "@/components/admin/plans/plans-table";
import { PlanEditDrawer } from "@/components/admin/plans/plan-edit-drawer";
import { PlanSummaryCards } from "@/components/admin/plans/plan-summary-cards";
import { PlanHeaderActions } from "@/components/admin/plans/plan-header-actions";
import { PlanEmptyState } from "@/components/admin/plans/plan-empty-state";
import { PlanLoadingSkeleton } from "@/components/admin/plans/plan-loading-skeleton";
import { PlanSyncDialog } from "@/components/admin/plans/plan-sync-dialog";
import type { BillingPlan, SyncPreview } from "@/components/admin/plans/types";
import {
  mapFeaturesFromApi,
  serializePlanForPersistence,
  findPlanKeyByClerkId,
  findPlanKeyByName,
  resolveMonthlyAmount,
  resolveYearlyAmount,
  resolveCurrency,
  createNewCustomPlan,
} from "@/components/admin/plans/utils";

export default function BillingPlansPage() {
  const { toast } = useToast()
  const [billingPlans, setBillingPlans] = useState<Record<string, BillingPlan>>({})
  const [clerkPlanDetails, setClerkPlanDetails] = useState<Record<string, ClerkPlan>>({})
  const [syncPreview, setSyncPreview] = useState<SyncPreview | null>(null)
  const [syncPreviewOpen, setSyncPreviewOpen] = useState(false)
  const [confirmingSync, setConfirmingSync] = useState(false)
  const [editDrawerOpen, setEditDrawerOpen] = useState(false)
  const [editingPlan, setEditingPlan] = useState<{ id: string; plan: BillingPlan } | null>(null)

  // Use TanStack Query hooks
  const { data: plansData, isLoading: loading } = useAdminPlans()
  const { refetch: syncClerkPlans, isFetching: importingApi } = useClerkPlans()
  const createPlan = useCreatePlan()
  const updatePlan = useUpdatePlan()
  const deletePlan = useDeletePlan()
  const refreshPricing = useRefreshPlanPricing()

  const saving = createPlan.isPending || updatePlan.isPending || deletePlan.isPending

  // Convert plans data to the format expected by the component
  useEffect(() => {
    if (plansData?.plans) {
      const nextPlans: Record<string, BillingPlan> = {}
      for (const p of plansData.plans) {
        const features = mapFeaturesFromApi(p.features ?? null)
        const billingPlan: BillingPlan = {
          planId: p.id ?? undefined,
          clerkId: p.clerkId ?? null,
          billingSource: (p.billingSource as 'clerk' | 'manual' | undefined) ?? 'clerk',
          name: p.name,
          credits: p.credits,
          active: p.active,
          clerkName: p.clerkName ?? null,
          currency: p.currency ?? null,
          priceMonthlyCents: p.priceMonthlyCents ?? null,
          priceYearlyCents: p.priceYearlyCents ?? null,
          description: p.description ?? '',
          features,
          badge: p.badge ?? null,
          highlight: p.highlight ?? false,
          ctaType: (p.ctaType as 'checkout' | 'contact' | null) ?? 'checkout',
          ctaLabel: p.ctaLabel ?? null,
          ctaUrl: p.ctaUrl ?? null,
          isNew: false,
        }
        if (billingPlan.billingSource === 'manual') {
          billingPlan.ctaType = 'contact'
        }
        const key = billingPlan.planId ?? p.clerkId ?? `plan-${p.name}`
        nextPlans[key] = billingPlan
      }
      setBillingPlans(nextPlans)
    }
  }, [plansData])

  const handleEditPlan = (planId: string, plan: BillingPlan) => {
    setEditingPlan({ id: planId, plan })
    setEditDrawerOpen(true)
  }

  const handleSavePlan = async (editedPlan: BillingPlan) => {
    if (!editingPlan) return

    try {
      const payload = serializePlanForPersistence(editedPlan)
      
      if (editedPlan.isNew) {
        // Create new plan
          await createPlan.mutateAsync({
          clerkId: editedPlan.clerkId ?? undefined,
            billingSource: payload.billingSource,
            ...payload,
          })
        // Remove from local state since it will be refetched
        setBillingPlans(prev => {
          const next = { ...prev }
          delete next[editingPlan.id]
          return next
          })
        } else {
        // Update existing plan
        const targetId = editedPlan.planId ?? editingPlan.id
            await updatePlan.mutateAsync({
              planId: targetId,
          clerkId: editedPlan.clerkId ?? undefined,
              ...payload,
            })
      }

      toast({ title: 'Plano salvo com sucesso' })
      setEditDrawerOpen(false)
      setEditingPlan(null)
    } catch (err) {
      toast({ 
        title: 'Falha ao salvar plano', 
        description: err instanceof Error ? err.message : 'Erro desconhecido', 
        variant: 'destructive' 
      })
    }
  }

  const handleDeletePlan = async (planId: string) => {
    try {
      const plan = billingPlans[planId]
      const targetId = plan?.planId ?? planId
      await deletePlan.mutateAsync(targetId)
      toast({ title: 'Plano removido com sucesso' })
    } catch (err) {
      toast({ 
        title: 'Falha ao remover plano', 
        description: err instanceof Error ? err.message : 'Erro desconhecido', 
        variant: 'destructive' 
      })
    }
  }

  const handleToggleActive = async (planId: string) => {
    try {
      const plan = billingPlans[planId]
      if (!plan) return

      const payload = serializePlanForPersistence({
        ...plan,
        active: !(plan.active ?? true)
      })
      
      const targetId = plan.planId ?? planId
      await updatePlan.mutateAsync({
        planId: targetId,
        clerkId: plan.clerkId ?? undefined,
        ...payload,
      })

      toast({ 
        title: `Plano ${payload.active ? 'ativado' : 'desativado'} com sucesso` 
      })
    } catch (err) {
      toast({ 
        title: 'Falha ao alterar status', 
        description: err instanceof Error ? err.message : 'Erro desconhecido', 
        variant: 'destructive' 
      })
    }
  }

  const addCustomPlan = () => {
    const key = `temp-${Date.now()}`
    const newPlan = createNewCustomPlan()
    
    setBillingPlans(prev => ({
      ...prev,
      [key]: newPlan,
    }))
    
    handleEditPlan(key, newPlan)
  }

  const handleSyncClerk = async () => {
    try {
      setSyncPreview(null)
      setSyncPreviewOpen(true)
      const data = await syncClerkPlans()
      const plans = (data?.data?.plans ?? []).filter((p): p is ClerkPlan => Boolean(p && p.id))
      if (!plans?.length) {
        setSyncPreview(null)
        setSyncPreviewOpen(false)
        toast({ title: 'Nenhum plano encontrado', description: 'Crie planos no Clerk Dashboard primeiro', variant: 'destructive' })
        return
      }

      setClerkPlanDetails(prev => {
        const next = { ...prev }
        for (const plan of plans) {
          next[plan.id] = plan
        }
        return next
      })

      const previewItems = plans.map((plan) => {
        const matchKey = findPlanKeyByClerkId(billingPlans, plan.id)
          ?? findPlanKeyByName(billingPlans, plan.name || '')
        return { plan, exists: Boolean(matchKey), matchKey: matchKey ?? undefined }
      })

      const incomingClerkIds = new Set(plans.map(p => p.id))
      const missing = Object.entries(billingPlans)
        .filter(([, cfg]) => (cfg.billingSource ?? 'clerk') === 'clerk' && cfg.clerkId && !incomingClerkIds.has(cfg.clerkId))
        .map(([key, cfg]) => ({ id: key, name: cfg?.name }))

      setSyncPreview({ plans, previewItems, missing })
    } catch {
      setSyncPreview(null)
      setSyncPreviewOpen(false)
      toast({ title: 'Erro ao sincronizar', description: 'Verifique sua conexão e tente novamente', variant: 'destructive' })
    }
  }

  const applySyncPlans = (plans: ClerkPlan[]) => {
    setBillingPlans((prev) => {
      const next = { ...prev }
      for (const p of plans) {
        const monthlyAmount = resolveMonthlyAmount(p)
        const yearlyAmount = resolveYearlyAmount(p)
        const currency = resolveCurrency(p) ?? 'usd'
        const matchKey = findPlanKeyByClerkId(next, p.id)
          ?? findPlanKeyByName(next, p.name || '')
          ?? p.id
        const existing = next[matchKey]
        next[matchKey] = {
          planId: existing?.planId,
          clerkId: p.id,
          billingSource: 'clerk',
          name: existing?.name || p.name || p.slug || p.id,
          credits: existing?.credits ?? 0,
          active: existing?.active ?? true,
          clerkName: p.name || existing?.clerkName || null,
          currency: currency ?? existing?.currency ?? 'usd',
          priceMonthlyCents: monthlyAmount ?? existing?.priceMonthlyCents ?? null,
          priceYearlyCents: yearlyAmount ?? existing?.priceYearlyCents ?? null,
          description: existing?.description ?? '',
          features: existing?.features ? existing.features.map((feature) => ({ ...feature })) : [],
          badge: existing?.badge ?? null,
          highlight: existing?.highlight ?? false,
          ctaType: existing?.ctaType ?? 'checkout',
          ctaLabel: existing?.ctaLabel ?? 'Assinar agora',
          ctaUrl: existing?.ctaUrl ?? '',
          isNew: existing?.isNew ?? false,
        }
      }
      return next
    })
  }

  const handleConfirmSync = async () => {
    if (!syncPreview) return
    const { plans, missing } = syncPreview
    try {
      setConfirmingSync(true)
      const operations: Promise<unknown>[] = []
      for (const item of syncPreview.previewItems) {
        const plan = item.plan
        const monthlyAmount = resolveMonthlyAmount(plan)
        const yearlyAmount = resolveYearlyAmount(plan)
        const currency = resolveCurrency(plan) ?? 'usd'
        if (item.exists && item.matchKey) {
          const existing = billingPlans[item.matchKey]
          if (existing) {
            operations.push(updatePlan.mutateAsync({
              planId: existing.planId ?? item.matchKey,
              clerkId: plan.id,
              billingSource: 'clerk',
              name: existing.name || plan.name || plan.id,
              credits: existing.credits,
              active: existing.active ?? true,
              clerkName: plan.name || existing.clerkName || null,
              currency,
              priceMonthlyCents: monthlyAmount,
              priceYearlyCents: yearlyAmount,
            }))
          }
        } else {
          operations.push(createPlan.mutateAsync({
            clerkId: plan.id,
            billingSource: 'clerk',
            name: plan.name || plan.id,
            credits: 0,
            active: true,
            clerkName: plan.name || null,
            currency,
            priceMonthlyCents: monthlyAmount,
            priceYearlyCents: yearlyAmount,
            description: null,
            features: null,
            badge: null,
            highlight: false,
            ctaType: 'checkout',
            ctaLabel: 'Assinar agora',
            ctaUrl: null,
          }))
        }
      }

      for (const miss of missing) {
        const existing = billingPlans[miss.id]
        if (existing) {
          operations.push(updatePlan.mutateAsync({
            planId: existing.planId ?? miss.id,
            clerkId: existing.clerkId ?? undefined,
            active: false,
          }))
        }
      }

      await Promise.all(operations)

      applySyncPlans(plans)
      if (missing.length) {
        setBillingPlans(prev => {
          const next = { ...prev }
          for (const { id } of missing) {
            if (next[id]) {
              next[id] = { ...next[id], active: false }
            }
          }
          return next
        })
      }

      toast({
        title: 'Sincronização concluída',
        description: `${plans.length} plano${plans.length !== 1 ? 's' : ''} sincronizado${plans.length !== 1 ? 's' : ''}`,
      })
      setSyncPreview(null)
      setSyncPreviewOpen(false)
    } catch (err) {
      toast({
        title: 'Falha ao sincronizar',
        description: err instanceof Error ? err.message : 'Erro desconhecido',
        variant: 'destructive',
      })
    } finally {
      setConfirmingSync(false)
    }
  }

  const handleCancelSync = () => {
    setSyncPreview(null)
    setSyncPreviewOpen(false)
  }

  const handleRefreshPricing = async () => {
    try {
      const res = await refreshPricing.mutateAsync()
      const d = res as { updated?: number; missingInDb?: number }
      const msg = [
        d?.updated != null ? `atualizados ${d.updated}` : null,
        d?.missingInDb != null ? `ausentes ${d.missingInDb}` : null,
      ].filter(Boolean).join(', ')
      toast({ title: 'Preços do Clerk atualizados', description: msg })
    } catch (e) {
      toast({ title: 'Falha ao atualizar preços', description: (e as Error)?.message || 'Tente novamente', variant: 'destructive' })
    }
  }

  if (loading) {
    return <PlanLoadingSkeleton />
  }

  const planCount = Object.keys(billingPlans).length
  const activePlanCount = Object.values(billingPlans).filter(plan => plan.active !== false).length

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-foreground">Planos de Assinatura</h1>
        <p className="text-muted-foreground mt-2">Sincronize e configure os créditos mensais dos planos do Clerk</p>
      </div>

      <PlanSummaryCards totalPlans={planCount} activePlans={activePlanCount} />

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Planos ativos</CardTitle>
              <CardDescription className="mt-1">
                Sincronize planos recorrentes do Clerk ou cadastre ofertas manuais para negociações sob medida.
              </CardDescription>
            </div>
          </div>
          <PlanHeaderActions
            onSyncClerk={handleSyncClerk}
            onAddCustomPlan={addCustomPlan}
            onRefreshPricing={handleRefreshPricing}
            isSyncing={importingApi}
            isRefreshingPricing={refreshPricing.isPending}
          />
        </CardHeader>
        <CardContent>
          {Object.keys(billingPlans).length === 0 ? (
            <PlanEmptyState />
          ) : (
            <PlansTable
              plans={billingPlans}
              loading={loading}
              onEdit={handleEditPlan}
              onDelete={handleDeletePlan}
              onToggleActive={handleToggleActive}
            />
          )}
        </CardContent>
      </Card>

      <PlanSyncDialog
        isOpen={syncPreviewOpen}
        onOpenChange={setSyncPreviewOpen}
        syncPreview={syncPreview}
        onConfirm={handleConfirmSync}
        onCancel={handleCancelSync}
        isConfirming={confirmingSync}
      />

      {/* Edit Drawer */}
      <PlanEditDrawer
        isOpen={editDrawerOpen}
        onClose={() => {
          setEditDrawerOpen(false)
          setEditingPlan(null)
        }}
        plan={editingPlan?.plan || null}
        clerkPlanDetails={editingPlan?.plan?.clerkId ? clerkPlanDetails[editingPlan.plan.clerkId] : undefined}
        onSave={handleSavePlan}
        isSaving={saving}
      />
    </div>
  )
}
