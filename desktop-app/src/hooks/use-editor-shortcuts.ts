import { useEffect } from 'react'
import { useEditorStore } from '@/stores/editor.store'

const MIN_ZOOM = 0.15
const MAX_ZOOM = 2.5
const ZOOM_STEP = 0.1

export function useEditorShortcuts() {
  const cropMode = useEditorStore((state) => state.cropMode)
  const selectedLayerIds = useEditorStore((state) => state.selectedLayerIds)
  const zoom = useEditorStore((state) => state.zoom)

  const undo = useEditorStore((state) => state.undo)
  const redo = useEditorStore((state) => state.redo)
  const removeSelectedLayers = useEditorStore((state) => state.removeSelectedLayers)
  const duplicateSelectedLayers = useEditorStore((state) => state.duplicateSelectedLayers)
  const selectAllLayers = useEditorStore((state) => state.selectAllLayers)
  const moveSelectedLayers = useEditorStore((state) => state.moveSelectedLayers)
  const toggleSelectedLayersLock = useEditorStore((state) => state.toggleSelectedLayersLock)
  const copyLayers = useEditorStore((state) => state.copyLayers)
  const cutLayers = useEditorStore((state) => state.cutLayers)
  const pasteLayers = useEditorStore((state) => state.pasteLayers)
  const setZoom = useEditorStore((state) => state.setZoom)
  const resetViewport = useEditorStore((state) => state.resetViewport)
  const exitCropMode = useEditorStore((state) => state.exitCropMode)

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement
      const isTextInput =
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.isContentEditable

      const isMac = navigator.platform.includes('Mac')
      const cmdOrCtrl = isMac ? e.metaKey : e.ctrlKey

      // Crop mode specific shortcuts
      if (cropMode) {
        if (e.key === 'Escape') {
          e.preventDefault()
          exitCropMode(false)
          return
        }
        if (e.key === 'Enter') {
          e.preventDefault()
          exitCropMode(true)
          return
        }
        // Block other shortcuts in crop mode
        return
      }

      // Shortcuts that work even in text inputs
      if (cmdOrCtrl) {
        // Undo: Cmd/Ctrl + Z
        if (e.key === 'z' && !e.shiftKey) {
          e.preventDefault()
          undo()
          return
        }

        // Redo: Cmd/Ctrl + Shift + Z or Ctrl + Y
        if ((e.key === 'z' && e.shiftKey) || (e.key === 'y' && !isMac)) {
          e.preventDefault()
          redo()
          return
        }
      }

      // Shortcuts that should not work in text inputs
      if (isTextInput) return

      // Delete/Backspace: Delete selected layers
      if ((e.key === 'Delete' || e.key === 'Backspace') && selectedLayerIds.length > 0) {
        e.preventDefault()
        removeSelectedLayers()
        return
      }

      // Arrow keys: Move selected layers
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key) && selectedLayerIds.length > 0) {
        e.preventDefault()
        const step = e.shiftKey ? 10 : 1
        const dx = e.key === 'ArrowRight' ? step : e.key === 'ArrowLeft' ? -step : 0
        const dy = e.key === 'ArrowDown' ? step : e.key === 'ArrowUp' ? -step : 0
        moveSelectedLayers(dx, dy)
        return
      }

      if (cmdOrCtrl) {
        // Duplicate: Cmd/Ctrl + D
        if (e.key === 'd') {
          e.preventDefault()
          duplicateSelectedLayers()
          return
        }

        // Select All: Cmd/Ctrl + A
        if (e.key === 'a') {
          e.preventDefault()
          selectAllLayers()
          return
        }

        // Lock/Unlock: Cmd/Ctrl + L
        if (e.key === 'l') {
          e.preventDefault()
          toggleSelectedLayersLock()
          return
        }

        // Copy: Cmd/Ctrl + C
        if (e.key === 'c') {
          e.preventDefault()
          copyLayers()
          return
        }

        // Cut: Cmd/Ctrl + X
        if (e.key === 'x') {
          e.preventDefault()
          cutLayers()
          return
        }

        // Paste: Cmd/Ctrl + V
        if (e.key === 'v') {
          e.preventDefault()
          pasteLayers()
          return
        }

        // Zoom In: Cmd/Ctrl + =
        if (e.key === '=' || e.key === '+') {
          e.preventDefault()
          setZoom(Math.min(MAX_ZOOM, zoom + ZOOM_STEP))
          return
        }

        // Zoom Out: Cmd/Ctrl + -
        if (e.key === '-') {
          e.preventDefault()
          setZoom(Math.max(MIN_ZOOM, zoom - ZOOM_STEP))
          return
        }

        // Fit to Content: Cmd/Ctrl + 0
        if (e.key === '0') {
          e.preventDefault()
          resetViewport()
          return
        }
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [
    cropMode,
    selectedLayerIds,
    zoom,
    undo,
    redo,
    removeSelectedLayers,
    duplicateSelectedLayers,
    selectAllLayers,
    moveSelectedLayers,
    toggleSelectedLayersLock,
    copyLayers,
    cutLayers,
    pasteLayers,
    setZoom,
    resetViewport,
    exitCropMode,
  ])
}
