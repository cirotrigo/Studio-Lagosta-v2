"use client"

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api-client'

export interface ProjectTag {
  id: string
  name: string
  color: string
  projectId: number
  createdAt: string
}

interface UseProjectTagsParams {
  projectId: number | null
  enabled?: boolean
}

/**
 * Hook to list project tags
 */
export function useProjectTags({ projectId, enabled = true }: UseProjectTagsParams) {
  return useQuery<ProjectTag[]>({
    queryKey: ['projectTags', projectId],
    queryFn: () => api.get(`/api/projects/${projectId}/tags`),
    enabled: enabled && !!projectId,
    staleTime: 5 * 60_000,
    gcTime: 10 * 60_000,
  })
}

/**
 * Hook to create a new project tag
 */
export function useCreateProjectTag() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ projectId, name }: { projectId: number; name: string }) =>
      api.post<ProjectTag>(`/api/projects/${projectId}/tags`, { name }),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['projectTags', variables.projectId] })
    },
  })
}

/**
 * Hook to update a project tag
 */
export function useUpdateProjectTag() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ projectId, tagId, name }: { projectId: number; tagId: string; name: string }) =>
      api.put<ProjectTag>(`/api/projects/${projectId}/tags/${tagId}`, { name }),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['projectTags', variables.projectId] })
    },
  })
}

export interface DeleteTagResponse {
  success?: boolean
  pagesUpdated?: number
  error?: string
  code?: 'TAG_HAS_PAGES'
  pageCount?: number
  message?: string
}

export interface DeleteTagParams {
  projectId: number
  tagId: string
  transferToTagId?: string
  forceDelete?: boolean
}

/**
 * Hook to delete a project tag
 * Supports transferring pages to another tag before deletion
 */
export function useDeleteProjectTag() {
  const queryClient = useQueryClient()

  return useMutation<DeleteTagResponse, Error, DeleteTagParams>({
    mutationFn: async ({ projectId, tagId, transferToTagId, forceDelete }) => {
      const response = await fetch(`/api/projects/${projectId}/tags/${tagId}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ transferToTagId, forceDelete }),
      })

      const data = await response.json()

      if (!response.ok) {
        // Return the full response for TAG_HAS_PAGES so component can handle it
        if (data.code === 'TAG_HAS_PAGES') {
          return data as DeleteTagResponse
        }
        throw new Error(data.error || 'Erro ao remover tag')
      }

      return data as DeleteTagResponse
    },
    onSuccess: (data, variables) => {
      // Only invalidate if deletion was successful
      if (data.success) {
        queryClient.invalidateQueries({ queryKey: ['projectTags', variables.projectId] })
      }
    },
  })
}
