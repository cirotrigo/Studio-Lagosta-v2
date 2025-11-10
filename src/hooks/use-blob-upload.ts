"use client"

import * as React from 'react'
import { upload } from '@vercel/blob/client'

export interface UploadProgress {
  loaded: number
  total: number
  percentage: number
}

export interface UseBlobUploadOptions {
  onProgress?: (progress: UploadProgress) => void
  onSuccess?: (url: string) => void
  onError?: (error: Error) => void
}

export interface UseBlobUploadResult {
  upload: (file: File) => Promise<string>
  isUploading: boolean
  progress: UploadProgress | null
  error: Error | null
  reset: () => void
}

/**
 * Hook para fazer upload direto ao Vercel Blob (client-side)
 * Elimina o limite de 4.5MB das Serverless Functions
 *
 * @example
 * const { upload, isUploading, progress } = useBlobUpload({
 *   onSuccess: (url) => console.log('Upload completo:', url),
 *   onError: (error) => console.error('Erro:', error),
 * })
 *
 * await upload(file)
 */
export function useBlobUpload(options?: UseBlobUploadOptions): UseBlobUploadResult {
  const [isUploading, setIsUploading] = React.useState(false)
  const [progress, setProgress] = React.useState<UploadProgress | null>(null)
  const [error, setError] = React.useState<Error | null>(null)

  const uploadFile = React.useCallback(
    async (file: File): Promise<string> => {
      setIsUploading(true)
      setProgress({ loaded: 0, total: file.size, percentage: 0 })
      setError(null)

      try {
        const newBlob = await upload(file.name, file, {
          access: 'public',
          handleUploadUrl: '/api/upload/signed-url',
          clientPayload: JSON.stringify({
            fileName: file.name,
            fileType: file.type,
            fileSize: file.size,
          }),
          onUploadProgress: (progressEvent) => {
            const percentage = Math.round((progressEvent.loaded / progressEvent.total) * 100)
            const progressData: UploadProgress = {
              loaded: progressEvent.loaded,
              total: progressEvent.total,
              percentage,
            }
            setProgress(progressData)
            options?.onProgress?.(progressData)
          },
        })

        setIsUploading(false)
        setProgress({ loaded: file.size, total: file.size, percentage: 100 })
        options?.onSuccess?.(newBlob.url)

        return newBlob.url
      } catch (err) {
        const uploadError = err instanceof Error ? err : new Error('Upload failed')
        setError(uploadError)
        setIsUploading(false)
        options?.onError?.(uploadError)
        throw uploadError
      }
    },
    [options]
  )

  const reset = React.useCallback(() => {
    setIsUploading(false)
    setProgress(null)
    setError(null)
  }, [])

  return {
    upload: uploadFile,
    isUploading,
    progress,
    error,
    reset,
  }
}
