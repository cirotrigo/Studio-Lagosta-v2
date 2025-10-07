import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api-client'

type CMSMenuItem = {
  id: string
  label: string
  url: string
  target: string | null
  icon: string | null
  order: number
  isVisible: boolean
  children?: CMSMenuItem[]
}

type CMSMenu = {
  id: string
  name: string
  slug: string
  location: string
  isActive: boolean
  items?: CMSMenuItem[]
}

/**
 * Get a menu by location (client-side)
 */
export function useMenuByLocation(location: string) {
  return useQuery<{ menu: CMSMenu | null }>({
    queryKey: ['public', 'menu', location],
    queryFn: () => api.get(`/api/public/menu?location=${location.toUpperCase()}`),
    staleTime: 5 * 60_000, // 5 minutes
    gcTime: 10 * 60_000, // 10 minutes
  })
}
