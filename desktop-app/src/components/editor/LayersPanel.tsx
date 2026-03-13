import { Eye, EyeOff, Lock, Unlock, MoveDown, MoveUp, Trash2 } from 'lucide-react'
import { selectCurrentPageState, useEditorStore } from '@/stores/editor.store'
import { cn } from '@/lib/utils'

export function LayersPanel() {
  const currentPage = useEditorStore(selectCurrentPageState)
  const selectedLayerIds = useEditorStore((state) => state.selectedLayerIds)
  const selectLayer = useEditorStore((state) => state.selectLayer)
  const reorderLayer = useEditorStore((state) => state.reorderLayer)
  const toggleLayerVisibility = useEditorStore((state) => state.toggleLayerVisibility)
  const toggleLayerLock = useEditorStore((state) => state.toggleLayerLock)
  const removeLayer = useEditorStore((state) => state.removeLayer)

  if (!currentPage) {
    return null
  }

  const layers = currentPage.layers.slice().reverse()

  return (
    <div className="flex h-full flex-col rounded-2xl border border-border bg-card/60">
      <div className="border-b border-border px-4 py-3">
        <h2 className="text-sm font-semibold text-text">Camadas</h2>
        <p className="mt-1 text-xs text-text-muted">Shift/Ctrl para multisseleção</p>
      </div>

      <div className="flex-1 space-y-2 overflow-y-auto p-3">
        {layers.map((layer, index) => {
          const isSelected = selectedLayerIds.includes(layer.id)

          return (
            <button
              key={layer.id}
              onClick={(event) => selectLayer(layer.id, event.shiftKey || event.metaKey || event.ctrlKey)}
              className={cn(
                'w-full rounded-xl border px-3 py-3 text-left transition-colors',
                isSelected
                  ? 'border-primary bg-primary/10'
                  : 'border-border bg-background/60 hover:border-primary/40',
              )}
            >
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="text-sm font-medium text-text">{layer.name ?? layer.type}</p>
                  <p className="mt-1 text-xs uppercase tracking-[0.18em] text-text-subtle">{layer.type}</p>
                </div>

                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={(event) => {
                      event.stopPropagation()
                      toggleLayerVisibility(layer.id)
                    }}
                    className="rounded-lg p-1 text-text-muted hover:bg-card hover:text-text"
                  >
                    {layer.visible === false ? <EyeOff size={14} /> : <Eye size={14} />}
                  </button>
                  <button
                    type="button"
                    onClick={(event) => {
                      event.stopPropagation()
                      toggleLayerLock(layer.id)
                    }}
                    className="rounded-lg p-1 text-text-muted hover:bg-card hover:text-text"
                  >
                    {layer.locked ? <Lock size={14} /> : <Unlock size={14} />}
                  </button>
                  <button
                    type="button"
                    onClick={(event) => {
                      event.stopPropagation()
                      removeLayer(layer.id)
                    }}
                    className="rounded-lg p-1 text-text-muted hover:bg-card hover:text-error"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>

              <div className="mt-3 flex items-center justify-between text-xs text-text-muted">
                <span>
                  X {Math.round(layer.x)} Y {Math.round(layer.y)}
                </span>

                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    disabled={index === 0}
                    onClick={(event) => {
                      event.stopPropagation()
                      reorderLayer(layer.id, 'forward')
                    }}
                    className="rounded-lg p-1 text-text-muted hover:bg-card hover:text-text disabled:opacity-30"
                    title="Mover uma camada acima"
                  >
                    <MoveUp size={14} />
                  </button>
                  <button
                    type="button"
                    disabled={index === layers.length - 1}
                    onClick={(event) => {
                      event.stopPropagation()
                      reorderLayer(layer.id, 'backward')
                    }}
                    className="rounded-lg p-1 text-text-muted hover:bg-card hover:text-text disabled:opacity-30"
                    title="Mover uma camada abaixo"
                  >
                    <MoveDown size={14} />
                  </button>
                </div>
              </div>
            </button>
          )
        })}

        {!layers.length ? (
          <div className="rounded-xl border border-dashed border-border px-4 py-6 text-center text-sm text-text-muted">
            Nenhuma layer nesta página.
          </div>
        ) : null}
      </div>
    </div>
  )
}
