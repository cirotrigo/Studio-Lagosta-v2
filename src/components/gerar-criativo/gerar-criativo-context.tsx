'use client'

import { createContext, useContext, useState, useCallback, type ReactNode } from 'react'
import type { Layer } from '@/types/template'
import type { ImageSource } from '@/lib/ai-creative-generator/layout-types'

// Generate UUID that works in non-secure contexts (HTTP)
function generateId(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID()
  }
  // Fallback for non-secure contexts
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0
    const v = c === 'x' ? r : (r & 0x3) | 0x8
    return v.toString(16)
  })
}

interface GeneratedCreative {
  id: string
  resultUrl: string
}

interface GerarCriativoState {
  // Step 1
  selectedProjectId: number | null
  // Step 2
  selectedTemplateId: number | null
  // Step 3
  selectedModelPageId: string | null
  layers: Layer[]
  // Step 4
  imageValues: Record<string, ImageSource>
  // Step 5
  textValues: Record<string, string>
  selectedLayerId: string | null
  hiddenLayerIds: Set<string>
  // Step 6 (result)
  generatedCreative: GeneratedCreative | null
}

interface GerarCriativoContextValue extends GerarCriativoState {
  // Step 1 (unified selection)
  selectModelPageWithContext: (projectId: number, templateId: number, pageId: string, layers: Layer[]) => void
  // Legacy (kept for compatibility)
  selectProject: (projectId: number) => void
  selectTemplate: (templateId: number) => void
  selectModelPage: (pageId: string, layers: Layer[]) => void
  // Step 4
  setImageValue: (layerId: string, imageSource: ImageSource | null) => void
  // Step 5
  setTextValue: (layerId: string, text: string) => void
  selectLayer: (layerId: string | null) => void
  reorderLayers: (newOrder: string[]) => void
  addBgRemovedLayer: (originalLayerId: string, newImageUrl: string) => void
  deleteLayer: (layerId: string) => void
  toggleLayerVisibility: (layerId: string) => void
  // Step 6
  setGeneratedCreative: (creative: GeneratedCreative) => void
  // Reset
  reset: () => void
}

const initialState: GerarCriativoState = {
  selectedProjectId: null,
  selectedTemplateId: null,
  selectedModelPageId: null,
  layers: [],
  imageValues: {},
  textValues: {},
  selectedLayerId: null,
  hiddenLayerIds: new Set(),
  generatedCreative: null,
}

const GerarCriativoContext = createContext<GerarCriativoContextValue | null>(null)

