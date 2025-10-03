"use client"

import * as React from 'react'
import type { DesignData, DynamicField, Layer } from '@/types/template'
import { FONT_CONFIG } from '@/lib/font-config'

export interface TemplateResource {
  id: number
  name: string
  type: string
  dimensions: string
  designData: DesignData
  dynamicFields: DynamicField[] | null
  projectId: number
  updatedAt?: string
}

export interface TemplateEditorContextValue {
  templateId: number
  projectId: number
  name: string
  setName: (name: string) => void
  type: string
  dimensions: string
  design: DesignData
  setDesign: React.Dispatch<React.SetStateAction<DesignData>>
  selectedLayerIds: string[]
  selectedLayerId: string | null
  selectLayer: (id: string | null, options?: { additive?: boolean; toggle?: boolean }) => void
  selectLayers: (ids: string[]) => void
  toggleLayerSelection: (id: string) => void
  clearLayerSelection: () => void
  updateLayer: (id: string, updater: (layer: Layer) => Layer) => void
  updateLayerPartial: (id: string, partial: Partial<Layer>) => void
  updateLayerStyle: (id: string, style: Layer['style']) => void
  moveLayer: (id: string, deltaX: number, deltaY: number) => void
  addLayer: (layer: Layer) => void
  duplicateLayer: (id: string) => void
  removeLayer: (id: string) => void
  toggleLayerVisibility: (id: string) => void
  toggleLayerLock: (id: string) => void
  reorderLayers: (idsInOrder: string[]) => void
  updateCanvas: (canvas: Partial<DesignData['canvas']>) => void
  dynamicFields: DynamicField[]
  setDynamicFields: React.Dispatch<React.SetStateAction<DynamicField[]>>
  dirty: boolean
  markSaved: (nextTemplate?: Partial<TemplateResource>) => void
  zoom: number
  setZoom: (value: number) => void
  zoomIn: () => void
  zoomOut: () => void
  copySelectedLayers: () => void
  pasteLayers: () => void
  undo: () => void
  redo: () => void
  canUndo: boolean
  canRedo: boolean
  loadTemplate: (payload: {
    designData: DesignData
    dynamicFields?: DynamicField[] | null
    name?: string
  }) => void
}

const TemplateEditorContext = React.createContext<TemplateEditorContextValue | null>(null)

const DEFAULT_ZOOM = 0.3

interface TemplateEditorProviderProps {
  template: TemplateResource
  children: React.ReactNode
}

function normalizeLayerOrder(layers: Layer[]): Layer[] {
  return layers
    .map((layer, idx) => ({ ...layer, order: idx }))
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
}

function cloneDesign(design: DesignData): DesignData {
  if (typeof structuredClone === 'function') {
    return structuredClone(design)
  }
  return JSON.parse(JSON.stringify(design)) as DesignData
}

