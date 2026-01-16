import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api-client'

export interface StartYoutubeDownloadInput {
  youtubeUrl: string
  nome?: string
  artista?: string
  genero?: string
  humor?: string
  projectId?: number
}

export interface StartYoutubeDownloadResponse {
  success: boolean
  jobId: number
  downloadLink?: string
  title?: string
  thumbnail?: string
  duration?: number
  status?: string
  message?: string
  error?: string
}

export interface UploadMp3Input {
  jobId: number
  file: File
}

export interface UploadMp3Response {
  success: boolean
  musicId?: number
  name?: string
  blobUrl?: string
  error?: string
}

export interface YoutubeJobSummary {
  id: number
  status: string
  progress: number
  error: string | null
  youtubeUrl: string
  title: string | null
  thumbnail: string | null
  createdAt: string
  music?: {
    id: number
    name: string
    blobUrl: string
    hasPercussionStem: boolean
  } | null
}

export interface YoutubeJobStatusResponse {
  jobId: number
  status: string
  progress: number
  error: string | null
  youtubeUrl: string
  title: string | null
  thumbnail: string | null
  createdAt: string
  completedAt: string | null
  videoApiStatus?: string | null
  music: {
    id: number
    name: string
    blobUrl: string
    hasPercussionStem: boolean
    percussionUrl: string | null
    stemJob: {
      status: string
      progress: number
    } | null
  } | null
}

export function useBaixarDoYoutube() {
  const queryClient = useQueryClient()

  return useMutation<StartYoutubeDownloadResponse, Error, StartYoutubeDownloadInput>({
    mutationFn: (data: StartYoutubeDownloadInput) =>
      api.post('/api/biblioteca-musicas/youtube', data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['youtube-jobs'] })
    },
  })
}

export function useUploadYoutubeMp3() {
  const queryClient = useQueryClient()

  return useMutation<UploadMp3Response, Error, UploadMp3Input>({
    mutationFn: async ({ jobId, file }: UploadMp3Input) => {
      const formData = new FormData()
      formData.append('file', file)

      const response = await fetch(`/api/biblioteca-musicas/youtube/${jobId}/upload`, {
        method: 'POST',
        body: formData,
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        throw new Error(errorData.error || 'Falha ao fazer upload do arquivo')
      }

      return response.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['youtube-jobs'] })
      queryClient.invalidateQueries({ queryKey: ['music-library'] })
    },
  })
}

export function useYoutubeDownloadStatus(jobId: number | null | undefined) {
  return useQuery<YoutubeJobStatusResponse>({
    queryKey: ['youtube-job-status', jobId],
    queryFn: () => api.get(`/api/biblioteca-musicas/youtube/${jobId}/status`),
    enabled: !!jobId,
    staleTime: 3000,
    gcTime: 60_000,
    refetchInterval: (query) => {
      const status = query.state.data?.status
      if (!status) return false
      if (['completed', 'failed'].includes(status)) return false
      return 5000
    },
  })
}

export function useYoutubeJobs() {
  return useQuery<YoutubeJobSummary[]>({
    queryKey: ['youtube-jobs'],
    queryFn: () => api.get('/api/biblioteca-musicas/youtube/jobs'),
    staleTime: 30_000,
  })
}

export function useCancelarYoutubeJob() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (jobId: number) =>
      api.delete(`/api/biblioteca-musicas/youtube/${jobId}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['youtube-jobs'] })
    },
  })
}
