"use client";

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api-client';

export interface StorageItem {
  id: string;
  name: string;
  contentType: string | null;
  size: number;
  url: string;
  pathname: string;
  createdAt: string;
  user: { id: string; clerkId: string; email: string | null; name: string | null };
}

export interface StorageParams {
  q?: string;
  type?: string;
  userId?: string;
  cursor?: string;
  limit?: number;
}

export interface StorageResponse {
  items: StorageItem[];
  nextCursor: string | null;
}

export function useStorage(params: StorageParams = {}) {
  const searchParams = new URLSearchParams();

  if (params.q) searchParams.set('q', params.q);
  if (params.type) searchParams.set('type', params.type);
  if (params.userId) searchParams.set('userId', params.userId);
  if (params.cursor) searchParams.set('cursor', params.cursor);
  if (params.limit) searchParams.set('limit', params.limit.toString());

  return useQuery<StorageResponse>({
    queryKey: ['admin-storage', params],
    queryFn: () => api.get(`/api/admin/storage?${searchParams.toString()}`),
    staleTime: 60_000, // 1 minute
    gcTime: 5 * 60_000, // 5 minutes
  });
}

export function useDeleteStorageItem() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) =>
      api.delete(`/api/admin/storage/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-storage'] });
    },
  });
}