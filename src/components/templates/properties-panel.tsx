"use client"

import * as React from 'react'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Button } from '@/components/ui/button'
import { FONT_CONFIG } from '@/lib/font-config'
import { useTemplateEditor } from '@/contexts/template-editor-context'

const FONT_OPTIONS = FONT_CONFIG.AVAILABLE_FONTS

interface GradientPropertiesProps {
  layerId: string
  layerType: 'gradient' | 'gradient2'
}

function GradientProperties({ layerId, layerType }: GradientPropertiesProps) {
  const { design, updateLayer, updateLayerStyle } = useTemplateEditor()
  const layer = React.useMemo(() => design.layers.find((item) => item.id === layerId) ?? null, [design.layers, layerId])

  if (!layer) return null

  const stops = layer.style?.gradientStops ?? [
    { color: '#000000', position: 0 },
    { color: '#00000000', position: 1 },
  ]

  const handleGradientTypeChange = (value: 'linear' | 'radial') => {
    updateLayerStyle(layerId, {
      gradientType: value,
      gradientAngle: value === 'linear' ? layer.style?.gradientAngle ?? 180 : undefined,
    })
  }

  const handleAngleChange = (value: number) => {
    updateLayerStyle(layerId, {
      gradientAngle: Math.max(0, Math.min(360, value)),
    })
  }

  const updateStop = (index: number, update: Partial<{ color: string; position: number }>) => {
    const nextStops = stops.map((stop, idx) => (idx === index ? { ...stop, ...update } : stop))
    updateLayerStyle(layerId, { gradientStops: nextStops })
  }

  const addStop = () => {
    const last = stops[stops.length - 1]
    const nextPosition = Math.min(1, (last?.position ?? 1) + 0.1)
    const nextStops = [...stops, { color: '#FFFFFF', position: nextPosition }]
    updateLayerStyle(layerId, { gradientStops: nextStops })
  }

  const removeStop = (index: number) => {
    if (stops.length <= 2) return
    const nextStops = stops.filter((_, idx) => idx !== index)
    updateLayerStyle(layerId, { gradientStops: nextStops })
  }

  return (
    <div className="space-y-4 rounded-md border border-border/30 bg-muted/30 p-3 text-xs">
      <div className="flex items-center justify-between">
        <span className="font-semibold">Gradiente</span>
        <span className="rounded-full bg-primary/10 px-2 py-[2px] text-[10px] font-semibold uppercase text-primary">
          {layerType === 'gradient' ? 'Linear' : 'Radial'}
        </span>
      </div>
      <div className="space-y-2">
        <Label className="text-[11px] uppercase tracking-wide">Tipo</Label>
        <Select
          value={(layer.style?.gradientType as 'linear' | 'radial') ?? 'linear'}
          onValueChange={(value) => handleGradientTypeChange(value as 'linear' | 'radial')}
        >
          <SelectTrigger>
            <SelectValue placeholder="Tipo" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="linear">Linear</SelectItem>
            <SelectItem value="radial">Radial</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {(layer.style?.gradientType ?? 'linear') === 'linear' && (
        <div className="space-y-2">
          <Label className="text-[11px] uppercase tracking-wide" htmlFor="gradient-angle">
            Ângulo ({Math.round(layer.style?.gradientAngle ?? 180)}°)
          </Label>
          <input
            id="gradient-angle"
            type="range"
            min={0}
            max={360}
            value={Math.round(layer.style?.gradientAngle ?? 180)}
            onChange={(event) => handleAngleChange(Number(event.target.value))}
          />
        </div>
      )}

      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <Label className="text-[11px] uppercase tracking-wide">Cores</Label>
          <Button type="button" variant="outline" size="sm" onClick={addStop} disabled={stops.length >= 6}>
            Adicionar ponto
          </Button>
        </div>
        <div className="space-y-3">
          {stops.map((stop, index) => (
            <div key={index} className="rounded-md border border-border/40 bg-card/80 p-3 shadow-sm">
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-2">
                  <input
                    aria-label={`Cor do ponto ${index + 1}`}
                    type="color"
                    className="h-8 w-8 rounded-md border border-border/40"
                    value={stop.color}
                    onChange={(event) => updateStop(index, { color: event.target.value })}
                  />
                  <Input
                    className="h-8"
                    value={stop.color}
                    onChange={(event) => updateStop(index, { color: event.target.value })}
                  />
                </div>
                {stops.length > 2 && (
                  <Button type="button" variant="ghost" size="sm" onClick={() => removeStop(index)}>
                    Remover
                  </Button>
                )}
              </div>
              <div className="mt-3 space-y-1">
                <Label className="text-[11px] uppercase tracking-wide" htmlFor={`gradient-stop-${index}`}>
                  Posição ({Math.round((stop.position ?? 0) * 100)}%)
                </Label>
                <input
                  id={`gradient-stop-${index}`}
                  type="range"
                  min={0}
                  max={100}
                  value={Math.round((stop.position ?? 0) * 100)}
                  onChange={(event) => updateStop(index, { position: Number(event.target.value) / 100 })}
                />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

export function PropertiesPanel() {
  const {
    design,
    selectedLayerId,
    updateLayer,
    updateLayerStyle,
    updateLayerPartial,
    updateCanvas,
  } = useTemplateEditor()

  const selectedLayer = React.useMemo(
    () => design.layers.find((layer) => layer.id === selectedLayerId) ?? null,
    [design.layers, selectedLayerId],
  )

  const handleCanvasBackground = (event: React.ChangeEvent<HTMLInputElement>) => {
    updateCanvas({ backgroundColor: event.target.value })
  }

  const updatePosition = (field: 'x' | 'y', value: number) => {
    if (!selectedLayer) return
    updateLayer(selectedLayer.id, (layer) => ({
      ...layer,
      position: {
        x: field === 'x' ? value : layer.position?.x ?? 0,
        y: field === 'y' ? value : layer.position?.y ?? 0,
      },
    }))
  }

  const updateSize = (field: 'width' | 'height', value: number) => {
    if (!selectedLayer) return
    updateLayer(selectedLayer.id, (layer) => ({
      ...layer,
      size: {
        width: field === 'width' ? Math.max(1, value) : layer.size?.width ?? 0,
        height: field === 'height' ? Math.max(1, value) : layer.size?.height ?? 0,
      },
    }))
  }

  return (
    <div className="flex h-full min-h-[400px] flex-col gap-3 rounded-lg border border-border/40 bg-card/60 p-4 shadow-sm">
      <div>
        <h3 className="text-sm font-semibold">Propriedades</h3>
        <p className="text-xs text-muted-foreground">Ajuste o canvas e os elementos selecionados</p>
      </div>
      <div className="space-y-3 rounded-md border border-border/30 bg-muted/30 p-3 text-xs">
        <div className="flex items-center justify-between">
          <span className="font-medium">Canvas</span>
          <span className="text-muted-foreground">
            {design.canvas.width} × {design.canvas.height}
          </span>
        </div>
        <div className="space-y-1">
          <Label htmlFor="canvas-bg">Cor de fundo</Label>
          <div className="flex items-center gap-2">
            <Input
              id="canvas-bg"
              value={design.canvas.backgroundColor ?? '#ffffff'}
              onChange={handleCanvasBackground}
            />
            <input
              aria-label="Selecionar cor de fundo"
              type="color"
              className="h-9 w-9 rounded-md border border-border/30"
              value={design.canvas.backgroundColor ?? '#ffffff'}
              onChange={handleCanvasBackground}
            />
          </div>
        </div>
      </div>
      <ScrollArea className="flex-1 pr-2">
        <div className="space-y-4">
          {!selectedLayer && (
            <div className="rounded-md border border-dashed border-border/40 p-4 text-center text-xs text-muted-foreground">
              Selecione uma layer para editar suas propriedades.
            </div>
          )}

          {selectedLayer && (
            <div className="space-y-4">
              <div className="space-y-1">
                <Label htmlFor="layer-name">Nome</Label>
                <Input
                  id="layer-name"
                  value={selectedLayer.name ?? ''}
                  onChange={(event) => updateLayerPartial(selectedLayer.id, { name: event.target.value })}
                />
              </div>

              <div className="grid grid-cols-2 gap-3 text-xs">
                <div>
                  <Label>Posição X</Label>
                  <Input
                    type="number"
                    value={Math.round(selectedLayer.position?.x ?? 0)}
                    onChange={(event) => updatePosition('x', Number(event.target.value))}
                  />
                </div>
                <div>
                  <Label>Posição Y</Label>
                  <Input
                    type="number"
                    value={Math.round(selectedLayer.position?.y ?? 0)}
                    onChange={(event) => updatePosition('y', Number(event.target.value))}
                  />
                </div>
                <div>
                  <Label>Largura</Label>
                  <Input
                    type="number"
                    min={1}
                    value={Math.round(selectedLayer.size?.width ?? 0)}
                    onChange={(event) => updateSize('width', Number(event.target.value))}
                  />
                </div>
                <div>
                  <Label>Altura</Label>
                  <Input
                    type="number"
                    min={1}
                    value={Math.round(selectedLayer.size?.height ?? 0)}
                    onChange={(event) => updateSize('height', Number(event.target.value))}
                  />
                </div>
                <div>
                  <Label>Rotação</Label>
                  <Input
                    type="number"
                    value={selectedLayer.rotation ?? 0}
                    onChange={(event) =>
                      updateLayerPartial(selectedLayer.id, { rotation: Number(event.target.value) })
                    }
                  />
                </div>
              </div>

          {(selectedLayer.type === 'gradient' || selectedLayer.type === 'gradient2') && (
            <GradientProperties layerId={selectedLayer.id} layerType={selectedLayer.type} />
          )}

          {selectedLayer.type === 'text' && (
            <div className="space-y-4">
                  <div className="space-y-1">
                    <Label htmlFor="layer-content">Conteúdo</Label>
                    <Textarea
                      id="layer-content"
                      rows={4}
                      value={selectedLayer.content ?? ''}
                      onChange={(event) =>
                        updateLayerPartial(selectedLayer.id, { content: event.target.value })
                      }
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <Label>Fonte</Label>
                      <Select
                        value={selectedLayer.style?.fontFamily ?? FONT_CONFIG.DEFAULT_FONT}
                        onValueChange={(value) =>
                          updateLayerStyle(selectedLayer.id, { fontFamily: value })
                        }
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Fonte" />
                        </SelectTrigger>
                        <SelectContent>
                          {FONT_OPTIONS.map((font) => (
                            <SelectItem key={font.name} value={font.name}>
                              {font.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1">
                      <Label>Tamanho</Label>
                      <Input
                        type="number"
                        min={8}
                        value={selectedLayer.style?.fontSize ?? 16}
                        onChange={(event) =>
                          updateLayerStyle(selectedLayer.id, { fontSize: Number(event.target.value) })
                        }
                      />
                    </div>
                    <div className="space-y-1">
                      <Label>Cor</Label>
                      <div className="flex items-center gap-2">
                        <Input
                          value={selectedLayer.style?.color ?? '#000000'}
                          onChange={(event) =>
                            updateLayerStyle(selectedLayer.id, { color: event.target.value })
                          }
                        />
                        <input
                          aria-label="Selecionar cor do texto"
                          type="color"
                          className="h-9 w-9 rounded-md border border-border/30"
                          value={selectedLayer.style?.color ?? '#000000'}
                          onChange={(event) =>
                            updateLayerStyle(selectedLayer.id, { color: event.target.value })
                          }
                        />
                      </div>
                    </div>
                    <div className="space-y-1">
                      <Label>Altura de linha</Label>
                      <Input
                        type="number"
                        step="0.1"
                        value={selectedLayer.style?.lineHeight ?? 1.2}
                        onChange={(event) =>
                          updateLayerStyle(selectedLayer.id, { lineHeight: Number(event.target.value) })
                        }
                      />
                    </div>
                  </div>
                </div>
              )}

              {(selectedLayer.type === 'image' || selectedLayer.type === 'logo' || selectedLayer.type === 'element') && (
                <div className="space-y-3">
                  <div className="space-y-1">
                    <Label htmlFor="layer-file-url">URL da imagem</Label>
                    <Input
                      id="layer-file-url"
                      value={selectedLayer.fileUrl ?? ''}
                      onChange={(event) =>
                        updateLayerPartial(selectedLayer.id, { fileUrl: event.target.value })
                      }
                    />
                  </div>
                  <div className="space-y-1">
                    <Label>Object Fit</Label>
                    <Select
                      value={selectedLayer.style?.objectFit ?? 'cover'}
                      onValueChange={(value) =>
                        updateLayerStyle(selectedLayer.id, { objectFit: value as 'cover' | 'contain' | 'fill' })
                      }
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="cover">Cover</SelectItem>
                        <SelectItem value="contain">Contain</SelectItem>
                        <SelectItem value="fill">Fill</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </ScrollArea>
    </div>
  )
}
