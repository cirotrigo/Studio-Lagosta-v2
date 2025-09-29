"use client";

import { useMutation } from '@tanstack/react-query';
import { useToast } from '@/hooks/use-toast';
import { api } from '@/lib/api-client';

export interface GenerateImageParams {
  model: string;
  prompt: string;
  size?: string;
  count?: number;
  attachments?: { name: string; url: string }[];
}

export interface GenerateImageResponse {
  images: string[];
  credits_used?: number;
}

export function useGenerateImage() {
  const { toast } = useToast();

  return useMutation<GenerateImageResponse, Error, GenerateImageParams>({
    mutationFn: (params: GenerateImageParams) =>
      api.post<GenerateImageResponse>('/api/ai/image', params),
    onError: (error) => {
      toast({
        title: 'Failed to generate image',
        description: error.message,
        variant: 'destructive'
      });
    },
    onSuccess: (data) => {
      if (data.credits_used) {
        toast({
          title: 'Image generated successfully',
          description: `Used ${data.credits_used} credits`,
        });
      }
    },
  });
}