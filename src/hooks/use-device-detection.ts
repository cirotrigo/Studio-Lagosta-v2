/**
 * Hook para detecção de dispositivo e capacidades
 *
 * Fornece informações sobre o dispositivo atual para otimizações
 * adaptativas de performance e UX.
 */

import * as React from 'react'
import {
  isMobileDevice,
  isRetinaDevice,
  isLowEndDevice,
  getPerformanceConfig
} from '@/lib/performance-utils'

export interface DeviceInfo {
  /** Se é dispositivo móvel (iOS/Android) */
  isMobile: boolean
  /** Se é tablet */
  isTablet: boolean
  /** Se tem tela retina/high-DPI */
  isRetina: boolean
  /** Se é dispositivo de baixo desempenho (<=4 cores) */
  isLowEnd: boolean
  /** Se tem suporte a touch */
  hasTouch: boolean
  /** Largura da tela em pixels */
  screenWidth: number
  /** Altura da tela em pixels */
  screenHeight: number
  /** Pixel ratio do dispositivo */
  pixelRatio: number
  /** Número de cores da CPU */
  cpuCores: number
  /** User agent string */
  userAgent: string
  /** Sistema operacional detectado */
  os: 'ios' | 'android' | 'windows' | 'mac' | 'linux' | 'unknown'
  /** Configuração de performance recomendada */
  performanceConfig: ReturnType<typeof getPerformanceConfig>
}

/**
 * Detecta sistema operacional
 */
function detectOS(): DeviceInfo['os'] {
  if (typeof window === 'undefined') return 'unknown'

  const userAgent = navigator.userAgent.toLowerCase()

  if (/iphone|ipad|ipod/.test(userAgent)) return 'ios'
  if (/android/.test(userAgent)) return 'android'
  if (/win/.test(userAgent)) return 'windows'
  if (/mac/.test(userAgent)) return 'mac'
  if (/linux/.test(userAgent)) return 'linux'

  return 'unknown'
}

/**
 * Detecta se é tablet
 */
function detectTablet(): boolean {
  if (typeof window === 'undefined') return false

  const userAgent = navigator.userAgent.toLowerCase()

  // iPad
  if (/ipad/.test(userAgent)) return true

  // Android tablets (heurística: tablet se tela > 7" e tem "tablet" no UA)
  if (/android/.test(userAgent)) {
    // Tablets geralmente não têm "mobile" no user agent
    if (!/mobile/.test(userAgent)) return true
    // Ou tem "tablet" explícito
    if (/tablet/.test(userAgent)) return true
  }

  return false
}

/**
 * Hook de detecção de dispositivo
 *
 * @example
 * const device = useDeviceDetection()
 * if (device.isMobile) {
 *   // Otimizações para mobile
 * }
 */
export function useDeviceDetection(): DeviceInfo {
  const [deviceInfo, setDeviceInfo] = React.useState<DeviceInfo>(() => {
    // Estado inicial (SSR-safe)
    if (typeof window === 'undefined') {
      return {
        isMobile: false,
        isTablet: false,
        isRetina: false,
        isLowEnd: false,
        hasTouch: false,
        screenWidth: 0,
        screenHeight: 0,
        pixelRatio: 1,
        cpuCores: 4,
        userAgent: '',
        os: 'unknown',
        performanceConfig: {
          isMobile: false,
          isRetina: false,
          isLowEnd: false,
          dragThrottleMs: 16,
          transformThrottleMs: 16,
          enableSmartGuides: true,
          enableGrid: true,
          enableShadows: true,
          shouldReducePixelRatio: false,
        },
      }
    }

    // Estado inicial no cliente
    return {
      isMobile: isMobileDevice(),
      isTablet: detectTablet(),
      isRetina: isRetinaDevice(),
      isLowEnd: isLowEndDevice(),
      hasTouch: 'ontouchstart' in window || navigator.maxTouchPoints > 0,
      screenWidth: window.screen.width,
      screenHeight: window.screen.height,
      pixelRatio: window.devicePixelRatio || 1,
      cpuCores: navigator.hardwareConcurrency || 4,
      userAgent: navigator.userAgent,
      os: detectOS(),
      performanceConfig: getPerformanceConfig(),
    }
  })

  React.useEffect(() => {
    // Atualizar em resize (para rotação de tela)
    const handleResize = () => {
      setDeviceInfo({
        isMobile: isMobileDevice(),
        isTablet: detectTablet(),
        isRetina: isRetinaDevice(),
        isLowEnd: isLowEndDevice(),
        hasTouch: 'ontouchstart' in window || navigator.maxTouchPoints > 0,
        screenWidth: window.screen.width,
        screenHeight: window.screen.height,
        pixelRatio: window.devicePixelRatio || 1,
        cpuCores: navigator.hardwareConcurrency || 4,
        userAgent: navigator.userAgent,
        os: detectOS(),
        performanceConfig: getPerformanceConfig(),
      })
    }

    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [])

  return deviceInfo
}

/**
 * Hook simplificado que retorna apenas se é mobile
 */
export function useIsMobile(): boolean {
  const { isMobile } = useDeviceDetection()
  return isMobile
}

/**
 * Hook simplificado que retorna apenas se é tablet
 */
export function useIsTablet(): boolean {
  const { isTablet } = useDeviceDetection()
  return isTablet
}

/**
 * Hook simplificado que retorna configuração de performance
 */
export function usePerformanceConfig() {
  const { performanceConfig } = useDeviceDetection()
  return performanceConfig
}
