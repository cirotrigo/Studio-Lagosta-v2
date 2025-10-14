"use client";

import { useOrganization, useUser } from "@clerk/nextjs";
import { Coins } from "lucide-react";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useCredits } from "@/hooks/use-credits";
import { useOrganizationCredits } from "@/hooks/use-organizations";

interface CreditStatusProps {
  className?: string;
  showUpgradeButton?: boolean;
}

export function CreditStatus({ className, showUpgradeButton = true }: CreditStatusProps) {
  const { user, isLoaded } = useUser();
  const { organization, membership, isLoaded: isOrgLoaded } = useOrganization();
  const { credits: personalCredits, isLoading: isPersonalCreditsLoading } = useCredits();
  const isOrganizationContext = Boolean(organization);
  const {
    data: organizationCredits,
    isLoading: isOrganizationCreditsLoading,
  } = useOrganizationCredits(isOrganizationContext ? organization!.id : null);

  if ((isOrganizationContext && (!isOrgLoaded || isOrganizationCreditsLoading)) || (!isOrganizationContext && (!isLoaded || isPersonalCreditsLoading))) {
    return <Skeleton className={cn("h-8 w-24", className)} />;
  }

  if (isOrganizationContext) {
    if (!organizationCredits) {
      return null;
    }

    const totalCredits = organizationCredits.limits.creditsPerMonth || 0;
    const remaining = organizationCredits.credits.current ?? 0;
    const percentage = totalCredits > 0 ? (remaining / totalCredits) * 100 : 0;
    const isLow = percentage < 20;
    const isEmpty = remaining === 0;
    const isAdmin = membership?.role === "org:admin";

    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <div className={cn("flex items-center gap-2", className)}>
              <Coins
                className={cn(
                  "h-4 w-4",
                  isEmpty && "text-destructive",
                  isLow && !isEmpty && "text-orange-500"
                )}
              />
              <span
                className={cn(
                  "text-sm font-medium",
                  isEmpty && "text-destructive",
                  isLow && !isEmpty && "text-orange-500"
                )}
              >
                {remaining}
              </span>
              {showUpgradeButton && isAdmin && (
                <Button size="sm" variant={isEmpty ? "destructive" : "outline"} asChild>
                  <Link href={`/organization/${organization!.id}/credits`}>
                    Gerenciar créditos
                  </Link>
                </Button>
              )}
            </div>
          </TooltipTrigger>
          <TooltipContent>
            <div className="space-y-1">
              <p className="text-sm font-medium">Créditos da organização</p>
              <p className="text-xs text-muted-foreground">
                {remaining} créditos restantes de {totalCredits} alocados para este ciclo
              </p>
              <p className="text-xs text-muted-foreground">
                Renovação mensal automática: {organizationCredits.limits.creditsPerMonth} créditos
              </p>
              <p className="text-xs text-muted-foreground">
                Permissão atual: {membership?.role === "org:admin" ? "Administrador" : "Membro"}
              </p>
            </div>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }

  if (!user || !personalCredits) {
    return null;
  }

  const totalCredits = personalCredits.creditsTotal;
  const remaining = personalCredits.creditsRemaining;
  const percentage = (remaining / totalCredits) * 100;
  const isLow = percentage < 20;
  const isEmpty = remaining === 0;

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <div className={cn("flex items-center gap-2", className)}>
            <Coins
              className={cn(
                "h-4 w-4",
                isEmpty && "text-destructive",
                isLow && !isEmpty && "text-orange-500"
              )}
            />
            <span
              className={cn(
                "text-sm font-medium",
                isEmpty && "text-destructive",
                isLow && !isEmpty && "text-orange-500"
              )}
            >
              {remaining}
            </span>
            {showUpgradeButton && (isLow || isEmpty) && (
              <Button size="sm" variant={isEmpty ? "destructive" : "outline"} asChild>
                <Link href="/billing">
                  {isEmpty ? "Comprar Créditos" : "Upgrade"}
                </Link>
              </Button>
            )}
          </div>
        </TooltipTrigger>
        <TooltipContent>
          <div className="space-y-1">
            <p className="text-sm font-medium">Saldo de Créditos</p>
            <p className="text-xs text-muted-foreground">
              {remaining} créditos restantes de {totalCredits} total
            </p>
            {personalCredits.billingPeriodEnd && (
              <p className="text-xs text-muted-foreground">
                Reseta em {new Date(personalCredits.billingPeriodEnd).toLocaleDateString()}
              </p>
            )}
            <p className="text-xs text-muted-foreground">
              Plano: {personalCredits.plan || "Free"}
            </p>
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

interface CreditCostProps {
  cost: number;
  operation: string;
  className?: string;
}

export function CreditCost({ cost, operation, className }: CreditCostProps) {
  return (
    <div className={cn("flex items-center gap-1 text-sm text-muted-foreground", className)}>
      <Coins className="h-3 w-3" />
      <span>{cost} créditos</span>
      <span>for {operation}</span>
    </div>
  );
}
