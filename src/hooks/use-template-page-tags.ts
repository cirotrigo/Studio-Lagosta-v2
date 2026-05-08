'use client'

import { useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api-client'

interface UpdateTagsResponse {
  id: string
  tags: string[]
  updatedAt: string
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
    },
  })
}
