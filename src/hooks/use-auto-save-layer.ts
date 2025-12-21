import { useRef, useCallback } from 'react'
import { api } from '@/lib/api-client'

export function useAutoSaveLayer(pageId: string | null) {
  const timerRef = useRef<NodeJS.Timeout | undefined>(undefined)

  const autoSave = useCallback(
    async (layerId: string, updates: Record<string, any>) => {
      if (!pageId) return

      clearTimeout(timerRef.current)
      timerRef.current = setTimeout(async () => {
        try {
          await api.patch(`/api/pages/${pageId}/layers/${layerId}`, updates)
          console.log('[Auto-save] Saved layer:', layerId)
        } catch (error) {
          console.error('[Auto-save] Failed:', error)
        }
      }, 2000)
    },
    [pageId]
  )

  return autoSave
}
