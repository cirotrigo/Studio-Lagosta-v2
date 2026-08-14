import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api-client'

/**
 * Uma arte de referência do projeto — Generation estrelada (`styleRefAt`),
 * como `GET /api/projects/[id]/style-references` devolve, na ordem do RODÍZIO
 * (menos usada primeiro; `proximaDaFila` marca a da vez).
 */
export interface ArteDeReferencia {
  generationId: string
  url: string | null
  marcadaEm: string | null
  ultimoUso: string | null
  proximaDaFila: boolean
}

/**
 * As artes de referência do projeto — consumido pela aba "Artes de referência"
 * e pelo seletor "Base da arte" da fila da bancada. A chave e o shape são UM
 * só de propósito: as duas telas dividem o cache, e uma estrela marcada na
 * galeria aparece no seletor na invalidação seguinte.
 */
export function useArtesDeReferencia(projectId: number, opcoes: { enabled?: boolean } = {}) {
  return useQuery<{ referencias: ArteDeReferencia[] }>({
    queryKey: ['style-references', projectId],
    queryFn: () => api.get(`/api/projects/${projectId}/style-references`),
    enabled: (opcoes.enabled ?? true) && Number.isFinite(projectId) && projectId > 0,
    staleTime: 30_000,
    gcTime: 10 * 60_000,
  })
}
