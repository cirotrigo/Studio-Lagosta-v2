"use client";

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api-client';

export interface AdminSettings {
  featureCosts: Record<string, number>;
  planCredits: Record<string, number>;
}

export function useAdminSettings() {
  return useQuery<AdminSettings>({
    queryKey: ['admin-settings'],
    queryFn: () => api.get('/api/admin/settings'),
    staleTime: 5 * 60_000, // 5 minutes
    gcTime: 10 * 60_000, // 10 minutes
  });
}

export function useUpdateAdminSettings() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (settings: AdminSettings) =>
      api.put('/api/admin/settings', settings),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-settings'] });
      queryClient.invalidateQueries({ queryKey: ['credit-settings'] });
    },
  });
}