"use client"

import * as React from 'react'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import { useTemplateEditor } from '@/contexts/template-editor-context'
import { Eye, EyeOff, Lock, Unlock, ChevronUp, ChevronDown, Sparkles } from 'lucide-react'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'

function layerTypeLabel(type: string) {
  switch (type) {
    case 'text':
      return 'Texto'
    case 'image':
      return 'Imagem'
    case 'gradient':
    case 'gradient2':
      return 'Gradiente'
    case 'logo':
      return 'Logo'
    case 'element':
      return 'Elemento'
    default:
      return type
  }
}

export function LayersPanel() {
  const {
    design,
    selectedLayerIds,
    selectLayer,
    toggleLayerVisibility,
    toggleLayerLock,
    reorderLayers,
    updateLayer,
    updateLayerPartial,
  } = useTemplateEditor()

  const orderedLayers = React.useMemo(() => [...design.layers].sort((a, b) => (b.order ?? 0) - (a.order ?? 0)), [design.layers])

  const toggleDynamic = React.useCallback(
    (layerId: string, event: React.MouseEvent) => {
      event.stopPropagation()
      const layer = design.layers.find((l) => l.id === layerId)
      if (layer) {
        updateLayerPartial(layerId, { isDynamic: !layer.isDynamic })
      }
    },
    [design.layers, updateLayerPartial],
  )

  const moveLayer = React.useCallback(
    (id: string, direction: 'up' | 'down') => {
      const ids = [...design.layers].map((layer) => layer.id)
      const index = ids.indexOf(id)
      if (index === -1) return
      const targetIndex = direction === 'up' ? index + 1 : index - 1
      if (targetIndex < 0 || targetIndex >= ids.length) return
      const next = [...ids]
      const [removed] = next.splice(index, 1)
      next.splice(targetIndex, 0, removed)
      reorderLayers(next)
    },
    [design.layers, reorderLayers],
  )

  return (
    <div className="flex h-full min-h-[400px] min-w-[360px] flex-col gap-3 rounded-lg border border-border/40 bg-card/60 p-4 shadow-sm">
      <div>
        <h3 className="text-sm font-semibold">Layers</h3>
        <p className="text-xs text-muted-foreground">Organize as camadas do template</p>
      </div>
      <ScrollArea className="flex-1">
        <div className="space-y-2 pr-2">
          {orderedLayers.map((layer) => {
            const isSelected = selectedLayerIds.includes(layer.id)
            return (
              <div
                key={layer.id}
                role="button"
                tabIndex={0}
                onClick={(event) =>
                  selectLayer(layer.id, {
                    additive: event.shiftKey || event.metaKey || event.ctrlKey,
                    toggle: event.shiftKey || event.metaKey || event.ctrlKey,
                  })
                }
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault()
                    selectLayer(layer.id, {
                      additive: event.shiftKey || event.metaKey || event.ctrlKey,
                      toggle: event.shiftKey || event.metaKey || event.ctrlKey,
                    })
                  }
                }}
                className={cn(
                  'group flex items-center justify-between gap-2 rounded-md border border-transparent bg-muted/40 px-3 py-2 text-xs shadow-sm transition hover:bg-muted/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50',
                  isSelected && 'border-primary bg-primary/10 text-foreground',
                )}
              >
                {/* Nome e Info da Camada - Com largura máxima fixa */}
                <div className="flex min-w-0 flex-1 items-center gap-2 overflow-hidden">
                  <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-sm bg-gradient-to-br from-primary/30 to-primary/10 text-[10px] font-semibold text-primary-foreground/80">
                    {(layer.name || layerTypeLabel(layer.type)).slice(0, 2).toUpperCase()}
                  </div>
                  <TooltipProvider delayDuration={300}>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <div className="min-w-0 flex-1 overflow-hidden">
                          <div className="truncate font-medium" style={{ maxWidth: '120px' }}>
                            {layer.name || layerTypeLabel(layer.type)}
                          </div>
                          <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
                            <span>{layerTypeLabel(layer.type)}</span>
                            {layer.type === 'image' && layer.isDynamic && (
                              <Badge variant="secondary" className="h-4 px-1 text-[9px]">
                                <Sparkles className="mr-0.5 h-2.5 w-2.5" />
                                Dinâmica
                              </Badge>
                            )}
                          </div>
                        </div>
                      </TooltipTrigger>
                      <TooltipContent>
                        <p className="text-xs">{layer.name || layerTypeLabel(layer.type)}</p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                </div>

                {/* Botões de Ação - Largura fixa */}
                <div className="flex shrink-0 items-center gap-1">
                  {/* Toggle Imagem Dinâmica - Apenas para imagens */}
                  {layer.type === 'image' && (
                    <TooltipProvider delayDuration={300}>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            size="icon"
                            variant="ghost"
                            className={cn(
                              'h-7 w-7',
                              layer.isDynamic && 'bg-primary/20 text-primary hover:bg-primary/30'
                            )}
                            onClick={(event) => toggleDynamic(layer.id, event)}
                          >
                            <Sparkles className={cn('h-4 w-4', layer.isDynamic && 'fill-current')} />
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>
                          <p className="text-xs">
                            {layer.isDynamic ? 'Imagem dinâmica ativa' : 'Marcar como dinâmica'}
                          </p>
                          <p className="text-[10px] text-muted-foreground">
                            Permite substituição no gerador de criativos
                          </p>
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  )}

                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-7 w-7"
                    onClick={(event) => {
                      event.stopPropagation()
                      toggleLayerVisibility(layer.id)
                    }}
                  >
                    {layer.visible === false ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-7 w-7"
                    onClick={(event) => {
                      event.stopPropagation()
                      toggleLayerLock(layer.id)
                    }}
                  >
                    {layer.locked ? <Lock className="h-4 w-4" /> : <Unlock className="h-4 w-4" />}
                  </Button>
                  <div className="flex flex-col">
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-5 w-6"
                      onClick={(event) => {
                        event.stopPropagation()
                        moveLayer(layer.id, 'up')
                      }}
                    >
                      <ChevronUp className="h-3 w-3" />
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-5 w-6"
                      onClick={(event) => {
                        event.stopPropagation()
                        moveLayer(layer.id, 'down')
                      }}
                    >
                      <ChevronDown className="h-3 w-3" />
                    </Button>
                  </div>
                  {layer.locked && <Badge variant="secondary">Lock</Badge>}
                </div>
              </div>
            )
          })}
          {orderedLayers.length === 0 && (
            <div className="rounded-md border border-dashed border-border/50 p-4 text-center text-xs text-muted-foreground">
              Nenhuma layer criada ainda. Use a barra superior para adicionar elementos.
            </div>
          )}
        </div>
      </ScrollArea>
    </div>
  )
}
