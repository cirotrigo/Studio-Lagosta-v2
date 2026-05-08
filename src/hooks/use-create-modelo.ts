'use client'

import { useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api-client'

export interface CreateModeloInput {
  name: string
  type: 'STORY' | 'FEED' | 'SQUARE'
  dimensions: string
  tags: string[]
}

export interface CreateModeloResponse {
  templateId: number
  pageId: string
  name: string
  type: 'STORY' | 'FEED' | 'SQUARE'
  dimensions: string
  tags: string[]
}

export function useCreateModelo(projectId: number) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (input: CreateModeloInput) =>
      api.post<CreateModeloResponse>(
        `/api/projects/${projectId}/modelos`,
        input,
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['templates', projectId] })
      queryClient.invalidateQueries({ queryKey: ['template-pages'] })
    },
  })
}
