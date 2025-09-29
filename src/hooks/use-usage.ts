"use client";

import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api-client';

export interface UsageData {
  totalRequests: number;
  totalCreditsUsed: number;
  uniqueUsers: number;
  timeRange: string;
  breakdown: Array<{
    feature: string;
    requests: number;
    creditsUsed: number;
  }>;
  timeline: Array<{
    date: string;
    requests: number;
    creditsUsed: number;
  }>;
}

export interface UsageParams {
  period?: 'day' | 'week' | 'month' | 'year';
  startDate?: string;
  endDate?: string;
  feature?: string;
}

export function useUsage(params: UsageParams = {}) {
  const searchParams = new URLSearchParams();

  if (params.period) searchParams.set('period', params.period);
  if (params.startDate) searchParams.set('startDate', params.startDate);
  if (params.endDate) searchParams.set('endDate', params.endDate);
  if (params.feature) searchParams.set('feature', params.feature);

  return useQuery<UsageData>({
    queryKey: ['admin-usage', params],
    queryFn: () => api.get(`/api/admin/usage?${searchParams.toString()}`),
    staleTime: 2 * 60_000, // 2 minutes
    gcTime: 10 * 60_000, // 10 minutes
  });
}