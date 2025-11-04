import { useEffect, useRef } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api-client'

interface PostStatusResponse {
  id: string
  status: 'DRAFT' | 'SCHEDULED' | 'POSTING' | 'POSTED' | 'FAILED'
  publishedUrl: string | null
  instagramMediaId: string | null
  bufferId: string | null
  sentAt: string | null
  bufferSentAt: string | null
  failedAt: string | null
  errorMessage: string | null
  postType: string
}

interface UsePostStatusPollingOptions {
  postId: string
  enabled: boolean
  onSuccess?: (publishedUrl: string | null, postType: string) => void
  onFailure?: (errorMessage: string) => void
  maxAttempts?: number
  intervalMs?: number
}

/**
 * Hook for polling post status after publishing
 *
 * Monitors a post's status and calls success/failure callbacks when
 * the post is confirmed as SENT or FAILED by the Buffer webhook.
 *
 * @param postId - ID of the post to monitor
 * @param enabled - Whether polling is active
 * @param onSuccess - Callback when post is successfully published
 * @param onFailure - Callback when post fails
 * @param maxAttempts - Maximum number of polling attempts (default: 30)
 * @param intervalMs - Polling interval in milliseconds (default: 10000 = 10s)
 */
export function usePostStatusPolling({
  postId,
  enabled,
  onSuccess,
  onFailure,
  maxAttempts = 30, // 5 minutes with 10s interval
  intervalMs = 10000, // 10 seconds
}: UsePostStatusPollingOptions) {
  const queryClient = useQueryClient()
  const intervalRef = useRef<NodeJS.Timeout | undefined>(undefined)
  const attemptsRef = useRef(0)

  useEffect(() => {
    // Clear interval if disabled
    if (!enabled) {
      if (intervalRef.current) {
        clearInterval(intervalRef.current)
      }
      return
    }

    // Reset attempts counter
    attemptsRef.current = 0

    // Start polling
    intervalRef.current = setInterval(async () => {
      attemptsRef.current++

      try {
        const status = await api.get<PostStatusResponse>(`/api/posts/${postId}/status`)

        if (status.status === 'POSTED') {
          // ✅ Post published successfully
          console.log(`✅ Post ${postId} published successfully!`, {
            publishedUrl: status.publishedUrl,
            postType: status.postType,
          })

          onSuccess?.(status.publishedUrl, status.postType)

          // Invalidate queries to refresh UI
          queryClient.invalidateQueries({ queryKey: ['posts'] })
          queryClient.invalidateQueries({ queryKey: ['post', postId] })
          queryClient.invalidateQueries({ queryKey: ['agenda-posts'] })

          // Stop polling
          clearInterval(intervalRef.current!)
        } else if (status.status === 'FAILED') {
          // ❌ Post failed
          console.error(`❌ Post ${postId} failed:`, status.errorMessage)

          onFailure?.(status.errorMessage || 'Unknown error')

          // Invalidate queries to refresh UI
          queryClient.invalidateQueries({ queryKey: ['posts'] })
          queryClient.invalidateQueries({ queryKey: ['post', postId] })
          queryClient.invalidateQueries({ queryKey: ['agenda-posts'] })

          // Stop polling
          clearInterval(intervalRef.current!)
        } else if (attemptsRef.current >= maxAttempts) {
          // ⏱️ Timeout
          console.warn(`⏱️ Post ${postId} polling timeout after ${maxAttempts} attempts`)

          onFailure?.('Timeout: Could not confirm post publication')

          // Stop polling
          clearInterval(intervalRef.current!)
        } else {
          // Still processing, continue polling
          console.log(
            `⏳ Post ${postId} still ${status.status} (attempt ${attemptsRef.current}/${maxAttempts})`
          )
        }
      } catch (error) {
        console.error('Error polling post status:', error)

        // Don't stop polling on error, might be temporary network issue
        // Only stop if we reach max attempts
        if (attemptsRef.current >= maxAttempts) {
          onFailure?.('Polling error: Could not fetch post status')
          clearInterval(intervalRef.current!)
        }
      }
    }, intervalMs)

    // Cleanup on unmount
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current)
      }
    }
  }, [enabled, postId, onSuccess, onFailure, queryClient, maxAttempts, intervalMs])
}
