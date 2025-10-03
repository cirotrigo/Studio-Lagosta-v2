"use client"

import * as React from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { ChevronDown, ChevronUp, Layers } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { cn } from '@/lib/utils'
import { useTemplateEditor } from '@/contexts/template-editor-context'

export function LayersDock() {
  const { design, selectedLayerIds, selectLayer, toggleLayerVisibility, toggleLayerLock } = useTemplateEditor()
  const [open, setOpen] = React.useState(true)

  const orderedLayers = React.useMemo(() => [...design.layers].sort((a, b) => (b.order ?? 0) - (a.order ?? 0)), [design.layers])

  const handleToggle = React.useCallback(() => setOpen((prev) => !prev), [])

  return (
    <div className="relative w-full">
      <div className="mx-auto max-w-5xl rounded-t-lg border border-border/40 bg-card/80 shadow-lg">
        <div className="flex items-center justify-between px-4 py-2">
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            <Layers className="h-4 w-4" />
            Camadas
            <span className="rounded bg-muted px-2 py-[2px] text-[10px] font-medium text-muted-foreground">
              {design.layers.length}
            </span>
          </div>
          <Button variant="ghost" size="sm" onClick={handleToggle}>
            {open ? (
              <>
                Recolher <ChevronDown className="ml-1 h-4 w-4" />
              </>
            ) : (
              <>
                Expandir <ChevronUp className="ml-1 h-4 w-4" />
              </>
            )}
          </Button>
        </div>
        <AnimatePresence initial={false}>
          {open && (
            <motion.div
              key="layers-content"
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 220, opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.2, ease: 'easeInOut' }}
              className="overflow-hidden border-t border-border/40"
            >
              <ScrollArea className="h-[220px]">
                <div className="grid gap-2 p-3">
                  {orderedLayers.map((layer) => {
                    const isSelected = selectedLayerIds.includes(layer.id)
                    return (
                      <button
                        key={layer.id}
                        type="button"
                        onClick={(event) =>
                          selectLayer(layer.id, {
                            additive: event.shiftKey || event.metaKey || event.ctrlKey,
                            toggle: event.shiftKey || event.metaKey || event.ctrlKey,
                          })
                        }
                        className={cn(
                          'flex items-center justify-between rounded-md border border-transparent bg-muted/30 px-3 py-2 text-xs transition hover:bg-muted/50',
                          isSelected && 'border-primary bg-primary/10 text-foreground shadow-sm',
                        )}
                      >
                        <div className="flex items-center gap-2">
                          <span className="rounded-sm bg-gradient-to-br from-primary/40 to-primary/10 px-2 py-1 text-[10px] font-semibold uppercase text-primary-foreground/80">
                            {(layer.name || layer.type).slice(0, 2)}
                          </span>
                          <div className="flex flex-col items-start">
                            <span className="max-w-[200px] truncate font-medium">{layer.name || layer.type}</span>
                            <span className="text-[10px] text-muted-foreground">
                              {Math.round(layer.position?.x ?? 0)} × {Math.round(layer.position?.y ?? 0)}
                            </span>
                          </div>
                        </div>
                        <div className="flex items-center gap-1">
                          <div
                            role="button"
                            tabIndex={0}
                            className="cursor-pointer rounded-full border border-border/40 bg-background px-2 py-[2px] text-[10px] font-semibold uppercase text-muted-foreground transition hover:border-primary hover:text-primary"
                            onClick={(event) => {
                              event.stopPropagation()
                              toggleLayerVisibility(layer.id)
                            }}
                            onKeyDown={(event) => {
                              if (event.key === 'Enter' || event.key === ' ') {
                                event.stopPropagation()
                                toggleLayerVisibility(layer.id)
                              }
                            }}
                          >
                            {layer.visible === false ? 'Mostrar' : 'Ocultar'}
                          </div>
                          <div
                            role="button"
                            tabIndex={0}
                            className="cursor-pointer rounded-full border border-border/40 bg-background px-2 py-[2px] text-[10px] font-semibold uppercase text-muted-foreground transition hover:border-primary hover:text-primary"
                            onClick={(event) => {
                              event.stopPropagation()
                              toggleLayerLock(layer.id)
                            }}
                            onKeyDown={(event) => {
                              if (event.key === 'Enter' || event.key === ' ') {
                                event.stopPropagation()
                                toggleLayerLock(layer.id)
                              }
                            }}
                          >
                            {layer.locked ? 'Desbloq.' : 'Bloq.'}
                          </div>
                        </div>
                      </button>
                    )
                  })}
                  {orderedLayers.length === 0 && (
                    <div className="rounded-md border border-dashed border-border/60 bg-muted/30 p-4 text-center text-xs text-muted-foreground">
                      Nenhuma camada adicionada ainda.
                    </div>
                  )}
                </div>
              </ScrollArea>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  )
}
