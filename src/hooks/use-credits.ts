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
  | "image_generation"
  | "video_export"
  | "creative_download";

// Default UI credit costs (fallbacks). Dynamic values come from /api/credits/settings.
const DEFAULT_UI_CREDIT_COSTS: Record<OperationType, number> = {
  generate_content: 10,
  analyze_data: 5,
  export_report: 2,
  ai_chat: 1,
  image_generation: 5,
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

export function useCredits(): {
  credits: CreditData | null;
  isLoading: boolean;
  canPerformOperation: (operation: OperationType) => boolean;
  getCost: (operation: OperationType) => number;
  refresh: () => void;
} {
  const { user, isLoaded: isUserLoaded } = useUser();
  const { organization, isLoaded: isOrgLoaded } = useOrganization();
  const isOrganizationContext = Boolean(organization);
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

      const creditsRemaining = orgData.credits.current ?? 0;
      const creditsTotal = orgData.limits.creditsPerMonth ?? Math.max(creditsRemaining, 0);
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
    if (typeof fc['ai_image_generation'] === 'number') base.image_generation = Math.max(0, Math.floor(fc['ai_image_generation']));
    if (typeof fc['video_export'] === 'number') base.video_export = Math.max(0, Math.floor(fc['video_export']));
    if (typeof fc['creative_download'] === 'number') base.creative_download = Math.max(0, Math.floor(fc['creative_download']));
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
        canPerformOperation: () => false,
        getCost: (operation) => DEFAULT_UI_CREDIT_COSTS[operation],
        refresh,
      };
    }

    return {
      credits,
      isLoading: organizationCreditsQuery.isLoading,
      canPerformOperation,
      getCost,
      refresh,
    };
  }

  if (!isUserLoaded) {
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
