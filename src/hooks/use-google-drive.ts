import { useInfiniteQuery } from '@tanstack/react-query'
import { api } from '@/lib/api-client'
import type { GoogleDriveBrowserMode, GoogleDriveListResponse } from '@/types/google-drive'

interface UseGoogleDriveItemsParams {
  folderId?: string
  mode?: GoogleDriveBrowserMode
  search?: string
}

export function useGoogleDriveItems({ folderId, mode = 'folders', search }: UseGoogleDriveItemsParams) {
  return useInfiniteQuery<GoogleDriveListResponse>({
    queryKey: ['google-drive', 'files', { folderId: folderId ?? 'root', mode, search: search ?? '' }],
    initialPageParam: undefined as string | undefined,
    queryFn: async ({ pageParam }) => {
      const params = new URLSearchParams()
      if (folderId) params.set('folderId', folderId)
      if (mode) params.set('mode', mode)
      if (search) params.set('search', search)
      const pageToken = typeof pageParam === 'string' ? pageParam : undefined
      if (pageToken) params.set('pageToken', pageToken)
      return api.get<GoogleDriveListResponse>(`/api/google-drive/files?${params.toString()}`)
    },
    getNextPageParam: (lastPage) => lastPage.nextPageToken ?? undefined,
    staleTime: 60 * 1000,
    refetchOnWindowFocus: false,
  })
}
