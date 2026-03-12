import { AlertTriangle, Blend, History, RefreshCw, Sparkles, Type, Undo2, ZoomIn, ZoomOut, Image as ImageIcon, Loader2, Square, Trash2 } from 'lucide-react'
import { createGradientLayer, createImageLayer, createShapeLayer, createTextLayer } from '@/lib/editor/document'
import { LayersPanel } from './LayersPanel'
import { PropertiesPanel } from './PropertiesPanel'
import { EditorStage } from './EditorStage'
import { PagesBar } from './PagesBar'
import { useEditorProjectFonts } from '@/hooks/use-editor-project-fonts'
import { selectCurrentPageState, useEditorStore } from '@/stores/editor.store'
import { useProjectStore } from '@/stores/project.store'
import { useHistoryStore } from '@/stores/history.store'

interface EditorShellProps {
  onSave: () => Promise<void> | void
  onOpenGenerateArt: () => void
  isSaving: boolean
  saveLabel?: string
}

export function EditorShell({
  onSave,
  onOpenGenerateArt,
  isSaving,
  saveLabel = 'Salvar template',
}: EditorShellProps) {
  const currentProject = useProjectStore((state) => state.currentProject)
  const document = useEditorStore((state) => state.document)
  const currentPage = useEditorStore(selectCurrentPageState)
  const zoom = useEditorStore((state) => state.zoom)
  const setZoom = useEditorStore((state) => state.setZoom)
  const resetViewport = useEditorStore((state) => state.resetViewport)
  const addLayer = useEditorStore((state) => state.addLayer)
  const removeSelectedLayers = useEditorStore((state) => state.removeSelectedLayers)
  const undo = useEditorStore((state) => state.undo)
  const redo = useEditorStore((state) => state.redo)
  const { availableFontFamilies, fontWarnings, isLoadingFonts } = useEditorProjectFonts(
    currentProject?.id,
    document,
  )
  const canUndo = useHistoryStore((state) => state.past.length > 0)
  const canRedo = useHistoryStore((state) => state.future.length > 0)
  const compactButtonClass =
    'h-9 shrink-0 rounded-xl border border-border px-3 text-sm text-text transition-colors hover:border-primary/40'
  const iconButtonClass =
    'flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-border text-text transition-colors hover:border-primary/40'

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

  const handleAddGradient = () => {
    if (!currentPage) {
      return
    }

    addLayer(createGradientLayer(currentPage))
  }

  return (
    <div className="flex min-h-[980px] min-w-[1260px] flex-col gap-4 pb-4">
      <div className="flex flex-wrap items-start justify-between gap-3 rounded-2xl border border-border bg-card/60 px-4 py-3">
        <div>
          <p className="text-sm font-semibold text-text">{document?.name ?? 'Editor Konva'}</p>
          <p className="mt-1 text-xs text-text-muted">
            Preview, edição e exportação convergem para o mesmo documento JSON v2.
          </p>
        </div>

        <div className="flex flex-wrap items-center justify-end gap-2">
          <button
            type="button"
            onClick={undo}
            disabled={!canUndo}
            className={`${compactButtonClass} text-text-muted hover:text-text disabled:opacity-40`}
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
            className={`${compactButtonClass} text-text-muted hover:text-text disabled:opacity-40`}
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
            className="h-9 shrink-0 rounded-xl bg-primary px-4 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary-hover disabled:opacity-60"
          >
            {isSaving ? 'Salvando...' : saveLabel}
          </button>
          <button
            type="button"
            onClick={onOpenGenerateArt}
            disabled={!document}
            className="h-9 shrink-0 rounded-xl border border-border px-4 text-sm font-medium text-text transition-colors hover:border-primary/40 disabled:opacity-60"
          >
            <span className="inline-flex items-center gap-2">
              <Sparkles size={16} />
              Gerar arte
            </span>
          </button>
        </div>
      </div>

      <div className="flex flex-wrap items-start justify-between gap-3 rounded-2xl border border-border bg-card/60 px-4 py-3">
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={handleAddText}
            className={compactButtonClass}
          >
            <span className="inline-flex items-center gap-2">
              <Type size={16} />
              Texto
            </span>
          </button>
          <button
            type="button"
            onClick={handleAddImage}
            className={compactButtonClass}
          >
            <span className="inline-flex items-center gap-2">
              <ImageIcon size={16} />
              Imagem
            </span>
          </button>
          <button
            type="button"
            onClick={handleAddShape}
            className={compactButtonClass}
          >
            <span className="inline-flex items-center gap-2">
              <Square size={16} />
              Shape
            </span>
          </button>
          <button
            type="button"
            onClick={handleAddGradient}
            className={compactButtonClass}
          >
            <span className="inline-flex items-center gap-2">
              <Blend size={16} />
              Gradiente
            </span>
          </button>
          <button
            type="button"
            onClick={removeSelectedLayers}
            className="h-9 shrink-0 rounded-xl border border-border px-3 text-sm text-text transition-colors hover:border-error/40 hover:text-error"
          >
            <span className="inline-flex items-center gap-2">
              <Trash2 size={16} />
              Remover seleção
            </span>
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setZoom(Math.max(0.15, Number((zoom - 0.1).toFixed(2))))}
            className={iconButtonClass}
          >
            <ZoomOut size={16} />
          </button>
          <span className="min-w-16 text-center text-sm text-text">{Math.round(zoom * 100)}%</span>
          <button
            type="button"
            onClick={() => setZoom(Math.min(2.5, Number((zoom + 0.1).toFixed(2))))}
            className={iconButtonClass}
          >
            <ZoomIn size={16} />
          </button>
          <button
            type="button"
            onClick={resetViewport}
            className={`${compactButtonClass} text-text-muted hover:text-text`}
          >
            <span className="inline-flex items-center gap-2">
              <RefreshCw size={16} />
              Reset view
            </span>
          </button>
        </div>
      </div>

      {isLoadingFonts ? (
        <div className="rounded-2xl border border-border bg-card/60 px-4 py-3">
          <div className="inline-flex items-center gap-2 text-sm text-text-muted">
            <Loader2 size={16} className="animate-spin text-primary" />
            Carregando fontes do projeto para o editor Konva...
          </div>
        </div>
      ) : null}

      {fontWarnings.length > 0 ? (
        <div className="rounded-2xl border border-amber-500/30 bg-amber-500/10 px-4 py-3">
          <div className="flex items-start gap-2">
            <AlertTriangle size={16} className="mt-0.5 shrink-0 text-amber-200" />
            <div className="space-y-1">
              {fontWarnings.map((warning) => (
                <p key={warning} className="text-sm text-amber-100">
                  {warning}
                </p>
              ))}
            </div>
          </div>
        </div>
      ) : null}

      <div className="grid min-h-[680px] flex-1 grid-cols-[260px_minmax(620px,1fr)_300px] gap-4">
        <LayersPanel />
        {isLoadingFonts ? (
          <div className="flex h-full min-h-[680px] items-center justify-center rounded-2xl border border-border bg-[#0c111d]">
            <div className="text-center">
              <Loader2 size={22} className="mx-auto animate-spin text-primary" />
              <p className="mt-3 text-sm text-text-muted">
                Preparando fontes antes da renderização do stage.
              </p>
            </div>
          </div>
        ) : (
          <EditorStage />
        )}
        <PropertiesPanel availableFontFamilies={availableFontFamilies} />
      </div>

      <PagesBar />
    </div>
  )
}
