"use client";

import React from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { DataTable } from "@/components/ui/data-table";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { MoreVertical, Edit, Trash2, Eye, EyeOff } from "lucide-react";

type PlanFeatureForm = {
  id: string;
  name: string;
  description: string;
  included: boolean;
}

type BillingPlan = {
  planId?: string;
  clerkId?: string | null;
  billingSource?: 'clerk' | 'manual';
  name: string;
  credits: number;
  active?: boolean;
  clerkName?: string | null;
  currency?: string | null;
  priceMonthlyCents?: number | null;
  priceYearlyCents?: number | null;
  description?: string | null;
  features?: PlanFeatureForm[];
  badge?: string | null;
  highlight?: boolean;
  ctaType?: 'checkout' | 'contact';
  ctaLabel?: string | null;
  ctaUrl?: string | null;
  isNew?: boolean;
}

interface PlansTableProps {
  plans: Record<string, BillingPlan>;
  loading?: boolean;
  onEdit: (planId: string, plan: BillingPlan) => void;
  onDelete: (planId: string) => void;
  onToggleActive: (planId: string) => void;
}

export function PlansTable({ 
  plans, 
  loading = false, 
  onEdit, 
  onDelete, 
  onToggleActive 
}: PlansTableProps) {
  const [deleteDialogOpen, setDeleteDialogOpen] = React.useState(false);
  const [planToDelete, setPlanToDelete] = React.useState<{ id: string; name: string } | null>(null);

  const plansArray = Object.entries(plans)
    .map(([id, plan]) => ({
      id,
      ...plan,
    }))
    .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));

  const formatPrice = (cents: number | null | undefined, currency?: string | null) => {
    if (cents == null) return '—';
    const currencyCode = currency?.toUpperCase() || 'USD';
    try {
      return new Intl.NumberFormat(undefined, { 
        style: 'currency', 
        currency: currencyCode 
      }).format(cents / 100);
    } catch {
      return `${currencyCode} ${(cents / 100).toFixed(2)}`;
    }
  };

  const handleDeleteClick = (planId: string, planName: string) => {
    setPlanToDelete({ id: planId, name: planName });
    setDeleteDialogOpen(true);
  };

  const handleDeleteConfirm = () => {
    if (planToDelete) {
      onDelete(planToDelete.id);
      setDeleteDialogOpen(false);
      setPlanToDelete(null);
    }
  };

  const columns = [
    {
      key: 'billingSource',
      header: 'Origem',
      render: (plan: BillingPlan & { id: string }) => {
        const isClerkPlan = (plan.billingSource ?? 'clerk') === 'clerk';
        return (
          <div className="flex flex-col gap-1">
            <Badge variant={isClerkPlan ? 'default' : 'secondary'}>
              {isClerkPlan ? 'Clerk' : 'Manual'}
            </Badge>
            {isClerkPlan && plan.clerkId && (
              <code className="text-xs font-mono bg-muted px-1 py-0.5 rounded">
                {plan.clerkId.length > 8 ? `${plan.clerkId.slice(0, 8)}...` : plan.clerkId}
              </code>
            )}
          </div>
        );
      },
      className: 'w-[120px]',
    },
    {
      key: 'name',
      header: 'Nome',
      render: (plan: BillingPlan & { id: string }) => (
        <div className="flex flex-col gap-1">
          <div className="font-medium">{plan.name}</div>
          {plan.badge && (
            <Badge variant="outline" className="w-fit text-xs">
              {plan.badge}
            </Badge>
          )}
        </div>
      ),
    },
    {
      key: 'credits',
      header: 'Créditos/Mês',
      render: (plan: BillingPlan & { id: string }) => (
        <div className="font-mono text-sm">
          {plan.credits.toLocaleString()}
        </div>
      ),
      className: 'text-right w-[120px]',
    },
    {
      key: 'pricing',
      header: 'Preços',
      render: (plan: BillingPlan & { id: string }) => (
        <div className="flex flex-col gap-1 text-sm">
          <div>
            <span className="text-muted-foreground">Mensal: </span>
            {formatPrice(plan.priceMonthlyCents, plan.currency)}
          </div>
          <div>
            <span className="text-muted-foreground">Anual: </span>
            {formatPrice(plan.priceYearlyCents, plan.currency)}
          </div>
        </div>
      ),
      className: 'w-[140px]',
    },
    {
      key: 'status',
      header: 'Status',
      render: (plan: BillingPlan & { id: string }) => (
        <div className="flex flex-col gap-1">
          <Badge variant={plan.active ?? true ? 'default' : 'secondary'}>
            {plan.active ?? true ? 'Ativo' : 'Inativo'}
          </Badge>
          {plan.highlight && (
            <Badge variant="outline" className="w-fit text-xs">
              Destaque
            </Badge>
          )}
        </div>
      ),
      className: 'w-[100px]',
    },
    {
      key: 'actions',
      header: '',
      render: (plan: BillingPlan & { id: string }) => (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="sm">
              <MoreVertical className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => onEdit(plan.id, plan)}>
              <Edit className="h-4 w-4 mr-2" />
              Editar
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => onToggleActive(plan.id)}>
              {plan.active ?? true ? (
                <>
                  <EyeOff className="h-4 w-4 mr-2" />
                  Desativar
                </>
              ) : (
                <>
                  <Eye className="h-4 w-4 mr-2" />
                  Ativar
                </>
              )}
            </DropdownMenuItem>
            <DropdownMenuItem 
              onClick={() => handleDeleteClick(plan.id, plan.name)}
              className="text-destructive focus:text-destructive"
            >
              <Trash2 className="h-4 w-4 mr-2" />
              Excluir
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      ),
      className: 'w-[60px]',
    },
  ];

  return (
    <>
      <DataTable
        data={plansArray}
        columns={columns}
        loading={loading}
        searchable={true}
        searchKeys={['name', 'clerkId', 'description']}
        searchPlaceholder="Buscar planos..."
        emptyMessage="Nenhum plano encontrado"
        showCount={true}
        countLabel="planos"
      />

      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir plano?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta ação não pode ser desfeita. O plano "{planToDelete?.name}" será removido permanentemente.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteConfirm}
              className="bg-destructive hover:bg-destructive/90"
            >
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
