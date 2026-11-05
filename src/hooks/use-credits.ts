"use client";

import { useOrganization, useUser } from "@clerk/nextjs";
import { useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api-client';
import { useOrganizationCredits, organizationKeys } from '@/hooks/use-organizations';

export type OperationType =
  | "generate_content"
  | "analyze_data"
  | "export_report"
  | "ai_chat"
  | "ai_image_generation"
  | "video_export"
  | "creative_download";

// Default UI credit costs (fallbacks). Dynamic values come from /api/credits/settings.
const DEFAULT_UI_CREDIT_COSTS: Record<OperationType, number> = {
  generate_content: 10,
  analyze_data: 5,
  export_report: 2,
  ai_chat: 1,
  ai_image_generation: 5,
  video_export: 10,
  creative_download: 2,
};

export interface CreditData {
  plan: string;
  creditsRemaining: number;
  creditsTotal: number;
  billingPeriodEnd: Date | null;
  percentage: number;
  isLow: boolean;
  isEmpty: boolean;
}

/**
 * Pode rodar a operação? Com a cobrança desligada (`creditosAplicados: false`,
 * o modo interno) ou ainda desconhecida, sempre — inclusive enquanto os
 * créditos carregam. Só com ela ligada explicitamente, a comparação de antes.
 */
export function podeExecutar({
  aplicados,
  creditsRemaining,
  cost,
}: {
  aplicados: boolean | undefined;
  creditsRemaining: number | null | undefined;
  cost: number;
}): boolean {
  // Só a cobrança ligada EXPLICITAMENTE trava: configuração que não chegou ou
  // falhou não pode bloquear a tela — quem decide a cobrança é o servidor.
  if (aplicados !== true) return true;
  if (creditsRemaining == null) return false;
  return creditsRemaining >= cost;
}

type CreditSettings = { featureCosts?: Record<string, number>; planCredits?: Record<string, number>; creditosAplicados?: boolean } | null;

function useCreditSettings() {
  return useQuery<CreditSettings>({
    queryKey: ['credit-settings'],
    queryFn: () => api.get('/api/credits/settings'),
    staleTime: 60_000,
    gcTime: 5 * 60_000,
  });
}

/**
 * A UI comercial (saldo, custo em créditos, Cobrança) só aparece com a
 * cobrança ligada EXPLICITAMENTE; carregando ou com falha conta como modo
 * interno. Mais leve que `useCredits`: lê só a configuração, sem consultar o
 * saldo — serve para rótulos em listas (um card por arte).
 */
export function useCobrancaLigada(): boolean {
  const { data } = useCreditSettings();
  return data?.creditosAplicados === true;
}

export function useCredits(): {
  credits: CreditData | null;
  isLoading: boolean;
  /** `false` no modo interno: o saldo não bloqueia nada (ver `podeExecutar`). */
  creditosAplicados: boolean | undefined;
  canPerformOperation: (operation: OperationType) => boolean;
  getCost: (operation: OperationType) => number;
  refresh: () => void;
} {
  const { user, isLoaded: isUserLoaded } = useUser();
  const { organization, isLoaded: isOrgLoaded } = useOrganization();
  const isOrganizationContext = Boolean(organization);
  const queryClient = useQueryClient();

  // Fetch dynamic settings
  const { data: settings } = useCreditSettings();

  const { data, isLoading: loadingServer } = useQuery<{ creditsRemaining: number } | null>({
    queryKey: ['credits', user?.id],
    enabled: !isOrganizationContext && isUserLoaded && !!user,
    refetchOnWindowFocus: true,
    refetchInterval: 30000,
    queryFn: () => api.get('/api/credits/me'),
  });

  const organizationCreditsQuery = useOrganizationCredits(organization?.id ?? null);

  const publicMetadata = user?.publicMetadata as {
    subscriptionPlan?: string;
    creditsRemaining?: number;
    creditsTotal?: number;
    billingPeriodEnd?: string;
  } | undefined;

  const credits = useMemo(() => {
    if (isOrganizationContext) {
      const orgData = organizationCreditsQuery.data;
      if (!isOrgLoaded || !organization || !orgData) {
        return null;
      }

      const creditsRemaining = orgData.credits?.current ?? 0;
      const creditsTotal = orgData.limits?.creditsPerMonth ?? Math.max(creditsRemaining, 0);
      const percentage = creditsTotal > 0 ? (creditsRemaining / creditsTotal) * 100 : 0;

      return {
        plan: 'organization',
        creditsRemaining,
        creditsTotal,
        billingPeriodEnd: null,
        percentage,
        isLow: percentage < 20,
        isEmpty: creditsRemaining === 0,
      } satisfies CreditData;
    }

    if (!isUserLoaded || !user) {
      return null;
    }

    const metaCreditsRemaining = publicMetadata?.creditsRemaining ?? 0;
    const serverRemaining = (data && typeof data.creditsRemaining === 'number') ? data.creditsRemaining : null;
    const creditsRemaining = serverRemaining ?? metaCreditsRemaining;
    const creditsTotal = publicMetadata?.creditsTotal ?? 0;
    const percentage = creditsTotal > 0 ? (creditsRemaining / creditsTotal) * 100 : 0;

    return {
      plan: publicMetadata?.subscriptionPlan || "none",
      creditsRemaining,
      creditsTotal,
      billingPeriodEnd: publicMetadata?.billingPeriodEnd
        ? new Date(publicMetadata.billingPeriodEnd)
        : null,
      percentage,
      isLow: percentage < 20,
      isEmpty: creditsRemaining === 0,
    };
  }, [
    isOrganizationContext,
    organization,
    isOrgLoaded,
    organizationCreditsQuery.data,
    isUserLoaded,
    user,
    publicMetadata,
    data,
  ]);

  // Map backend feature keys to UI operation keys
  const getDynamicCosts = (): Record<OperationType, number> => {
    const base = { ...DEFAULT_UI_CREDIT_COSTS };
    const fc = settings?.featureCosts || {};
    // Align known features to UI operations
    if (typeof fc['ai_text_chat'] === 'number') base.ai_chat = Math.max(0, Math.floor(fc['ai_text_chat']));
    if (typeof fc['ai_image_generation'] === 'number') base.ai_image_generation = Math.max(0, Math.floor(fc['ai_image_generation']));
    if (typeof fc['video_export'] === 'number') base.video_export = Math.max(0, Math.floor(fc['video_export']));
    if (typeof fc['creative_download'] === 'number') base.creative_download = Math.max(0, Math.floor(fc['creative_download']));
    return base;
  };

  // Desconhecido (configuração carregando ou com falha) conta como desligado.
  const creditosAplicados = settings?.creditosAplicados === true;

  const canPerformOperation = (operation: OperationType) =>
    podeExecutar({
      aplicados: creditosAplicados,
      creditsRemaining: credits?.creditsRemaining,
      cost: getDynamicCosts()[operation],
    });

  /** Enquanto os créditos carregam: só o modo interno libera. */
  const podeCarregando = (operation: OperationType) =>
    podeExecutar({ aplicados: creditosAplicados, creditsRemaining: null, cost: DEFAULT_UI_CREDIT_COSTS[operation] });

  const getCost = (operation: OperationType) => {
    const costs = getDynamicCosts();
    return costs[operation];
  };

  const refresh = () => {
    if (isOrganizationContext && organization?.id) {
      queryClient.invalidateQueries({ queryKey: organizationKeys.credits(organization.id) });
    }
    if (!isOrganizationContext && user?.id) {
      queryClient.invalidateQueries({ queryKey: ['credits', user.id] });
    }
  };

  if (isOrganizationContext) {
    if (!isOrgLoaded) {
      return {
        credits: null,
        isLoading: true,
        creditosAplicados,
        canPerformOperation: podeCarregando,
        getCost: (operation) => DEFAULT_UI_CREDIT_COSTS[operation],
        refresh,
      };
    }

    return {
      credits,
      isLoading: organizationCreditsQuery.isLoading,
      creditosAplicados,
      canPerformOperation,
      getCost,
      refresh,
    };
  }

  if (!isUserLoaded) {
    return {
      credits: null,
      isLoading: true,
      creditosAplicados,
      canPerformOperation: podeCarregando,
      getCost: (operation) => DEFAULT_UI_CREDIT_COSTS[operation],
      refresh,
    };
  }

  return {
    credits,
    isLoading: loadingServer,
    creditosAplicados,
    canPerformOperation,
    getCost,
    refresh,
  };
}
