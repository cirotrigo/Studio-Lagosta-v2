"use client";

import { useMutation } from '@tanstack/react-query';
import { useToast } from '@/hooks/use-toast';
import { api } from '@/lib/api-client';

export interface ImproveCaptionParams {
  caption: string;
  projectId: number;
  postType?: 'POST' | 'STORY' | 'REEL' | 'CAROUSEL';
}

export interface ImproveCaptionResponse {
  success: boolean;
  improvedCaption: string;
}

export function useImproveCaption() {
  const { toast } = useToast();

  return useMutation<ImproveCaptionResponse, Error, ImproveCaptionParams>({
    mutationFn: (params: ImproveCaptionParams) =>
      api.post<ImproveCaptionResponse>('/api/ai/improve-caption', params),
    onError: (error) => {
      const message = error.message || 'Erro ao melhorar legenda';

      if (message.includes('insuficientes') || message.includes('Insufficient')) {
        toast({
          title: 'Créditos insuficientes',
          description: 'Você não tem créditos suficientes para esta ação.',
          variant: 'destructive'
        });
        return;
      }

      toast({
        title: 'Erro ao melhorar legenda',
        description: message,
        variant: 'destructive'
      });
    },
  });
}
