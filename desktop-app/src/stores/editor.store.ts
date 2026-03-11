import { create } from 'zustand'
import { cloneKonvaDocument, getCurrentPage } from '@/lib/editor/document'
import type { KonvaPage, KonvaTemplateDocument, Layer } from '@/types/template'
import { useHistoryStore } from './history.store'

interface ViewportState {
  x: number
  y: number
}

interface SetDocumentOptions {
  preserveViewport?: boolean
  resetHistory?: boolean
}

interface EditorState {
  document: KonvaTemplateDocument | null
  selectedLayerIds: string[]
  zoom: number
  pan: ViewportState
  setDocument: (document: KonvaTemplateDocument, options?: SetDocumentOptions) => void
  updateDocument: (updater: (document: KonvaTemplateDocument) => KonvaTemplateDocument, recordHistory?: boolean) => void
  setDocumentName: (name: string) => void
  replaceDocumentWithoutHistory: (document: KonvaTemplateDocument, preserveViewport?: boolean) => void
  updateCurrentPage: (updater: (page: KonvaPage) => KonvaPage, recordHistory?: boolean) => void
  updateLayer: (layerId: string, updater: (layer: Layer) => Layer, recordHistory?: boolean) => void
  updateSelectedLayers: (updater: (layer: Layer) => Layer) => void
  addLayer: (layer: Layer) => void
  removeLayer: (layerId: string) => void
  removeSelectedLayers: () => void
  reorderLayer: (layerId: string, direction: 'forward' | 'backward' | 'front' | 'back') => void
  toggleLayerVisibility: (layerId: string) => void
  toggleLayerLock: (layerId: string) => void
  selectLayer: (layerId: string, additive?: boolean) => void
  setSelectedLayers: (layerIds: string[]) => void
  clearSelection: () => void
  setCurrentPageId: (pageId: string) => void
  setZoom: (zoom: number) => void
  setPan: (pan: ViewportState) => void
  resetViewport: () => void
  undo: () => void
  redo: () => void
}

function markDocumentDirty(document: KonvaTemplateDocument): KonvaTemplateDocument {
  return {
    ...document,
    meta: {
      ...document.meta,
      updatedAt: new Date().toISOString(),
      isDirty: true,
    },
  }
}

function updateCurrentPageDocument(
  document: KonvaTemplateDocument,
  updater: (page: KonvaPage) => KonvaPage,
): KonvaTemplateDocument {
  return {
    ...document,
    design: {
      ...document.design,
      pages: document.design.pages.map((page) =>
        page.id === document.design.currentPageId ? updater(page) : page,
      ),
    },
  }
}

function applyDocumentMutation(
  current: KonvaTemplateDocument | null,
  updater: (document: KonvaTemplateDocument) => KonvaTemplateDocument,
  recordHistory = true,
): KonvaTemplateDocument | null {
  if (!current) {
    return null
  }

  if (recordHistory) {
    useHistoryStore.getState().record(current)
  }

  return markDocumentDirty(updater(cloneKonvaDocument(current)))
}

