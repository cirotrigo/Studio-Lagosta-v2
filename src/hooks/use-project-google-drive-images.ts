import { useInfiniteQuery } from '@tanstack/react-query'
import { api } from '@/lib/api-client'

interface GoogleDriveImage {
  id: string
  name: string
  mimeType: string
  thumbnailLink?: string
  webContentLink?: string
}

interface GoogleDriveImagesResponse {
  images: GoogleDriveImage[]
  nextOffset?: number
}

export function useProjectGoogleDriveImages(projectId: number) {
  return useInfiniteQuery<GoogleDriveImagesResponse>({
    queryKey: ['google-drive-images', projectId],
    queryFn: async ({ pageParam = 0 }) => {
      console.log('[useProjectGoogleDriveImages] Fetching with:', {
        projectId,
        pageParam,
      })
      const response = await api.get<GoogleDriveImagesResponse>(
        `/api/projects/${projectId}/google-drive/images?offset=${pageParam}&limit=20`
      )
      console.log('[useProjectGoogleDriveImages] Response:', {
        imagesCount: response.images?.length,
        firstImage: response.images?.[0],
        nextOffset: response.nextOffset,
        fullResponse: response,
      })
      return response
    },
    getNextPageParam: (lastPage) => lastPage.nextOffset,
    initialPageParam: 0,
    staleTime: 2 * 60_000,
    enabled: !!projectId,
  })
}
