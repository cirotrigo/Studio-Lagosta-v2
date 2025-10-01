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
  updatedAt?: string
}

export interface TemplateEditorContextValue {
  templateId: number
  name: string
  setName: (name: string) => void
  type: string
  dimensions: string
  design: DesignData
  setDesign: React.Dispatch<React.SetStateAction<DesignData>>
  selectedLayerId: string | null
  selectLayer: (id: string | null) => void
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
}

const TemplateEditorContext = React.createContext<TemplateEditorContextValue | null>(null)

const DEFAULT_ZOOM = 1

interface TemplateEditorProviderProps {
  template: TemplateResource
  children: React.ReactNode
}

function normalizeLayerOrder(layers: Layer[]): Layer[] {
  return layers
    .map((layer, idx) => ({ ...layer, order: idx }))
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
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
  const [selectedLayerId, setSelectedLayerId] = React.useState<string | null>(
    template.designData.layers?.[0]?.id ?? null,
  )
  const [dirty, setDirty] = React.useState(false)
  const [zoom, setZoomState] = React.useState(DEFAULT_ZOOM)

  // Sync when template prop changes (e.g., refetch)
  React.useEffect(() => {
    setName(template.name)
    setDesign({
      canvas: { ...template.designData.canvas },
      layers: normalizeLayerOrder(template.designData.layers ?? []),
    })
    setDynamicFieldsState(Array.isArray(template.dynamicFields) ? [...template.dynamicFields] : [])
    setSelectedLayerId(template.designData.layers?.[0]?.id ?? null)
    setDirty(false)
  }, [template.id, template.updatedAt, template.name, template.designData, template.dynamicFields])

  const setZoom = React.useCallback((value: number) => {
    setZoomState(Math.min(2, Math.max(0.25, Number.isFinite(value) ? value : DEFAULT_ZOOM)))
  }, [])

  const zoomIn = React.useCallback(() => setZoomState((prev) => Math.min(prev + 0.1, 2)), [])
  const zoomOut = React.useCallback(() => setZoomState((prev) => Math.max(prev - 0.1, 0.25)), [])

  const selectLayer = React.useCallback((id: string | null) => {
    setSelectedLayerId(id)
  }, [])

  const updateLayer = React.useCallback(
    (id: string, updater: (layer: Layer) => Layer) => {
      setDesign((prev) => {
        let changed = false
        const nextLayers = prev.layers.map((layer) => {
          if (layer.id !== id) return layer
          const next = updater(layer)
          if (next !== layer) changed = true
          return next
        })
        if (!changed) return prev
        setDirty(true)
        return { ...prev, layers: normalizeLayerOrder(nextLayers) }
      })
    },
    [],
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
      setDesign((prev) => {
        const nextLayers = normalizeLayerOrder([...prev.layers, layer])
        setDirty(true)
        return { ...prev, layers: nextLayers }
      })
      setSelectedLayerId(layer.id)
    },
    [],
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
      setDesign((prev) => {
        const nextLayers = prev.layers.filter((layer) => layer.id !== id)
        setDirty(true)
        return { ...prev, layers: normalizeLayerOrder(nextLayers) }
      })
      setSelectedLayerId((current) => (current === id ? null : current))
    },
    [],
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
      setDesign((prev) => {
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
        setDirty(true)
        return { ...prev, layers: normalized }
      })
    },
    [],
  )

  const updateCanvas = React.useCallback((canvas: Partial<DesignData['canvas']>) => {
    setDesign((prev) => {
      setDirty(true)
      return { ...prev, canvas: { ...prev.canvas, ...canvas } }
    })
  }, [])

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

  const value = React.useMemo<TemplateEditorContextValue>(
    () => ({
      templateId: template.id,
      name,
      setName: (next) => {
        setName(next)
        setDirty(true)
      },
      type: template.type,
      dimensions: template.dimensions,
      design,
      setDesign,
      selectedLayerId,
      selectLayer,
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
    }),
    [template.id, template.type, template.dimensions, design, selectedLayerId, selectLayer, updateLayer, updateLayerPartial, updateLayerStyle, moveLayer, addLayer, duplicateLayer, removeLayer, toggleLayerVisibility, toggleLayerLock, reorderLayers, updateCanvas, dynamicFields, dirty, markSaved, zoom, setZoom, zoomIn, zoomOut, name],
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
          gradientAngle: 90,
          gradientStops: [
            { color: '#FF7A18', position: 0 },
            { color: '#AF002D', position: 1 },
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
        },
        fileUrl: '',
      }
    default:
      return base
  }
}
