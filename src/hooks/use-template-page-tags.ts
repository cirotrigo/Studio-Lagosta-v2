'use client'

import { useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api-client'

interface UpdateTagsResponse {
  id: string
  tags: string[]
  updatedAt: string
}

interface DeletePageResponse {
  deleted: true
  pageId: string
  templateId: number
  deletedTemplate: boolean
}

export function useUpdateTemplatePageTags(projectId: number) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ pageId, tags }: { pageId: string; tags: string[] }) =>
      api.patch<UpdateTagsResponse>(
        `/api/projects/${projectId}/template-pages/${pageId}/tags`,
        { tags },
      ),
    onSuccess: () => {
      // Template pages are queried via /api/templates/[id]/template-pages
      // and cached under ['template-pages', templateId]. The endpoint returns
      // all pages across the project's templates, so any cached entry under
      // this prefix should be invalidated.
      queryClient.invalidateQueries({ queryKey: ['template-pages'] })
      // The PATCH endpoint also auto-creates ProjectTag entries for any new
      // tag names — invalidate the project tags cache so the suggestion
      // dropdown picks them up immediately.
      queryClient.invalidateQueries({ queryKey: ['projectTags', projectId] })
    },
  })
}

export function useDeleteTemplatePage(projectId: number) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ pageId }: { pageId: string }) =>
      api.delete<DeletePageResponse>(
        `/api/projects/${projectId}/template-pages/${pageId}`,
      ),
    onSuccess: () => {
      // The deletion may have removed the parent Template too, so refresh
      // both the templates list and the template-pages bundle.
      queryClient.invalidateQueries({ queryKey: ['templates'] })
      queryClient.invalidateQueries({ queryKey: ['template-pages'] })
    },
  })
}
