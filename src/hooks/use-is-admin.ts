import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api-client'

interface AdminCheckResponse {
  isAdmin: boolean
}

/**
 * Resolve se o usuário atual é admin do site (não org admin).
 * Cache de 5min, default false enquanto carrega — componentes que mostram
 * itens condicionais simplesmente não exibem até a resposta voltar.
 */
export function useIsAdmin() {
  const query = useQuery<AdminCheckResponse>({
    queryKey: ['admin-check'],
    queryFn: () => api.get<AdminCheckResponse>('/api/admin/me'),
    staleTime: 5 * 60_000,
    gcTime: 10 * 60_000,
  })

  return {
    isAdmin: query.data?.isAdmin ?? false,
    isLoading: query.isLoading,
  }
}
