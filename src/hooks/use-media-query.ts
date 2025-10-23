"use client"

import * as React from 'react'

/**
 * Hook para detectar media queries de forma responsiva
 * Usado para adaptar a UI entre desktop e mobile
 *
 * @param query - Media query CSS (ex: "(max-width: 768px)")
 * @returns boolean indicando se a query corresponde
 *
 * @example
 * ```ts
 * const isMobile = useMediaQuery('(max-width: 768px)')
 * const isTablet = useMediaQuery('(min-width: 768px) and (max-width: 1024px)')
 * ```
 */
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = React.useState(false)

  React.useEffect(() => {
    // Verificar se window está disponível (client-side)
    if (typeof window === 'undefined') {
      return
    }

    const mediaQuery = window.matchMedia(query)

    // Atualizar estado inicial
    setMatches(mediaQuery.matches)

    // Handler para mudanças
    const handleChange = (event: MediaQueryListEvent) => {
      setMatches(event.matches)
    }

    // Adicionar listener
    // Usar addEventListener para compatibilidade moderna
    mediaQuery.addEventListener('change', handleChange)

    // Cleanup
    return () => {
      mediaQuery.removeEventListener('change', handleChange)
    }
  }, [query])

  return matches
}

/**
 * Hook conveniente para detectar dispositivos mobile
 * Define mobile como viewports com largura <= 768px
 *
 * @returns boolean indicando se está em mobile
 */
export function useIsMobile(): boolean {
  return useMediaQuery('(max-width: 768px)')
}

/**
 * Hook para detectar tablets
 * Define tablet como viewports entre 768px e 1024px
 *
 * @returns boolean indicando se está em tablet
 */
export function useIsTablet(): boolean {
  return useMediaQuery('(min-width: 768px) and (max-width: 1024px)')
}

/**
 * Hook para detectar desktop
 * Define desktop como viewports com largura > 1024px
 *
 * @returns boolean indicando se está em desktop
 */
export function useIsDesktop(): boolean {
  return useMediaQuery('(min-width: 1025px)')
}
