"use client";

import { useMutation } from '@tanstack/react-query';
import { useToast } from '@/hooks/use-toast';
import { api } from '@/lib/api-client';

export interface ImprovePromptParams {
  prompt: string;
  projectId: number;
  aspectRatio?: '1:1' | '16:9' | '9:16' | '4:5';
  referenceImages?: string[];
}

export interface ImprovePromptResponse {
  success: boolean;
  improvedPrompt: string; // Backwards compatibility (same as improvedPromptPt)
  improvedPromptPt: string; // Portuguese version for display
  improvedPromptEn: string; // English version for image generation
}

export function useImprovePrompt() {
  const { toast } = useToast();

  return useMutation<ImprovePromptResponse, Error, ImprovePromptParams>({
    mutationFn: (params: ImprovePromptParams) =>
      api.post<ImprovePromptResponse>('/api/ai/improve-prompt', params),
    onError: (error) => {
      const message = error.message || 'Erro ao melhorar descrição';

      // Check for insufficient credits
      if (message.includes('insuficientes') || message.includes('Insufficient')) {
        toast({
          title: 'Créditos insuficientes',
          description: 'Você não tem créditos suficientes para esta ação.',
          variant: 'destructive'
        });
        return;
      }

      toast({
        title: 'Erro ao melhorar descrição',
        description: message,
        variant: 'destructive'
      });
    },
  });
}
