import { useState, useEffect, useCallback } from 'react'
import { toast } from 'sonner'
import { useImageQueueStore } from '@/stores/image-queue.store'

interface UseNetworkStatusReturn {
  isOnline: boolean
}

export function useNetworkStatus(): UseNetworkStatusReturn {
  const [isOnline, setIsOnline] = useState(
    typeof navigator !== 'undefined' ? navigator.onLine : true
  )

  const store = useImageQueueStore()

  const handleOnline = useCallback(() => {
    setIsOnline(true)

    // Resume queue if it was paused due to offline
    if (store.pauseReason === 'offline') {
      store.resumeQueue()
      toast.success('Conexao restaurada. Fila retomada.')
    }
  }, [store])

  const handleOffline = useCallback(() => {
    setIsOnline(false)

    // Pause queue
    store.pauseQueue('offline')
    toast.warning('Conexao perdida. Fila pausada.')
  }, [store])

  useEffect(() => {
    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)

    return () => {
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
    }
  }, [handleOnline, handleOffline])

  return { isOnline }
}
