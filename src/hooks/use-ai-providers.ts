"use client";

import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api-client';

export interface AIProvider {
  key: string;
  name: string;
  hasApiKey: boolean;
  models: { id: string; label: string }[];
}

export interface AIProvidersResponse {
  providers: AIProvider[];
}

export function useAIProviders() {
  return useQuery<AIProvidersResponse>({
    queryKey: ['ai-providers'],
    queryFn: () => api.get<AIProvidersResponse>('/api/ai/providers'),
    staleTime: 5 * 60_000, // 5 minutes
    gcTime: 10 * 60_000, // 10 minutes
    retry: 2,
  });
}
