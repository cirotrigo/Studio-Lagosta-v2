"use client";

import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api-client';

export interface UsageRecord {
  id: string;
  user: {
    name: string;
    email: string;
  };
  operationType: string;
  creditsUsed: number;
  details: Record<string, unknown>;
  timestamp: string;
}

export interface UsageHistoryParams {
  type?: string;
  range?: string;
  q?: string;
  page?: number;
  pageSize?: number;
}

export interface UsageHistoryResponse {
  data: UsageRecord[];
  total: number;
  page: number;
  pageSize: number;
}

export function useUsageHistory(params: UsageHistoryParams = {}) {
  const searchParams = new URLSearchParams();

  if (params.type) searchParams.set('type', params.type);
  if (params.range) searchParams.set('range', params.range);
  if (params.q) searchParams.set('q', params.q);
  if (params.page) searchParams.set('page', params.page.toString());
  if (params.pageSize) searchParams.set('pageSize', params.pageSize.toString());

  return useQuery<UsageHistoryResponse>({
    queryKey: ['admin-usage-history', params],
    queryFn: () => api.get(`/api/admin/usage?${searchParams.toString()}`),
    staleTime: 60_000, // 1 minute
    gcTime: 5 * 60_000, // 5 minutes
  });
}