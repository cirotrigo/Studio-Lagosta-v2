import { History, RefreshCw, Type, Undo2, ZoomIn, ZoomOut, Image as ImageIcon, Square, Trash2 } from 'lucide-react'
import { createImageLayer, createShapeLayer, createTextLayer } from '@/lib/editor/document'
import { LayersPanel } from './LayersPanel'
import { PropertiesPanel } from './PropertiesPanel'
import { EditorStage } from './EditorStage'
import { PagesBar } from './PagesBar'
import { selectCurrentPageState, useEditorStore } from '@/stores/editor.store'
import { useHistoryStore } from '@/stores/history.store'

interface EditorShellProps {
  onSave: () => Promise<void> | void
  isSaving: boolean
}

export function EditorShell({ onSave, isSaving }: EditorShellProps) {
  const document = useEditorStore((state) => state.document)
  const currentPage = useEditorStore(selectCurrentPageState)
  const zoom = useEditorStore((state) => state.zoom)
  const setZoom = useEditorStore((state) => state.setZoom)
  const resetViewport = useEditorStore((state) => state.resetViewport)
  const addLayer = useEditorStore((state) => state.addLayer)
  const removeSelectedLayers = useEditorStore((state) => state.removeSelectedLayers)
  const undo = useEditorStore((state) => state.undo)
  const redo = useEditorStore((state) => state.redo)
  const canUndo = useHistoryStore((state) => state.past.length > 0)
  const canRedo = useHistoryStore((state) => state.future.length > 0)

  const handleAddText = () => {
    if (!currentPage) {
      return
    }

    addLayer(createTextLayer(currentPage))
  }

  const handleAddImage = () => {
    if (!currentPage) {
      return
    }

    addLayer(createImageLayer(currentPage))
  }

  const handleAddShape = () => {
    if (!currentPage) {
      return
    }

    addLayer(createShapeLayer(currentPage))
  }

  return (
    <div className="flex h-full flex-col gap-4">
      <div className="flex items-center justify-between rounded-2xl border border-border bg-card/60 px-4 py-3">
        <div>
          <p className="text-sm font-semibold text-text">{document?.name ?? 'Editor Konva'}</p>
          <p className="mt-1 text-xs text-text-muted">
            Preview, edição e exportação convergem para o mesmo documento JSON v2.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={undo}
            disabled={!canUndo}
            className="rounded-xl border border-border px-3 py-2 text-sm text-text-muted hover:border-primary/40 hover:text-text disabled:opacity-40"
          >
            <span className="inline-flex items-center gap-2">
              <Undo2 size={16} />
              Undo
            </span>
          </button>
          <button
            type="button"
            onClick={redo}
            disabled={!canRedo}
            className="rounded-xl border border-border px-3 py-2 text-sm text-text-muted hover:border-primary/40 hover:text-text disabled:opacity-40"
          >
            <span className="inline-flex items-center gap-2">
              <History size={16} />
              Redo
            </span>
          </button>
          <button
            type="button"
            onClick={() => onSave()}
            disabled={isSaving || !document}
            className="rounded-xl bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary-hover disabled:opacity-60"
          >
            {isSaving ? 'Salvando...' : 'Salvar template'}
          </button>
        </div>
      </div>

      <div className="flex items-center justify-between rounded-2xl border border-border bg-card/60 px-4 py-3">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleAddText}
            className="rounded-xl border border-border px-3 py-2 text-sm text-text hover:border-primary/40"
          >
            <span className="inline-flex items-center gap-2">
              <Type size={16} />
              Texto
            </span>
          </button>
          <button
            type="button"
            onClick={handleAddImage}
            className="rounded-xl border border-border px-3 py-2 text-sm text-text hover:border-primary/40"
          >
            <span className="inline-flex items-center gap-2">
              <ImageIcon size={16} />
              Imagem
            </span>
          </button>
          <button
            type="button"
            onClick={handleAddShape}
            className="rounded-xl border border-border px-3 py-2 text-sm text-text hover:border-primary/40"
          >
            <span className="inline-flex items-center gap-2">
              <Square size={16} />
              Shape
            </span>
          </button>
          <button
            type="button"
            onClick={removeSelectedLayers}
            className="rounded-xl border border-border px-3 py-2 text-sm text-text hover:border-error/40 hover:text-error"
          >
            <span className="inline-flex items-center gap-2">
              <Trash2 size={16} />
              Remover seleção
            </span>
          </button>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setZoom(Math.max(0.15, Number((zoom - 0.1).toFixed(2))))}
            className="rounded-xl border border-border p-2 text-text hover:border-primary/40"
          >
            <ZoomOut size={16} />
          </button>
          <span className="min-w-16 text-center text-sm text-text">{Math.round(zoom * 100)}%</span>
          <button
            type="button"
            onClick={() => setZoom(Math.min(2.5, Number((zoom + 0.1).toFixed(2))))}
            className="rounded-xl border border-border p-2 text-text hover:border-primary/40"
          >
            <ZoomIn size={16} />
          </button>
          <button
            type="button"
            onClick={resetViewport}
            className="rounded-xl border border-border px-3 py-2 text-sm text-text-muted hover:border-primary/40 hover:text-text"
          >
            <span className="inline-flex items-center gap-2">
              <RefreshCw size={16} />
              Reset view
            </span>
          </button>
        </div>
      </div>

      <div className="grid min-h-0 flex-1 grid-cols-[280px_minmax(0,1fr)_320px] gap-4">
        <LayersPanel />
        <EditorStage />
        <PropertiesPanel />
      </div>

      <PagesBar />
    </div>
  )
}
