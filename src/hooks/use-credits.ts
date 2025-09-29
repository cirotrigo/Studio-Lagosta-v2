"use client";

import { useUser } from "@clerk/nextjs";
import { useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api-client';

export type OperationType = 
  | "generate_content"
  | "analyze_data"
  | "export_report"
  | "ai_chat"
  | "image_generation";

// Default UI credit costs (fallbacks). Dynamic values come from /api/credits/settings.
const DEFAULT_UI_CREDIT_COSTS: Record<OperationType, number> = {
  generate_content: 10,
  analyze_data: 5,
  export_report: 2,
  ai_chat: 1,
  image_generation: 5,
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

export function useCredits(): {
  credits: CreditData | null;
  isLoading: boolean;
  canPerformOperation: (operation: OperationType) => boolean;
  getCost: (operation: OperationType) => number;
  refresh: () => void;
} {
  const { user, isLoaded } = useUser();
  const queryClient = useQueryClient();

  // Fetch dynamic settings
  const { data: settings } = useQuery<{ featureCosts?: Record<string, number>; planCredits?: Record<string, number> } | null>({
    queryKey: ['credit-settings'],
    queryFn: () => api.get('/api/credits/settings'),
    staleTime: 60_000,
    gcTime: 5 * 60_000,
  });

  const { data, isLoading: loadingServer } = useQuery<{ creditsRemaining: number } | null>({
    queryKey: ['credits', user?.id],
    enabled: isLoaded && !!user,
    refetchOnWindowFocus: true,
    refetchInterval: 30000,
    queryFn: () => api.get('/api/credits/me'),
  });

  const publicMetadata = user?.publicMetadata as {
    subscriptionPlan?: string;
    creditsRemaining?: number;
    creditsTotal?: number;
    billingPeriodEnd?: string;
  } | undefined;

  const credits = useMemo(() => {
    if (!isLoaded || !user) {
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
  }, [isLoaded, user, publicMetadata, data]);

  // Map backend feature keys to UI operation keys
  const getDynamicCosts = (): Record<OperationType, number> => {
    const base = { ...DEFAULT_UI_CREDIT_COSTS };
    const fc = settings?.featureCosts || {};
    // Align known features to UI operations
    if (typeof fc['ai_text_chat'] === 'number') base.ai_chat = Math.max(0, Math.floor(fc['ai_text_chat']));
    if (typeof fc['ai_image_generation'] === 'number') base.image_generation = Math.max(0, Math.floor(fc['ai_image_generation']));
    return base;
  };

  const canPerformOperation = (operation: OperationType) => {
    if (!credits) return false;
    const costs = getDynamicCosts();
    const cost = costs[operation];
    return credits.creditsRemaining >= cost;
  };

  const getCost = (operation: OperationType) => {
    const costs = getDynamicCosts();
    return costs[operation];
  };

  const refresh = () => {
    if (user?.id) queryClient.invalidateQueries({ queryKey: ['credits', user.id] });
  };

  if (!isLoaded) {
    return {
      credits: null,
      isLoading: true,
      canPerformOperation: () => false,
      getCost: (operation) => DEFAULT_UI_CREDIT_COSTS[operation],
      refresh,
    };
  }

  return {
    credits,
    isLoading: loadingServer,
    canPerformOperation,
    getCost,
    refresh,
  };
}