export function TemplateEditorProvider({ template, children }: TemplateEditorProviderProps) {
  const [name, setName] = React.useState(template.name)
  const [design, setDesign] = React.useState<DesignData>(() => ({
    canvas: { ...template.designData.canvas },
    layers: normalizeLayerOrder(template.designData.layers ?? []),
  }))
  const [dynamicFields, setDynamicFieldsState] = React.useState<DynamicField[]>(() =>
    Array.isArray(template.dynamicFields) ? [...template.dynamicFields] : [],
  )
  const [selectedLayerIds, setSelectedLayerIds] = React.useState<string[]>(() => {
    const firstId = template.designData.layers?.[0]?.id
    return firstId ? [firstId] : []
  })
  const [dirty, setDirty] = React.useState(false)
  const [zoom, setZoomState] = React.useState(DEFAULT_ZOOM)
  const historyRef = React.useRef<{ past: DesignData[]; future: DesignData[] }>({ past: [], future: [] })
  const [historyMeta, setHistoryMeta] = React.useState<{ canUndo: boolean; canRedo: boolean }>({ canUndo: false, canRedo: false })
  const clipboardRef = React.useRef<Layer[] | null>(null)

  // Sync when template prop changes (e.g., refetch)
  React.useEffect(() => {
    setName(template.name)
    setDesign({
      canvas: { ...template.designData.canvas },
      layers: normalizeLayerOrder(template.designData.layers ?? []),
    })
    setDynamicFieldsState(Array.isArray(template.dynamicFields) ? [...template.dynamicFields] : [])
    const firstId = template.designData.layers?.[0]?.id
    setSelectedLayerIds(firstId ? [firstId] : [])
    setDirty(false)
    setZoomState(DEFAULT_ZOOM)
    historyRef.current = { past: [], future: [] }
    setHistoryMeta({ canUndo: false, canRedo: false })
  }, [template.id, template.updatedAt, template.name, template.designData, template.dynamicFields])

  const updateHistoryMeta = React.useCallback(() => {
    setHistoryMeta({
      canUndo: historyRef.current.past.length > 0,
      canRedo: historyRef.current.future.length > 0,
    })
  }, [])

  const setZoom = React.useCallback((value: number) => {
    setZoomState(Math.min(2, Math.max(0.25, Number.isFinite(value) ? value : DEFAULT_ZOOM)))
  }, [])

  const zoomIn = React.useCallback(() => setZoomState((prev) => Math.min(prev + 0.1, 2)), [])
  const zoomOut = React.useCallback(() => setZoomState((prev) => Math.max(prev - 0.1, 0.25)), [])

  const applyDesign = React.useCallback(
    (updater: (prev: DesignData) => DesignData, options?: { skipHistory?: boolean }) => {
      setDesign((prev) => {
        const next = updater(prev)
        if (next === prev) return prev
        if (!options?.skipHistory) {
          const snapshot = cloneDesign(prev)
          historyRef.current.past = [...historyRef.current.past.slice(-49), snapshot]
          historyRef.current.future = []
          setDirty(true)
        }
        updateHistoryMeta()
        return next
      })
    },
    [updateHistoryMeta],
  )

  const selectLayer = React.useCallback((id: string | null, options?: { additive?: boolean; toggle?: boolean }) => {
    if (!id) {
      setSelectedLayerIds([])
      return
    }
    setSelectedLayerIds((prev) => {
      if (options?.additive) {
        const exists = prev.includes(id)
        if (exists) {
          if (options?.toggle) {
            return prev.filter((layerId) => layerId !== id)
          }
          return prev
        }
        return [...prev, id]
      }
      return [id]
    })
  }, [])

  const selectLayers = React.useCallback((ids: string[]) => {
    const unique = Array.from(new Set(ids.filter(Boolean))) as string[]
    setSelectedLayerIds(unique)
  }, [])

  const toggleLayerSelection = React.useCallback((id: string) => {
    setSelectedLayerIds((prev) => (prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]))
  }, [])

  const clearLayerSelection = React.useCallback(() => {
    setSelectedLayerIds([])
  }, [])

  const updateLayer = React.useCallback(
    (id: string, updater: (layer: Layer) => Layer) => {
      applyDesign((prev) => {
        let changed = false
        const nextLayers = prev.layers.map((layer) => {
          if (layer.id !== id) return layer
          const next = updater(layer)
          if (next !== layer) changed = true
          return next
        })
        if (!changed) return prev
        return { ...prev, layers: normalizeLayerOrder(nextLayers) }
      })
    },
    [applyDesign],
  )

  const updateLayerPartial = React.useCallback(
    (id: string, partial: Partial<Layer>) => {
      updateLayer(id, (layer) => ({ ...layer, ...partial }))
    },
    [updateLayer],
  )

  const updateLayerStyle = React.useCallback(
    (id: string, style: Layer['style']) => {
      updateLayer(id, (layer) => ({ ...layer, style: { ...layer.style, ...style } }))
    },
    [updateLayer],
  )

  const moveLayer = React.useCallback(
    (id: string, deltaX: number, deltaY: number) => {
      updateLayer(id, (layer) => ({
        ...layer,
        position: {
          x: Math.round((layer.position?.x ?? 0) + deltaX),
          y: Math.round((layer.position?.y ?? 0) + deltaY),
        },
      }))
    },
    [updateLayer],
  )

  const addLayer = React.useCallback(
    (layer: Layer) => {
      applyDesign((prev) => {
        const nextLayers = normalizeLayerOrder([...prev.layers, layer])
        return { ...prev, layers: nextLayers }
      })
      setSelectedLayerIds([layer.id])
    },
    [applyDesign],
  )

  const duplicateLayer = React.useCallback(
    (id: string) => {
      const source = design.layers.find((layer) => layer.id === id)
      if (!source) return
      const newLayer: Layer = {
        ...source,
        id: crypto.randomUUID(),
        name: `${source.name} Copy`,
        position: {
          x: (source.position?.x ?? 0) + 16,
          y: (source.position?.y ?? 0) + 16,
        },
        locked: false,
      }
      addLayer(newLayer)
    },
    [addLayer, design.layers],
  )

  const removeLayer = React.useCallback(
    (id: string) => {
      applyDesign((prev) => {
        const nextLayers = prev.layers.filter((layer) => layer.id !== id)
        return { ...prev, layers: normalizeLayerOrder(nextLayers) }
      })
      setSelectedLayerIds((prev) => prev.filter((layerId) => layerId !== id))
    },
    [applyDesign],
  )

  const toggleLayerVisibility = React.useCallback(
    (id: string) => {
      updateLayer(id, (layer) => ({ ...layer, visible: layer.visible === false ? true : !layer.visible }))
    },
    [updateLayer],
  )

  const toggleLayerLock = React.useCallback(
    (id: string) => {
      updateLayer(id, (layer) => ({ ...layer, locked: !layer.locked }))
    },
    [updateLayer],
  )

  const reorderLayers = React.useCallback(
    (idsInOrder: string[]) => {
      applyDesign((prev) => {
        const idToLayer = new Map(prev.layers.map((layer) => [layer.id, layer]))
        const nextLayers: Layer[] = []
        idsInOrder.forEach((layerId) => {
          const layer = idToLayer.get(layerId)
          if (layer) nextLayers.push(layer)
        })
        // add any missing layers at the end
        prev.layers.forEach((layer) => {
          if (!idsInOrder.includes(layer.id)) {
            nextLayers.push(layer)
          }
        })
        const normalized = normalizeLayerOrder(nextLayers)
        return { ...prev, layers: normalized }
      })
    },
    [applyDesign],
  )

  const updateCanvas = React.useCallback((canvas: Partial<DesignData['canvas']>) => {
    applyDesign((prev) => ({ ...prev, canvas: { ...prev.canvas, ...canvas } }))
  }, [applyDesign])

  const copySelectedLayers = React.useCallback(() => {
    if (selectedLayerIds.length === 0) return
    const selection = design.layers.filter((layer) => selectedLayerIds.includes(layer.id))
    if (selection.length === 0) return
    clipboardRef.current = selection.map((layer) => {
      try {
        return structuredClone(layer)
      } catch {
        return JSON.parse(JSON.stringify(layer)) as Layer
      }
    })
  }, [design.layers, selectedLayerIds])

  const pasteLayers = React.useCallback(() => {
    const clipboard = clipboardRef.current
    if (!clipboard || clipboard.length === 0) return

    const clones = clipboard.map((layer, index) => {
      const cloned = (() => {
        try {
          return structuredClone(layer)
        } catch {
          return JSON.parse(JSON.stringify(layer)) as Layer
        }
      })()
      const newId = crypto.randomUUID()
      return {
        ...cloned,
        id: newId,
        name: `${cloned.name ?? cloned.type} Copy`,
        locked: false,
        order: 0,
        position: {
          x: Math.round((cloned.position?.x ?? 0) + 24 + index * 12),
          y: Math.round((cloned.position?.y ?? 0) + 24 + index * 12),
        },
      }
    })

    applyDesign((prev) => {
      const nextLayers = normalizeLayerOrder([...prev.layers, ...clones])
      return { ...prev, layers: nextLayers }
    })
    setSelectedLayerIds(clones.map((layer) => layer.id))
  }, [applyDesign])

  const undo = React.useCallback(() => {
    setDesign((prev) => {
      const past = historyRef.current.past
      if (!past.length) return prev
      const previous = past[past.length - 1]
      historyRef.current.past = past.slice(0, -1)
      historyRef.current.future = [cloneDesign(prev), ...historyRef.current.future].slice(0, 50)
      setDirty(true)
      updateHistoryMeta()
      const nextDesign = cloneDesign(previous)
      const existingIds = new Set(nextDesign.layers.map((layer) => layer.id))
      setSelectedLayerIds((current) => {
        const filtered = current.filter((id) => existingIds.has(id))
        if (filtered.length > 0) return filtered
        const first = nextDesign.layers[0]?.id
        return first ? [first] : []
      })
      return nextDesign
    })
  }, [updateHistoryMeta])

  const redo = React.useCallback(() => {
    setDesign((prev) => {
      const future = historyRef.current.future
      if (!future.length) return prev
      const nextState = future[0]
      historyRef.current.future = future.slice(1)
      historyRef.current.past = [...historyRef.current.past.slice(-49), cloneDesign(prev)]
      setDirty(true)
      updateHistoryMeta()
      const nextDesign = cloneDesign(nextState)
      const existingIds = new Set(nextDesign.layers.map((layer) => layer.id))
      setSelectedLayerIds((current) => {
        const filtered = current.filter((id) => existingIds.has(id))
        if (filtered.length > 0) return filtered
        const first = nextDesign.layers[0]?.id
        return first ? [first] : []
      })
      return nextDesign
    })
  }, [updateHistoryMeta])

  const loadTemplate = React.useCallback(
    ({ designData, dynamicFields: nextDynamicFields, name: nextName }: {
      designData: DesignData
      dynamicFields?: DynamicField[] | null
      name?: string
    }) => {
      const clonedDesign: DesignData = cloneDesign(designData)
      clonedDesign.layers = normalizeLayerOrder(clonedDesign.layers ?? [])

      applyDesign(() => clonedDesign, { skipHistory: true })
      historyRef.current = { past: [], future: [] }
      updateHistoryMeta()
      if (Array.isArray(nextDynamicFields)) {
        setDynamicFieldsState([...nextDynamicFields])
      } else {
        setDynamicFieldsState([])
      }
      const firstLayerId = clonedDesign.layers[0]?.id
      setSelectedLayerIds(firstLayerId ? [firstLayerId] : [])
      if (nextName) {
        setName(nextName)
      }
      setDirty(true)
    },
    [applyDesign, updateHistoryMeta],
  )

  const markSaved = React.useCallback((nextTemplate?: Partial<TemplateResource>) => {
    if (nextTemplate?.designData) {
      setDesign({
        canvas: { ...nextTemplate.designData.canvas },
        layers: normalizeLayerOrder(nextTemplate.designData.layers ?? []),
      })
    }
    if (nextTemplate?.name) {
      setName(nextTemplate.name)
    }
    if (nextTemplate?.dynamicFields) {
      setDynamicFieldsState(Array.isArray(nextTemplate.dynamicFields) ? [...nextTemplate.dynamicFields] : [])
    }
    setDirty(false)
  }, [])

  const selectedLayerId = selectedLayerIds[selectedLayerIds.length - 1] ?? null

  const value = React.useMemo<TemplateEditorContextValue>(
    () => ({
      templateId: template.id,
      projectId: template.projectId,
      name,
      setName: (next) => {
        setName(next)
        setDirty(true)
      },
      type: template.type,
      dimensions: template.dimensions,
      design,
      setDesign,
      selectedLayerIds,
      selectedLayerId,
      selectLayer,
      selectLayers,
      toggleLayerSelection,
      clearLayerSelection,
      updateLayer,
      updateLayerPartial,
      updateLayerStyle,
      moveLayer,
      addLayer,
      duplicateLayer,
      removeLayer,
      toggleLayerVisibility,
      toggleLayerLock,
      reorderLayers,
      updateCanvas,
      dynamicFields,
      setDynamicFields: (updater) => {
        setDynamicFieldsState((prev) => {
          const next = typeof updater === 'function' ? (updater as (prev: DynamicField[]) => DynamicField[])(prev) : updater
          setDirty(true)
          return next
        })
      },
      dirty,
      markSaved,
      zoom,
      setZoom,
      zoomIn,
      zoomOut,
      copySelectedLayers,
      pasteLayers,
      loadTemplate,
      undo,
      redo,
      canUndo: historyMeta.canUndo,
      canRedo: historyMeta.canRedo,
    }),
    [
      template.id,
      template.projectId,
      template.type,
      template.dimensions,
      design,
      selectedLayerIds,
      selectedLayerId,
      selectLayer,
      selectLayers,
      toggleLayerSelection,
      clearLayerSelection,
      updateLayer,
      updateLayerPartial,
      updateLayerStyle,
      moveLayer,
      addLayer,
      duplicateLayer,
      removeLayer,
      toggleLayerVisibility,
      toggleLayerLock,
      reorderLayers,
      updateCanvas,
      dynamicFields,
      dirty,
      markSaved,
      zoom,
      setZoom,
      zoomIn,
      zoomOut,
      name,
      copySelectedLayers,
      pasteLayers,
      loadTemplate,
      undo,
      redo,
      historyMeta.canUndo,
      historyMeta.canRedo,
    ],
  )

  return <TemplateEditorContext.Provider value={value}>{children}</TemplateEditorContext.Provider>
}

