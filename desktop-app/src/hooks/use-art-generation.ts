import { useQuery, useMutation } from '@tanstack/react-query'
import { api, ApiError } from '@/lib/api-client'
import { useAuthStore } from '@/stores/auth.store'
import { ArtFormat } from '@/stores/generation.store'

export interface GenerateArtParams {
  projectId: number
  text: string
  format: ArtFormat
  includeLogo?: boolean
  usePhoto?: boolean
  photoUrl?: string
  variations?: 1 | 2 | 4
  styleDescription?: string
}

export interface GenerateArtResult {
  images: Array<{ imageUrl: string; prompt: string }>
  prompt: string
  provider: string
  format: string
  variations: number
}

export interface AIImage {
  id: string
  name: string
  fileUrl: string
  prompt: string
  createdAt: string
  format?: string
}

export interface DrivePhoto {
  id: string
  name: string
  mimeType: string
  thumbnailUrl?: string
  webContentLink?: string
}

export interface DrivePhotosResponse {
  items: DrivePhoto[]
  nextPageToken?: string
}

export function useGenerateArt() {
  return useMutation({
    mutationFn: async (params: GenerateArtParams) => {
      return await api.post<GenerateArtResult>('/api/tools/generate-art', params)
    },
  })
}

export function useAIImages(projectId: number | undefined) {
  const { logout } = useAuthStore()

  return useQuery<AIImage[]>({
    queryKey: ['ai-images', projectId],
    queryFn: async () => {
      try {
        return await api.get<AIImage[]>(`/api/projects/${projectId}/ai-images`)
      } catch (error) {
        if (error instanceof ApiError && error.status === 401) {
          await logout()
        }
        throw error
      }
    },
    enabled: !!projectId,
    staleTime: 2 * 60_000,
    gcTime: 5 * 60_000,
    retry: (failureCount, error) => {
      if (error instanceof ApiError && error.status === 401) return false
      return failureCount < 2
    },
  })
}

export function useDrivePhotos(projectId: number | undefined) {
  const { logout } = useAuthStore()

  return useQuery<DrivePhotosResponse>({
    queryKey: ['drive-photos', projectId],
    queryFn: async () => {
      try {
        const params = new URLSearchParams({
          projectId: String(projectId),
          folder: 'images',
        })
        return await api.get<DrivePhotosResponse>(`/api/drive/list?${params}`)
      } catch (error) {
        if (error instanceof ApiError && error.status === 401) {
          await logout()
        }
        throw error
      }
    },
    enabled: !!projectId,
    staleTime: 3 * 60_000,
    gcTime: 5 * 60_000,
    retry: (failureCount, error) => {
      if (error instanceof ApiError && error.status === 401) return false
      return failureCount < 2
    },
  })
}
