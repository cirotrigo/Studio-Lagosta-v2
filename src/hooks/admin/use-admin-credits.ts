"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { api } from "@/lib/api-client";

export interface CreditBalance {
  id: string;
  user: {
    id: string;
    name: string;
    email: string;
  };
  creditsRemaining: number;
  lastSyncedAt: string;
  _count?: {
    usageHistory: number;
  };
}

export interface CreditsResponse {
  creditBalances: CreditBalance[];
  pagination?: {
    page: number;
    pageSize: number;
    total: number;
    pages: number;
  };
}

export interface CreditsParams {
  page?: number;
  pageSize?: number;
  includeUsageCount?: boolean;
  minCredits?: number;
  maxCredits?: number;
}

export function useAdminCredits(params: CreditsParams = {}) {
  return useQuery<CreditsResponse>({
    queryKey: ['admin', 'credits', params],
    queryFn: async () => {
      const searchParams = new URLSearchParams({
        page: String(params.page || 1),
        pageSize: String(params.pageSize || 1000),
        includeUsageCount: String(params.includeUsageCount || true),
      });

      if (params.minCredits !== undefined) {
        searchParams.set('minCredits', String(params.minCredits));
      }

      if (params.maxCredits !== undefined) {
        searchParams.set('maxCredits', String(params.maxCredits));
      }

      const data = await api.get<CreditsResponse>(`/api/admin/credits?${searchParams}`);
      // Handle both new and old response formats
      return {
        creditBalances: data.creditBalances || (data as { creditBalances?: CreditBalance[] }).creditBalances || [],
        pagination: data.pagination
      };
    },
    staleTime: 30_000, // 30 seconds
    gcTime: 5 * 60_000, // 5 minutes
  });
}

export function useAdjustCredits() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: ({
      creditBalanceId,
      adjustment
    }: {
      creditBalanceId: string;
      adjustment: number;
    }) => api.put(`/api/admin/credits/${creditBalanceId}`, { adjustment }),
    onMutate: async ({ creditBalanceId, adjustment }) => {
      // Cancel any outgoing refetches (so they don't overwrite our optimistic update)
      await queryClient.cancelQueries({ queryKey: ['admin', 'credits'] });

      // Snapshot the previous value
      const previousCredits = queryClient.getQueriesData({ queryKey: ['admin', 'credits'] });

      // Optimistically update to the new value
      queryClient.setQueriesData(
        { queryKey: ['admin', 'credits'] },
        (old: CreditsResponse | undefined) => {
          if (!old) return old;

          return {
            ...old,
            creditBalances: old.creditBalances.map(balance =>
              balance.id === creditBalanceId
                ? { ...balance, creditsRemaining: Math.max(0, balance.creditsRemaining + adjustment) }
                : balance
            )
          };
        }
      );

      // Return a context object with the snapshotted value
      return { previousCredits };
    },
    onError: (err, variables, context) => {
      // If the mutation fails, use the context returned from onMutate to roll back
      if (context?.previousCredits) {
        context.previousCredits.forEach(([queryKey, data]) => {
          queryClient.setQueryData(queryKey, data);
        });
      }

      toast({
        title: "Falha no ajuste",
        description: err.message,
        variant: "destructive"
      });
    },
    onSuccess: (data, variables) => {
      const adjustmentType = variables.adjustment > 0 ? 'add' : 'subtract';
      const amount = Math.abs(variables.adjustment);

      toast({
        title: "Créditos ajustados",
        description: `${adjustmentType === 'add' ? '+' : '-'}${amount} créditos`
      });
    },
    onSettled: () => {
      // Always refetch after error or success to ensure we have the latest data
      queryClient.invalidateQueries({ queryKey: ['admin', 'credits'] });
    },
  });
}