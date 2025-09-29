"use client";

import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api-client';

export interface SubscriptionStatus {
  isActive: boolean;
  plan?: string;
  trialEndsAt?: string;
}

export function useSubscription() {
  return useQuery<SubscriptionStatus>({
    queryKey: ['subscription-status'],
    queryFn: () => api.get('/api/subscription/status', { cache: 'no-store' }),
    staleTime: 30_000, // 30 seconds
    gcTime: 5 * 60_000, // 5 minutes
    refetchOnWindowFocus: false,
  });
}