import { useState } from 'react'
import { AlertTriangle, Blend, History, Keyboard, RefreshCw, Sparkles, Type, Undo2, X, ZoomIn, ZoomOut, Image as ImageIcon, Loader2, Square, Trash2 } from 'lucide-react'
import { createGradientLayer, createImageLayer, createShapeLayer, createTextLayer } from '@/lib/editor/document'
import { LayersPanel } from './LayersPanel'
import { PropertiesPanel } from './PropertiesPanel'
import { EditorStage } from './EditorStage'
import { PagesBar } from './PagesBar'
import { PanelDivider } from '@/components/ui/PanelDivider'
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
  const [showShortcuts, setShowShortcuts] = useState(false)

  // Lumina Design System button classes
  const compactButtonClass =
    'h-9 shrink-0 rounded-lg border border-white/10 bg-white/5 px-3 text-sm text-white/80 transition-all duration-150 hover:bg-white/10 hover:border-white/20 hover:text-white'
  const iconButtonClass =
    'flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-white/10 bg-white/5 text-white/70 transition-all duration-150 hover:bg-white/10 hover:border-white/20 hover:text-white'

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
      {/* Header Toolbar */}
      <div className="panel-glass flex flex-wrap items-start justify-between gap-3 px-4 py-3">
        <div>
          <p className="text-sm font-semibold text-white">{document?.name ?? 'Editor Konva'}</p>
          <p className="mt-1 text-xs text-white/50">
            Preview, edicao e exportacao convergem para o mesmo documento JSON v2.
          </p>
        </div>

        <div className="flex flex-wrap items-center justify-end gap-2">
          <button
            type="button"
            onClick={undo}
            disabled={!canUndo}
            className={`${compactButtonClass} disabled:opacity-40`}
            title="Desfazer (Cmd/Ctrl+Z)"
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
            className={`${compactButtonClass} disabled:opacity-40`}
            title="Refazer (Cmd/Ctrl+Shift+Z)"
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
            className="btn-primary h-9 px-4 text-sm disabled:opacity-50"
          >
            {isSaving ? 'Salvando...' : saveLabel}
          </button>
          <button
            type="button"
            onClick={onOpenGenerateArt}
            disabled={!document}
            className={`${compactButtonClass} disabled:opacity-50`}
          >
            <span className="inline-flex items-center gap-2">
              <Sparkles size={16} />
              Gerar arte
            </span>
          </button>
        </div>
      </div>

      {/* Tools Toolbar */}
      <div className="panel-glass flex flex-wrap items-start justify-between gap-3 px-4 py-3">
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
            title="Remover seleção (Delete)"
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
            title="Zoom out (Cmd/Ctrl+-)"
          >
            <ZoomOut size={16} />
          </button>
          <span className="min-w-16 text-center text-sm text-text">{Math.round(zoom * 100)}%</span>
          <button
            type="button"
            onClick={() => setZoom(Math.min(2.5, Number((zoom + 0.1).toFixed(2))))}
            className={iconButtonClass}
            title="Zoom in (Cmd/Ctrl++)"
          >
            <ZoomIn size={16} />
          </button>
          <button
            type="button"
            onClick={resetViewport}
            className={`${compactButtonClass} text-text-muted hover:text-text`}
            title="Resetar vista (Cmd/Ctrl+0)"
          >
            <span className="inline-flex items-center gap-2">
              <RefreshCw size={16} />
              Reset view
            </span>
          </button>
          <button
            type="button"
            onClick={() => setShowShortcuts(true)}
            className={`${iconButtonClass} text-text-muted hover:text-text`}
            title="Atalhos de teclado"
          >
            <Keyboard size={16} />
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

      {/* Main Editor Area with Panel Dividers */}
      <div className="flex h-[calc(100vh-280px)] min-h-[680px] gap-0">
        {/* Layers Panel */}
        <div className="w-[260px] shrink-0">
          <LayersPanel />
        </div>

        {/* Divider with beam */}
        <PanelDivider beamCount={1} className="mx-2" />

        {/* Canvas Area */}
        <div className="flex-1 min-w-[620px]">
          {isLoadingFonts ? (
            <div className="flex h-full items-center justify-center panel">
              <div className="text-center">
                <Loader2 size={22} className="mx-auto animate-spin text-primary" />
                <p className="mt-3 text-sm text-white/50">
                  Preparando fontes antes da renderizacao do stage.
                </p>
              </div>
            </div>
          ) : (
            <EditorStage />
          )}
        </div>

        {/* Divider with beam */}
        <PanelDivider beamCount={1} className="mx-2" />

        {/* Properties Panel */}
        <div className="w-[300px] shrink-0">
          <PropertiesPanel availableFontFamilies={availableFontFamilies} />
        </div>
      </div>

      <PagesBar />

      {/* Shortcuts Modal - Glass morphism style */}
      {showShortcuts && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm">
          <div className="glass relative max-h-[80vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-white/10 p-6 shadow-2xl">
            <button
              type="button"
              onClick={() => setShowShortcuts(false)}
              className="btn-icon absolute right-4 top-4"
            >
              <X size={20} />
            </button>

            <div className="mb-6">
              <h2 className="text-lg font-semibold text-white">Atalhos de Teclado</h2>
              <p className="mt-1 text-sm text-white/50">
                Use estes atalhos para agilizar seu trabalho no editor.
              </p>
            </div>

            <div className="space-y-6">
              <div>
                <h3 className="text-label-upper mb-3 text-white/40">
                  Geral
                </h3>
                <div className="space-y-2">
                  <ShortcutRow label="Desfazer" shortcut="Cmd/Ctrl + Z" />
                  <ShortcutRow label="Refazer" shortcut="Cmd/Ctrl + Shift + Z" />
                  <ShortcutRow label="Excluir selecao" shortcut="Delete / Backspace" />
                  <ShortcutRow label="Duplicar" shortcut="Cmd/Ctrl + D" />
                  <ShortcutRow label="Selecionar tudo" shortcut="Cmd/Ctrl + A" />
                  <ShortcutRow label="Travar/Destravar" shortcut="Cmd/Ctrl + L" />
                </div>
              </div>

              <div>
                <h3 className="text-label-upper mb-3 text-white/40">
                  Copiar e Colar
                </h3>
                <div className="space-y-2">
                  <ShortcutRow label="Copiar" shortcut="Cmd/Ctrl + C" />
                  <ShortcutRow label="Cortar" shortcut="Cmd/Ctrl + X" />
                  <ShortcutRow label="Colar" shortcut="Cmd/Ctrl + V" />
                </div>
              </div>

              <div>
                <h3 className="text-label-upper mb-3 text-white/40">
                  Navegacao
                </h3>
                <div className="space-y-2">
                  <ShortcutRow label="Zoom in" shortcut="Cmd/Ctrl + =" />
                  <ShortcutRow label="Zoom out" shortcut="Cmd/Ctrl + -" />
                  <ShortcutRow label="Resetar vista" shortcut="Cmd/Ctrl + 0" />
                  <ShortcutRow label="Toggle reguas" shortcut="R" />
                  <ShortcutRow label="Pan (arrastar canvas)" shortcut="Espaco + Arrastar" />
                </div>
              </div>

              <div>
                <h3 className="text-label-upper mb-3 text-white/40">
                  Movimentacao
                </h3>
                <div className="space-y-2">
                  <ShortcutRow label="Mover 1px" shortcut="Setas" />
                  <ShortcutRow label="Mover 10px" shortcut="Shift + Setas" />
                </div>
              </div>

              <div>
                <h3 className="text-label-upper mb-3 text-white/40">
                  Modo Crop (Imagens)
                </h3>
                <div className="space-y-2">
                  <ShortcutRow label="Entrar no modo crop" shortcut="Duplo clique na imagem" />
                  <ShortcutRow label="Confirmar crop" shortcut="Enter / Duplo clique" />
                  <ShortcutRow label="Cancelar crop" shortcut="Esc" />
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function ShortcutRow({ label, shortcut }: { label: string; shortcut: string }) {
  return (
    <div className="flex items-center justify-between rounded-lg bg-white/5 px-3 py-2">
      <span className="text-sm text-white/80">{label}</span>
      <kbd className="rounded bg-white/10 px-2 py-1 text-xs font-mono text-white/60">
        {shortcut}
      </kbd>
    </div>
  )
}