export function useTemplateEditor() {
  const ctx = React.useContext(TemplateEditorContext)
  if (!ctx) {
    throw new Error('useTemplateEditor must be used within a TemplateEditorProvider')
  }
  return ctx
}

export function createDefaultLayer(type: Layer['type']): Layer {
  const id = crypto.randomUUID()
  const base: Layer = {
    id,
    type,
    name: `${type.charAt(0).toUpperCase() + type.slice(1)} ${id.slice(0, 4)}`,
    visible: true,
    locked: false,
    order: 0,
    position: { x: 100, y: 100 },
    size: { width: 240, height: 120 },
    style: {},
    content: type === 'text' ? 'Texto exemplo' : undefined,
  }

  switch (type) {
    case 'text':
      return {
        ...base,
        style: {
          fontSize: 36,
          fontFamily: FONT_CONFIG.DEFAULT_FONT,
          color: '#111111',
          textAlign: 'left',
          lineHeight: 1.2,
        },
        textboxConfig: {
          textMode: 'auto-wrap-fixed',
          autoWrap: {
            lineHeight: 1.2,
            breakMode: 'word',
            autoExpand: false,
          },
        },
      }
    case 'gradient':
    case 'gradient2':
      return {
        ...base,
        size: { width: 320, height: 320 },
        style: {
          gradientType: 'linear',
          gradientAngle: 180,
          gradientStops: [
            { color: '#000000', position: 0 },
            { color: '#00000000', position: 1 },
          ],
        },
      }
    case 'image':
    case 'logo':
    case 'element':
      return {
        ...base,
        size: { width: 320, height: 320 },
        style: {
          objectFit: 'cover',
          border: { width: 0, color: '#000000', radius: 0 },
          blur: 0,
          brightness: 0,
          contrast: 0,
        },
        fileUrl: '',
      }
    case 'shape':
      return {
        ...base,
        type: 'shape',
        size: { width: 240, height: 240 },
        style: {
          fill: '#2563eb',
          strokeColor: '#1e3a8a',
          strokeWidth: 2,
          shapeType: 'rectangle',
        },
      }
    case 'icon':
      return {
        ...base,
        type: 'icon',
        size: { width: 120, height: 120 },
        style: {
          fill: '#111111',
          strokeWidth: 0,
          iconId: 'star',
        },
        fileUrl: '',
      }
    default:
      return base
  }
}
