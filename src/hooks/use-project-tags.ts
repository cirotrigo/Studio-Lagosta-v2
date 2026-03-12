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

/**
 * Hook to delete a project tag
 */
export function useDeleteProjectTag() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ projectId, tagId }: { projectId: number; tagId: string }) =>
      api.delete(`/api/projects/${projectId}/tags/${tagId}`),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['projectTags', variables.projectId] })
    },
  })
}
