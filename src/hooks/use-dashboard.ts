"use client";

import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api-client';

export interface DashboardStats {
  totalUsers: number;
  activeUsers: number;
  totalCredits: number;
  usedCredits: number;
  mrrSeries: { label: string; value: number }[];
  arrSeries: { label: string; value: number }[];
  churnSeries: { label: string; value: number }[];
  recentActivity: Array<{
    id: string;
    type: string;
    description: string;
    timestamp: string;
  }>;
}

export function useDashboard() {
  return useQuery<DashboardStats>({
    queryKey: ['admin-dashboard'],
    queryFn: () => api.get('/api/admin/dashboard'),
    staleTime: 2 * 60_000, // 2 minutes
    gcTime: 10 * 60_000, // 10 minutes
  });
}