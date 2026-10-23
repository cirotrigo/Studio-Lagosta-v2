import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api-client'

export interface BrandColor {
  id: number
  name: string
  hexCode: string
  projectId: number
}

// `api.get` devolve TEXTO quando a resposta não é JSON — foi assim que um
// redirect para /sign-in (HTML, 200) virou `colors.map is not a function`
// e derrubou o editor inteiro (02/09/2026). Cor de marca é lista ou nada.
export async function buscarPaleta(projectId: number | null | undefined): Promise<BrandColor[]> {
  const data = await api.get<unknown>(`/api/projects/${projectId}/colors`)
  return Array.isArray(data) ? (data as BrandColor[]) : []
}

// Cache único por projeto: a paleta aparece em vários seletores de cor ao
// mesmo tempo (propriedades, efeitos, gradiente) e cada um buscava a própria
// cópia via fetch direto.
export function useBrandColors(projectId: number | null | undefined) {
  return useQuery<BrandColor[]>({
    queryKey: ['brand-colors', projectId],
    queryFn: () => buscarPaleta(projectId),
    enabled: typeof projectId === 'number' && projectId > 0,
    staleTime: 5 * 60_000,
    gcTime: 10 * 60_000,
  })
}

/** A paleta marcada com o projeto que a pediu: a inserção nunca usa a de outro projeto. */
export interface PaletaConfirmada {
  projectId: number
  cores: BrandColor[]
}

/**
 * Variante ESTRITA, só para quem GRAVA cor pela marca (a inserção do painel de formas, CP-V2c): resposta que não é
 * lista (HTML 200) ou cor sem `hexCode` em texto LANÇA, em vez de virar paleta vazia, que gravaria o padrão como se
 * fosse a marca. Key própria sob o prefixo `['brand-colors', id]`: as invalidações da paleta também a renovam, e os
 * consumidores de `useBrandColors` seguem como sempre.
 */
export async function buscarPaletaEstrita(projectId: number): Promise<PaletaConfirmada> {
  const data = await api.get<unknown>(`/api/projects/${projectId}/colors`)
  if (!Array.isArray(data)) throw new Error('A paleta da marca não veio como lista')
  const semHex = data.some((c) => typeof (c as { hexCode?: unknown } | null)?.hexCode !== 'string')
  if (semHex) throw new Error('A paleta da marca tem cor sem hexCode')
  return { projectId, cores: data as BrandColor[] }
}

export function useBrandColorsEstrita(projectId: number) {
  return useQuery<PaletaConfirmada>({
    queryKey: ['brand-colors', projectId, 'estrita'],
    queryFn: () => buscarPaletaEstrita(projectId),
    enabled: projectId > 0,
    staleTime: 5 * 60_000,
    gcTime: 10 * 60_000,
  })
}
