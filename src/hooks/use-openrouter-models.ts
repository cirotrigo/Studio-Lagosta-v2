"use client";

import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api-client';

export interface OpenRouterModel {
  id: string;
  label: string;
}

export interface OpenRouterModelsResponse {
  models: OpenRouterModel[];
}

export function useOpenRouterModels(capability?: 'image' | 'text') {
  return useQuery<OpenRouterModelsResponse>({
    queryKey: ['openrouter-models', capability],
    queryFn: () => {
      const path = capability === 'image'
        ? '/api/ai/openrouter/models?capability=image'
        : '/api/ai/openrouter/models';
      return api.get<OpenRouterModelsResponse>(path);
    },
    enabled: capability !== undefined,
    staleTime: 10 * 60_000, // 10 minutes - models don't change frequently
    gcTime: 30 * 60_000, // 30 minutes
    retry: 2,
  });
}
