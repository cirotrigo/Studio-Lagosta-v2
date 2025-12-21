import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api-client'

interface CreativePageCheck {
  isCreative: boolean
  layoutType?: string
  bindings?: Array<{ fieldName: string; layerId: string }>
}

export function useIsCreativePage(pageId: string | null) {
  return useQuery<CreativePageCheck>({
    queryKey: ['creative-page-check', pageId],
    queryFn: async () => {
      if (!pageId) {
        return { isCreative: false }
      }

      console.log('[useIsCreativePage] Checking page:', pageId)

      try {
        const response = await api.get<CreativePageCheck>(
          `/api/ai/creative-page/${pageId}`
        )
        console.log('[useIsCreativePage] Response:', response)
        return response
      } catch (error) {
        console.log('[useIsCreativePage] Error or not found:', error)
        // Se não encontrar, não é uma página criativa
        return { isCreative: false }
      }
    },
    enabled: !!pageId,
    staleTime: 0, // Sempre revalidar
    gcTime: 5 * 60_000, // 5 minutos
  })
}
