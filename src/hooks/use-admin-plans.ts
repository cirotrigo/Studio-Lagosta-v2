"use client";

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api-client';
import type { ClerkPlanNormalized } from '@/lib/clerk/commerce-plan-types';

export interface Plan {
  id: string;
  clerkId: string | null;
  name: string;
  credits: number;
  active: boolean;
  clerkName?: string | null;
  currency?: string | null;
  priceMonthlyCents?: number | null;
  priceYearlyCents?: number | null;
  description?: string | null;
  features?: Array<{ name: string; description?: string | null; included?: boolean | null }> | null;
  badge?: string | null;
  highlight?: boolean | null;
  ctaType?: 'checkout' | 'contact' | null;
  ctaLabel?: string | null;
  ctaUrl?: string | null;
  billingSource?: 'clerk' | 'manual' | null;
}

export type ClerkPlan = ClerkPlanNormalized

export interface PlansResponse {
  plans: Plan[];
}

export interface ClerkPlansResponse {
  plans: ClerkPlan[];
}

export function useAdminPlans() {
  return useQuery<PlansResponse>({
    queryKey: ['admin-plans'],
    queryFn: () => api.get('/api/admin/plans'),
    staleTime: 2 * 60_000, // 2 minutes
    gcTime: 10 * 60_000, // 10 minutes
  });
}

export function useClerkPlans() {
  return useQuery<ClerkPlansResponse>({
    queryKey: ['clerk-plans'],
    queryFn: () => api.get('/api/admin/clerk/plans'),
    staleTime: 5 * 60_000, // 5 minutes
    gcTime: 10 * 60_000, // 10 minutes
    enabled: false, // Only fetch when explicitly triggered
  });
}

export function useCreatePlan() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (plan: {
      clerkId?: string;
      billingSource?: 'clerk' | 'manual';
      name: string;
      credits: number;
      active?: boolean;
      clerkName?: string | null;
      currency?: string | null;
      priceMonthlyCents?: number | null;
      priceYearlyCents?: number | null;
      description?: string | null;
      features?: Array<{ name: string; description?: string | null; included?: boolean | null }> | null;
      badge?: string | null;
      highlight?: boolean | null;
      ctaType?: 'checkout' | 'contact' | null;
      ctaLabel?: string | null;
      ctaUrl?: string | null;
    }) =>
      api.post('/api/admin/plans', plan),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-plans'] });
    },
  });
}

export function useUpdatePlan() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ planId, clerkId, ...plan }: {
      planId?: string;
      clerkId?: string;
      name?: string;
      credits?: number;
      active?: boolean;
      clerkName?: string | null;
      currency?: string | null;
      priceMonthlyCents?: number | null;
      priceYearlyCents?: number | null;
      description?: string | null;
      features?: Array<{ name: string; description?: string | null; included?: boolean | null }> | null;
      badge?: string | null;
      highlight?: boolean | null;
      ctaType?: 'checkout' | 'contact' | null;
      ctaLabel?: string | null;
      ctaUrl?: string | null;
      billingSource?: 'clerk' | 'manual';
    }) => {
      const identifier = planId ?? clerkId
      if (!identifier) {
        return Promise.reject(new Error('Plan identifier is required'))
      }
      return api.put(`/api/admin/plans/${encodeURIComponent(identifier)}`, { clerkId, planId, ...plan })
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-plans'] });
    },
  });
}

export function useDeletePlan() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (identifier: string) =>
      api.delete(`/api/admin/plans/${encodeURIComponent(identifier)}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-plans'] });
    },
  });
}

export function useRefreshPlanPricing() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () => api.post('/api/admin/plans/refresh-pricing', {}),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-plans'] });
    },
  });
}
