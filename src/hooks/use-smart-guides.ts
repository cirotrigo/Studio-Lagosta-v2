import { useState, useCallback } from 'react'
import type { SnapConfig } from '@/lib/konva-smart-guides'
import { DEFAULT_SNAP_CONFIG } from '@/lib/konva-smart-guides'

/**
 * Hook para gerenciar configurações de Smart Guides
 *
 * @example
 * ```tsx
 * const { config, updateConfig, toggleEnabled, setThreshold } = useSmartGuides()
 *
 * // Usar no drag handler
 * const result = computeAlignmentGuides(moving, others, width, height, config)
 * ```
 */
export function useSmartGuides(initialConfig?: Partial<SnapConfig>) {
  const [config, setConfig] = useState<SnapConfig>({
    ...DEFAULT_SNAP_CONFIG,
    ...initialConfig,
  })

  const updateConfig = useCallback((updates: Partial<SnapConfig>) => {
    setConfig((prev) => ({ ...prev, ...updates }))
  }, [])

  const toggleEnabled = useCallback(() => {
    setConfig((prev) => ({ ...prev, enabled: !prev.enabled }))
  }, [])

  const toggleSnapToStage = useCallback(() => {
    setConfig((prev) => ({ ...prev, snapToStage: !prev.snapToStage }))
  }, [])

  const toggleSnapToObjects = useCallback(() => {
    setConfig((prev) => ({ ...prev, snapToObjects: !prev.snapToObjects }))
  }, [])

  const toggleShowGuides = useCallback(() => {
    setConfig((prev) => ({ ...prev, showGuides: !prev.showGuides }))
  }, [])

  const toggleShowDimensions = useCallback(() => {
    setConfig((prev) => ({ ...prev, showDimensions: !prev.showDimensions }))
  }, [])

  const setThreshold = useCallback((threshold: number) => {
    setConfig((prev) => ({ ...prev, threshold }))
  }, [])

  const setGuideColor = useCallback((guideColor: string) => {
    setConfig((prev) => ({ ...prev, guideColor }))
  }, [])

  const resetConfig = useCallback(() => {
    setConfig({ ...DEFAULT_SNAP_CONFIG, ...initialConfig })
  }, [initialConfig])

  return {
    config,
    updateConfig,
    toggleEnabled,
    toggleSnapToStage,
    toggleSnapToObjects,
    toggleShowGuides,
    toggleShowDimensions,
    setThreshold,
    setGuideColor,
    resetConfig,
  }
}
