import { Button } from "@/components/ui/button";
import { Download, ExternalLink, RefreshCw, Plus } from "lucide-react";

interface PlanHeaderActionsProps {
  onSyncClerk: () => void;
  onAddCustomPlan: () => void;
  onRefreshPricing: () => void;
  isSyncing: boolean;
  isRefreshingPricing: boolean;
}

export function PlanHeaderActions({
  onSyncClerk,
  onAddCustomPlan,
  onRefreshPricing,
  isSyncing,
  isRefreshingPricing,
}: PlanHeaderActionsProps) {
  return (
    <div className="flex items-center gap-3 pt-4">
      <Button
        variant="outline"
        size="sm"
        asChild
      >
        <a href="https://dashboard.clerk.com" target="_blank" rel="noreferrer" className="flex items-center gap-2">
          <ExternalLink className="h-4 w-4" />
          Clerk Dashboard
        </a>
      </Button>
      <Button
        variant="default"
        size="sm"
        disabled={isSyncing}
        onClick={onSyncClerk}
      >
        {isSyncing ? (
          <>
            <RefreshCw className="h-4 w-4 animate-spin" />
            Sincronizando...
          </>
        ) : (
          <>
            <Download className="h-4 w-4" />
            Sincronizar com Clerk
          </>
        )}
      </Button>
      <Button
        variant="secondary"
        size="sm"
        onClick={onAddCustomPlan}
      >
        <Plus className="h-4 w-4 mr-2" />
        Adicionar plano manual
      </Button>
      <Button
        variant="outline"
        size="sm"
        disabled={isRefreshingPricing}
        onClick={onRefreshPricing}
      >
        {isRefreshingPricing ? (
          <>
            <RefreshCw className="h-4 w-4 animate-spin" />
            Atualizando preços...
          </>
        ) : (
          <>
            <RefreshCw className="h-4 w-4" />
            Atualizar preços do Clerk
          </>
        )}
      </Button>
    </div>
  );
}
