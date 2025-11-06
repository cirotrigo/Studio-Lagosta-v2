import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api-client'

interface SiteConfig {
  name: string
  shortName: string
  description: string
  logo: {
    light: string
    dark: string
  }
  icons?: {
    favicon?: string
    apple?: string
  }
}

/**
 * Hook para obter configurações do site no client-side
 * Busca do endpoint público de site settings
 */
export function useSiteConfig() {
  return useQuery<SiteConfig>({
    queryKey: ['site-config'],
    queryFn: async (): Promise<SiteConfig> => {
      try {
        const settings = await api.get<SiteConfig>('/api/site-config')
        return settings
      } catch (_error) {
        // Fallback para configurações padrão
        return {
          name: 'Studio Lagosta',
          shortName: 'Studio Lagosta',
          description: 'Plataforma de criação de conteúdo visual',
          logo: {
            light: '/logo-light.svg',
            dark: '/logo-dark.svg',
          },
          icons: {
            favicon: '/favicon.svg',
          }
        }
      }
    },
    staleTime: 10 * 60_000, // 10 minutos
    gcTime: 30 * 60_000, // 30 minutos
  })
}
