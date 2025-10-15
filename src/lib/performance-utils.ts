/**
 * Performance Utilities
 *
 * Funções auxiliares para otimização de performance,
 * especialmente úteis para dispositivos móveis.
 */

/**
 * Throttle function - limita a taxa de execução de uma função
 *
 * @param func - Função a ser throttled
 * @param wait - Tempo mínimo entre execuções (ms)
 * @returns Função throttled
 *
 * @example
 * const handleMove = throttle((e) => console.log(e), 16) // 60 FPS
 */
export function throttle<T extends (...args: never[]) => unknown>(
  func: T,
  wait: number
): (...args: Parameters<T>) => void {
  let timeout: NodeJS.Timeout | null = null
  let previous = 0

  return function (this: unknown, ...args: Parameters<T>) {
    const now = Date.now()
    const remaining = wait - (now - previous)

    if (remaining <= 0 || remaining > wait) {
      if (timeout) {
        clearTimeout(timeout)
        timeout = null
      }
      previous = now
      func.apply(this, args)
    } else if (!timeout) {
      timeout = setTimeout(() => {
        previous = Date.now()
        timeout = null
        func.apply(this, args)
      }, remaining)
    }
  }
}

/**
 * Debounce function - atrasa execução até que pare de ser chamada
 *
 * @param func - Função a ser debounced
 * @param wait - Tempo de espera (ms)
 * @returns Função debounced
 *
 * @example
 * const handleSearch = debounce((query) => search(query), 300)
 */
export function debounce<T extends (...args: never[]) => unknown>(
  func: T,
  wait: number
): (...args: Parameters<T>) => void {
  let timeout: NodeJS.Timeout | null = null

  return function (this: unknown, ...args: Parameters<T>) {
    if (timeout) clearTimeout(timeout)

    timeout = setTimeout(() => {
      func.apply(this, args)
    }, wait)
  }
}

/**
 * Detecta se é dispositivo móvel
 */
export function isMobileDevice(): boolean {
  if (typeof window === 'undefined') return false
  return /iPhone|iPad|iPod|Android/i.test(navigator.userAgent)
}

/**
 * Detecta se é dispositivo com tela retina
 */
export function isRetinaDevice(): boolean {
  if (typeof window === 'undefined') return false
  return window.devicePixelRatio > 1
}

/**
 * Detecta se é dispositivo de baixo desempenho
 * Considera dispositivos com <=4 cores como low-end
 */
export function isLowEndDevice(): boolean {
  if (typeof navigator === 'undefined') return false
  return navigator.hardwareConcurrency ? navigator.hardwareConcurrency <= 4 : false
}

/**
 * Obtém configuração otimizada de performance baseada no dispositivo
 */
export function getPerformanceConfig() {
  const isMobile = isMobileDevice()
  const isLowEnd = isLowEndDevice()

  return {
    isMobile,
    isRetina: isRetinaDevice(),
    isLowEnd,
    // Throttle mais agressivo em low-end
    dragThrottleMs: isLowEnd ? 32 : 16, // 30 FPS vs 60 FPS
    transformThrottleMs: isLowEnd ? 32 : 16,
    // Desabilitar features pesadas em mobile/low-end
    enableSmartGuides: !isMobile && !isLowEnd,
    enableGrid: !isLowEnd,
    enableShadows: !isLowEnd,
    // Reduzir pixel ratio em mobile retina
    shouldReducePixelRatio: isMobile && isRetinaDevice(),
  }
}