export function GerarCriativoProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<GerarCriativoState>(initialState)

  const selectProject = useCallback((projectId: number) => {
    setState((prev) => ({
      ...prev,
      selectedProjectId: projectId,
      // Reset downstream selections
      selectedTemplateId: null,
      selectedModelPageId: null,
      layers: [],
      imageValues: {},
      textValues: {},
      selectedLayerId: null,
      hiddenLayerIds: new Set(),
      generatedCreative: null,
    }))
  }, [])

  const selectTemplate = useCallback((templateId: number) => {
    setState((prev) => ({
      ...prev,
      selectedTemplateId: templateId,
      // Reset downstream selections
      selectedModelPageId: null,
      layers: [],
      imageValues: {},
      textValues: {},
      selectedLayerId: null,
      hiddenLayerIds: new Set(),
      generatedCreative: null,
    }))
  }, [])

  const selectModelPage = useCallback((pageId: string, layers: Layer[]) => {
    setState((prev) => ({
      ...prev,
      selectedModelPageId: pageId,
      layers,
      // Reset downstream selections
      imageValues: {},
      textValues: {},
      selectedLayerId: null,
      hiddenLayerIds: new Set(),
      generatedCreative: null,
    }))
  }, [])

  const selectModelPageWithContext = useCallback(
    (projectId: number, templateId: number, pageId: string, layers: Layer[]) => {
      setState({
        selectedProjectId: projectId,
        selectedTemplateId: templateId,
        selectedModelPageId: pageId,
        layers,
        imageValues: {},
        textValues: {},
        selectedLayerId: null,
        hiddenLayerIds: new Set(),
        generatedCreative: null,
      })
    },
    []
  )

  const setImageValue = useCallback((layerId: string, imageSource: ImageSource | null) => {
    setState((prev) => {
      const newImageValues = { ...prev.imageValues }
      if (imageSource === null) {
        delete newImageValues[layerId]
      } else {
        newImageValues[layerId] = imageSource
      }
      return { ...prev, imageValues: newImageValues }
    })
  }, [])

  const setTextValue = useCallback((layerId: string, text: string) => {
    setState((prev) => ({
      ...prev,
      textValues: { ...prev.textValues, [layerId]: text },
    }))
  }, [])

  const selectLayer = useCallback((layerId: string | null) => {
    setState((prev) => ({
      ...prev,
      selectedLayerId: layerId,
    }))
  }, [])

  const reorderLayers = useCallback((newOrder: string[]) => {
    setState((prev) => {
      const layerMap = new Map(prev.layers.map((l) => [l.id, l]))
      const reorderedLayers = newOrder
        .map((id) => layerMap.get(id))
        .filter((l): l is Layer => l !== undefined)
      return { ...prev, layers: reorderedLayers }
    })
  }, [])

  const addBgRemovedLayer = useCallback((originalLayerId: string, newImageUrl: string) => {
    setState((prev) => {
      const originalLayer = prev.layers.find((l) => l.id === originalLayerId)
      if (!originalLayer || originalLayer.type !== 'image') {
        return prev
      }

      const originalIndex = prev.layers.findIndex((l) => l.id === originalLayerId)

      const newLayer: Layer = {
        id: generateId(),
        name: `${originalLayer.name} (sem fundo)`,
        type: 'image',
        fileUrl: newImageUrl,
        visible: true,
        locked: false,
        order: originalLayer.order + 0.5,
        position: { ...originalLayer.position },
        size: { ...originalLayer.size },
        rotation: originalLayer.rotation,
        isDynamic: false,
        metadata: {
          isBackgroundRemoved: true,
          originalLayerId,
        },
      }

      const newLayers = [
        ...prev.layers.slice(0, originalIndex + 1),
        newLayer,
        ...prev.layers.slice(originalIndex + 1),
      ]

      return {
        ...prev,
        layers: newLayers,
        selectedLayerId: newLayer.id,
      }
    })
  }, [])

  const deleteLayer = useCallback((layerId: string) => {
    setState((prev) => ({
      ...prev,
      layers: prev.layers.filter((l) => l.id !== layerId),
      selectedLayerId: prev.selectedLayerId === layerId ? null : prev.selectedLayerId,
    }))
  }, [])

  const toggleLayerVisibility = useCallback((layerId: string) => {
    setState((prev) => {
      const newHidden = new Set(prev.hiddenLayerIds)
      if (newHidden.has(layerId)) {
        newHidden.delete(layerId)
      } else {
        newHidden.add(layerId)
      }
      return { ...prev, hiddenLayerIds: newHidden }
    })
  }, [])

  const setGeneratedCreative = useCallback((creative: GeneratedCreative) => {
    setState((prev) => ({
      ...prev,
      generatedCreative: creative,
    }))
  }, [])

  const reset = useCallback(() => {
    setState(initialState)
  }, [])

  const value: GerarCriativoContextValue = {
    ...state,
    selectModelPageWithContext,
    selectProject,
    selectTemplate,
    selectModelPage,
    setImageValue,
    setTextValue,
    selectLayer,
    reorderLayers,
    addBgRemovedLayer,
    deleteLayer,
    toggleLayerVisibility,
    setGeneratedCreative,
    reset,
  }

  return (
    <GerarCriativoContext.Provider value={value}>{children}</GerarCriativoContext.Provider>
  )
}

export function useGerarCriativo() {
  const context = useContext(GerarCriativoContext)
  if (!context) {
    throw new Error('useGerarCriativo must be used within a GerarCriativoProvider')
  }
  return context
}