export const useEditorStore = create<EditorState>((set, get) => ({
  document: null,
  selectedLayerIds: [],
  zoom: 0.45,
  pan: { x: 0, y: 0 },

  setDocument: (document, options) => {
    const nextDocument = cloneKonvaDocument(document)
    if (options?.resetHistory !== false) {
      useHistoryStore.getState().reset(nextDocument)
    }

    set((state) => ({
      document: nextDocument,
      selectedLayerIds: [],
      zoom: options?.preserveViewport ? state.zoom : 0.45,
      pan: options?.preserveViewport ? state.pan : { x: 0, y: 0 },
    }))
  },

  updateDocument: (updater, recordHistory = true) =>
    set((state) => ({
      document: applyDocumentMutation(state.document, updater, recordHistory),
    })),

  setDocumentName: (name) =>
    set((state) => ({
      document: state.document
        ? markDocumentDirty({
            ...state.document,
            name,
          })
        : state.document,
    })),

  replaceDocumentWithoutHistory: (document, preserveViewport = true) =>
    set((state) => ({
      document: cloneKonvaDocument(document),
      selectedLayerIds: [],
      zoom: preserveViewport ? state.zoom : 0.45,
      pan: preserveViewport ? state.pan : { x: 0, y: 0 },
    })),

  updateCurrentPage: (updater, recordHistory = true) =>
    set((state) => ({
      document: applyDocumentMutation(
        state.document,
        (document) => updateCurrentPageDocument(document, updater),
        recordHistory,
      ),
    })),

  updateLayer: (layerId, updater, recordHistory = true) =>
    set((state) => ({
      document: applyDocumentMutation(
        state.document,
        (document) =>
          updateCurrentPageDocument(document, (page) => ({
            ...page,
            layers: page.layers.map((layer) => (layer.id === layerId ? updater(layer) : layer)),
          })),
        recordHistory,
      ),
    })),

  updateSelectedLayers: (updater) =>
    set((state) => {
      const selected = new Set(state.selectedLayerIds)
      return {
        document: applyDocumentMutation(
          state.document,
          (document) =>
            updateCurrentPageDocument(document, (page) => ({
              ...page,
              layers: page.layers.map((layer) => (selected.has(layer.id) ? updater(layer) : layer)),
            })),
          true,
        ),
      }
    }),

  addLayer: (layer) =>
    set((state) => ({
      document: applyDocumentMutation(
        state.document,
        (document) =>
          updateCurrentPageDocument(document, (page) => ({
            ...page,
            layers:
              layer.type === 'image' && layer.role === 'background'
                ? [layer, ...page.layers]
                : [...page.layers, layer],
          })),
        true,
      ),
      selectedLayerIds: [layer.id],
    })),

  removeLayer: (layerId) =>
    set((state) => ({
      document: applyDocumentMutation(
        state.document,
        (document) =>
          updateCurrentPageDocument(document, (page) => ({
            ...page,
            layers: page.layers.filter((layer) => layer.id !== layerId),
          })),
        true,
      ),
      selectedLayerIds: state.selectedLayerIds.filter((selectedLayerId) => selectedLayerId !== layerId),
    })),

  removeSelectedLayers: () =>
    set((state) => {
      const selected = new Set(state.selectedLayerIds)
      return {
        document: applyDocumentMutation(
          state.document,
          (document) =>
            updateCurrentPageDocument(document, (page) => ({
              ...page,
              layers: page.layers.filter((layer) => !selected.has(layer.id)),
            })),
          true,
        ),
        selectedLayerIds: [],
      }
    }),

  reorderLayer: (layerId, direction) =>
    set((state) => ({
      document: applyDocumentMutation(
        state.document,
        (document) =>
          updateCurrentPageDocument(document, (page) => {
            const layers = [...page.layers]
            const index = layers.findIndex((layer) => layer.id === layerId)
            if (index === -1) {
              return page
            }

            const [layer] = layers.splice(index, 1)
            if (direction === 'front') {
              layers.push(layer)
            } else if (direction === 'back') {
              layers.unshift(layer)
            } else {
              const targetIndex =
                direction === 'forward'
                  ? Math.min(layers.length, index + 1)
                  : Math.max(0, index - 1)
              layers.splice(targetIndex, 0, layer)
            }

            return {
              ...page,
              layers,
            }
          }),
        true,
      ),
    })),

  toggleLayerVisibility: (layerId) =>
    get().updateLayer(layerId, (layer) => ({ ...layer, visible: layer.visible === false ? true : !layer.visible })),

  toggleLayerLock: (layerId) =>
    get().updateLayer(layerId, (layer) => ({ ...layer, locked: !layer.locked })),

  selectLayer: (layerId, additive = false) =>
    set((state) => ({
      selectedLayerIds: additive
        ? state.selectedLayerIds.includes(layerId)
          ? state.selectedLayerIds.filter((currentLayerId) => currentLayerId !== layerId)
          : [...state.selectedLayerIds, layerId]
        : [layerId],
    })),

  setSelectedLayers: (layerIds) => set({ selectedLayerIds: layerIds }),

  clearSelection: () => set({ selectedLayerIds: [] }),

  setCurrentPageId: (pageId) =>
    set((state) => ({
      document: state.document
        ? {
            ...state.document,
            design: {
              ...state.document.design,
              currentPageId: pageId,
            },
          }
        : state.document,
      selectedLayerIds: [],
    })),

  setZoom: (zoom) => set({ zoom }),

  setPan: (pan) => set({ pan }),

  resetViewport: () => set({ zoom: 0.45, pan: { x: 0, y: 0 } }),

  undo: () => {
    const current = get().document
    if (!current) {
      return
    }

    const previous = useHistoryStore.getState().undo(current)
    if (!previous) {
      return
    }

    set({
      document: previous,
      selectedLayerIds: [],
    })
  },

  redo: () => {
    const current = get().document
    if (!current) {
      return
    }

    const next = useHistoryStore.getState().redo(current)
    if (!next) {
      return
    }

    set({
      document: next,
      selectedLayerIds: [],
    })
  },
}))

export function selectCurrentPageState(state: EditorState): KonvaPage | null {
  return getCurrentPage(state.document)
}
