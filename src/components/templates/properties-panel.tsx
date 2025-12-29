"use client"

import * as React from 'react'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Button } from '@/components/ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Switch } from '@/components/ui/switch'
import {
  Settings,
  Layers,
  AlignLeft,
  AlignCenter,
  AlignRight,
  AlignVerticalJustifyStart,
  AlignVerticalJustifyCenter,
  AlignVerticalJustifyEnd,
  AlignHorizontalDistributeCenter,
  AlignVerticalDistributeCenter,
  BringToFront,
  SendToBack,
  ArrowUp,
  ArrowDown,
} from 'lucide-react'
import { FONT_CONFIG } from '@/lib/font-config'
import { useTemplateEditor } from '@/contexts/template-editor-context'
import type { Layer, LayerStyle } from '@/types/template'
import { ImageEditorModal } from './modals/image-editor-modal'
import { ColorPicker } from '@/components/canvas/effects/ColorPicker'
import { VideoProperties } from './video-properties'

const FONT_OPTIONS = FONT_CONFIG.AVAILABLE_FONTS

// Image filter presets removed - professional adjustments should be configured manually

interface GradientPropertiesProps {
  layerId: string
  layerType: 'gradient' | 'gradient2'
}

function GradientProperties({ layerId, layerType }: GradientPropertiesProps) {
  const { design, updateLayerStyle } = useTemplateEditor()
  const layer = React.useMemo(() => design.layers.find((item) => item.id === layerId) ?? null, [design.layers, layerId])

  if (!layer) return null

  const stops = layer.style?.gradientStops ?? [
    { id: '1', color: '#000000', position: 0, opacity: 1 },
    { id: '2', color: '#000000', position: 1, opacity: 0 },
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
    const nextStops = [...stops, { id: Date.now().toString(), color: '#FFFFFF', position: nextPosition, opacity: 1 }]
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

export function EffectsPanel() {
  const editor = useTemplateEditor()
  const { design, selectedLayerId } = editor

  const selectedLayer = React.useMemo(
    () => design.layers.find((layer) => layer.id === selectedLayerId) ?? null,
    [design.layers, selectedLayerId]
  )

  const setStyleValue = React.useCallback((layer: Layer, style: any) => {
    editor.updateLayerStyle(layer.id, style)
  }, [editor])

  const resetImageFilters = React.useCallback((layer: Layer) => {
    setStyleValue(layer, {
      // Reset all adjustments and filters
      exposure: 0,
      contrast: 0,
      highlights: 0,
      shadows: 0,
      whites: 0,
      blacks: 0,
      saturation: 0,
      blur: 0,
      vignette: 0,
      // Reset legacy filters
      brightness: 0,
      grayscale: false,
      sepia: false,
      invert: false,
    })
  }, [setStyleValue])

  const isImageLayer = selectedLayer && ['image', 'logo', 'element'].includes(selectedLayer.type)
  const isTextLayer = selectedLayer?.type === 'text'

  // Debug
  React.useEffect(() => {
    console.log('[EffectsPanel] Debug:', {
      selectedLayer: selectedLayer?.type,
      isTextLayer,
      isImageLayer
    })
  }, [selectedLayer, isTextLayer, isImageLayer])

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <ScrollArea className="h-full">
        <div className="px-2 py-2 space-y-3">
          {!selectedLayer && (
            <div className="rounded-md border border-dashed border-border/40 p-4 text-center text-xs text-muted-foreground">
              Selecione um elemento para aplicar efeitos.
            </div>
          )}

          {selectedLayer && !isImageLayer && !isTextLayer && (
            <div className="rounded-md border border-dashed border-border/40 p-4 text-center text-xs text-muted-foreground">
              Efeitos disponíveis para texto e imagens.
            </div>
          )}

          {selectedLayer && isTextLayer && (
            <TextEffectsOnly
              layer={selectedLayer}
              setStyleValue={setStyleValue}
            />
          )}

          {selectedLayer && isImageLayer && (
            <ImageEffectsOnly
              layer={selectedLayer}
              setStyleValue={setStyleValue}
              resetFilters={() => resetImageFilters(selectedLayer)}
            />
          )}
        </div>
      </ScrollArea>
    </div>
  )
}


export function PropertiesPanel() {
  const editor = useTemplateEditor()
  const { design, selectedLayerId } = editor
  const updateLayerPartial = editor.updateLayerPartial

  const selectedLayer = React.useMemo(
    () => design.layers.find((layer) => layer.id === selectedLayerId) ?? null,
    [design.layers, selectedLayerId],
  )

  const [imageEditorOpen, setImageEditorOpen] = React.useState(false)

  const handleCanvasBackground = (event: React.ChangeEvent<HTMLInputElement>) => {
    editor.updateCanvas({ backgroundColor: event.target.value })
  }

  const updatePosition = (field: 'x' | 'y', value: number) => {
    if (!selectedLayer) return
    editor.updateLayer(selectedLayer.id, (layer) => ({
      ...layer,
      position: {
        x: field === 'x' ? value : layer.position?.x ?? 0,
        y: field === 'y' ? value : layer.position?.y ?? 0,
      },
    }))
  }

  const updateSize = (field: 'width' | 'height', value: number) => {
    if (!selectedLayer) return
    editor.updateLayer(selectedLayer.id, (layer) => ({
      ...layer,
      size: {
        width: field === 'width' ? Math.max(1, value) : layer.size?.width ?? 0,
        height: field === 'height' ? Math.max(1, value) : layer.size?.height ?? 0,
      },
    }))
  }

  const handleApplyImageEdit = React.useCallback(
    ({ fileUrl, width, height }: { fileUrl: string; width: number; height: number }) => {
      if (!selectedLayer) return
      editor.updateLayer(selectedLayer.id, (layer) => ({
        ...layer,
        fileUrl,
        size: {
          width,
          height,
        },
      }))
    },
    [editor, selectedLayer],
  )

  const setStyleValue = React.useCallback(
    (layer: Layer, style: Partial<LayerStyle>) => {
      editor.updateLayerStyle(layer.id, style)
    },
    [editor]
  )

  const resetImageFilters = React.useCallback(
    (layer: Layer) => {
      setStyleValue(layer, {
        // Reset all adjustments and filters
        exposure: 0,
        contrast: 0,
        highlights: 0,
        shadows: 0,
        whites: 0,
        blacks: 0,
        saturation: 0,
        blur: 0,
        vignette: 0,
        // Reset legacy filters
        brightness: 0,
        grayscale: false,
        sepia: false,
        invert: false,
      })
    },
    [setStyleValue],
  )

  const isImageLayer = selectedLayer && ['image', 'logo', 'element'].includes(selectedLayer.type)

  return (
    <Tabs defaultValue="properties" className="flex h-full flex-col">
      <div className="flex-shrink-0 border-b border-border/40 bg-muted/20 px-2 py-2">
        <TabsList className="grid h-8 w-full grid-cols-2">
          <TabsTrigger value="properties" className="text-xs">
            <Settings className="mr-2 h-3.5 w-3.5" />
            Propriedades
          </TabsTrigger>
          <TabsTrigger value="layers" className="text-xs">
            <Layers className="mr-2 h-3.5 w-3.5" />
            Camadas
          </TabsTrigger>
        </TabsList>
      </div>

      <TabsContent value="properties" className="flex-1 min-h-0 m-0 data-[state=inactive]:hidden">
        <ScrollArea className="h-full">
          <div className="px-2 py-2">
            <PropertiesContent
              design={design}
              selectedLayer={selectedLayer}
              isImageLayer={isImageLayer}
              editor={editor}
              updateLayerPartial={updateLayerPartial}
              setStyleValue={setStyleValue}
              resetImageFilters={resetImageFilters}
              handleCanvasBackground={handleCanvasBackground}
              updatePosition={updatePosition}
              updateSize={updateSize}
              handleApplyImageEdit={handleApplyImageEdit}
              imageEditorOpen={imageEditorOpen}
              setImageEditorOpen={setImageEditorOpen}
            />
          </div>
        </ScrollArea>
      </TabsContent>

      <TabsContent value="layers" className="flex-1 min-h-0 m-0 data-[state=inactive]:hidden">
        <ScrollArea className="h-full">
          <div className="px-2 py-2">
            <LayersContent />
          </div>
        </ScrollArea>
      </TabsContent>
    </Tabs>
  )
}

function PropertiesContent({
  design,
  selectedLayer,
  isImageLayer,
  editor,
  updateLayerPartial,
  setStyleValue,
  resetImageFilters,
  handleCanvasBackground,
  updatePosition,
  updateSize,
  handleApplyImageEdit,
  imageEditorOpen,
  setImageEditorOpen,
}: {
  design: import('@/types/template').DesignData
  selectedLayer: Layer | null
  isImageLayer: boolean
  editor: ReturnType<typeof useTemplateEditor>
  updateLayerPartial: (id: string, partial: Partial<Layer>) => void
  setStyleValue: (layer: Layer, style: Partial<LayerStyle>) => void
  resetImageFilters: (layer: Layer) => void
  handleCanvasBackground: (event: React.ChangeEvent<HTMLInputElement>) => void
  updatePosition: (field: 'x' | 'y', value: number) => void
  updateSize: (field: 'width' | 'height', value: number) => void
  handleApplyImageEdit: ({ fileUrl, width, height }: { fileUrl: string; width: number; height: number }) => void
  imageEditorOpen: boolean
  setImageEditorOpen: (open: boolean) => void
}) {
  return (
    <div className="space-y-3">
      <div className="space-y-2 rounded-md border border-border/30 bg-muted/30 p-2 text-xs">
        <div className="flex items-center justify-between">
          <span className="font-medium">Canvas</span>
          <span className="text-muted-foreground text-[10px]">
            {design.canvas.width} × {design.canvas.height}
          </span>
        </div>
        <div className="space-y-1">
          <Label htmlFor="canvas-bg" className="text-[10px]">Cor de fundo</Label>
          <div className="flex items-center gap-2">
            <Input
              id="canvas-bg"
              className="h-8 text-xs"
              value={design.canvas.backgroundColor ?? '#ffffff'}
              onChange={handleCanvasBackground}
            />
            <input
              aria-label="Selecionar cor de fundo"
              type="color"
              className="h-8 w-8 rounded-md border border-border/30"
              value={design.canvas.backgroundColor ?? '#ffffff'}
              onChange={handleCanvasBackground}
            />
          </div>
        </div>
      </div>
      <div className="space-y-3">
        {!selectedLayer && (
          <>
            <div className="rounded-md border border-dashed border-border/40 p-4 text-center text-xs text-muted-foreground">
              Selecione uma layer para editar suas propriedades.
            </div>

            {/* Show alignment controls even when no single layer is selected, for multi-selection */}
            {editor.selectedLayerIds.length > 0 && (
              <AlignmentControls selectedCount={editor.selectedLayerIds.length} />
            )}
          </>
        )}

        {selectedLayer && (
          <React.Fragment>
            <div className="space-y-1">
              <Label htmlFor="layer-name" className="text-[10px]">Nome</Label>
              <Input
                id="layer-name"
                className="h-8 text-xs"
                value={selectedLayer.name ?? ''}
                onChange={(event) => updateLayerPartial(selectedLayer.id, { name: event.target.value })}
              />
            </div>

            <div className="grid grid-cols-2 gap-2 text-xs">
              <div className="space-y-1">
                <Label className="text-[10px]">Posição X</Label>
                <Input
                  type="number"
                  className="h-8 text-xs"
                  value={Math.round(selectedLayer.position?.x ?? 0)}
                  onChange={(event) => updatePosition('x', Number(event.target.value))}
                />
              </div>
              <div className="space-y-1">
                <Label className="text-[10px]">Posição Y</Label>
                <Input
                  type="number"
                  className="h-8 text-xs"
                  value={Math.round(selectedLayer.position?.y ?? 0)}
                  onChange={(event) => updatePosition('y', Number(event.target.value))}
                />
              </div>
              <div className="space-y-1">
                <Label className="text-[10px]">Largura</Label>
                <Input
                  type="number"
                  min={1}
                  className="h-8 text-xs"
                  value={Math.round(selectedLayer.size?.width ?? 0)}
                  onChange={(event) => updateSize('width', Number(event.target.value))}
                />
              </div>
              <div className="space-y-1">
                <Label className="text-[10px]">Altura</Label>
                <Input
                  type="number"
                  min={1}
                  className="h-8 text-xs"
                  value={Math.round(selectedLayer.size?.height ?? 0)}
                  onChange={(event) => updateSize('height', Number(event.target.value))}
                />
              </div>
              <div className="space-y-1">
                <Label className="text-[10px]">Rotação</Label>
                <Input
                  type="number"
                  className="h-8 text-xs"
                  value={selectedLayer.rotation ?? 0}
                  onChange={(event) =>
                    updateLayerPartial(selectedLayer.id, { rotation: Number(event.target.value) })
                  }
                />
              </div>
              <div className="space-y-1">
                <Label className="text-[10px]">Opacidade</Label>
                <input
                  type="range"
                  min={10}
                  max={100}
                  className="w-full"
                  value={Math.round((selectedLayer.style?.opacity ?? 1) * 100)}
                  onChange={(event) =>
                    editor.updateLayerStyle(selectedLayer.id, { opacity: Number(event.target.value) / 100 })
                  }
                />
              </div>
            </div>

            {/* Alignment Controls - Show when at least 1 element is selected */}
            <AlignmentControls selectedCount={editor.selectedLayerIds.length} />

            {selectedLayer.type === 'text' && (
              <TextControls layer={selectedLayer} setStyleValue={setStyleValue} updateLayerPartial={updateLayerPartial} />
            )}

            {isImageLayer && (
              <ImageControls
                layer={selectedLayer}
                setStyleValue={setStyleValue}
                updateLayerPartial={updateLayerPartial}
                resetFilters={() => resetImageFilters(selectedLayer)}
                onEdit={() => setImageEditorOpen(true)}
              />
            )}

            {(selectedLayer.type === 'gradient' || selectedLayer.type === 'gradient2') && (
              <GradientProperties layerId={selectedLayer.id} layerType={selectedLayer.type} />
            )}

            {selectedLayer.type === 'shape' && (
              <ShapeControls layer={selectedLayer} setStyleValue={setStyleValue} />
            )}

            {selectedLayer.type === 'icon' && (
              <IconControls layer={selectedLayer} setStyleValue={setStyleValue} />
            )}

            {selectedLayer.type === 'video' && <VideoProperties />}
          </React.Fragment>
        )}
      </div>

      {isImageLayer && (
        <ImageEditorModal
          open={imageEditorOpen}
          onOpenChange={setImageEditorOpen}
          layer={selectedLayer}
          onApply={handleApplyImageEdit}
        />
      )}
    </div>
  )
}

function LayersContent() {
  const { design, selectedLayerIds, selectLayer } = useTemplateEditor()

  const orderedLayers = React.useMemo(() => [...design.layers].sort((a, b) => (b.order ?? 0) - (a.order ?? 0)), [design.layers])

  return (
    <div className="flex h-full flex-col gap-3">
      <div>
        <h3 className="text-sm font-semibold">Camadas</h3>
        <p className="text-xs text-muted-foreground">
          {design.layers.length} {design.layers.length === 1 ? 'camada' : 'camadas'}
        </p>
      </div>
      <ScrollArea className="flex-1">
        <div className="space-y-1">
          {orderedLayers.length === 0 ? (
            <div className="rounded-md border border-dashed border-border/40 p-4 text-center text-xs text-muted-foreground">
              Nenhuma camada adicionada ainda.
            </div>
          ) : (
            orderedLayers.map((layer) => {
              const isSelected = selectedLayerIds.includes(layer.id)
              return (
                <button
                  key={layer.id}
                  onClick={() => selectLayer(layer.id)}
                  className={`flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-xs transition ${
                    isSelected
                      ? 'bg-primary/10 text-primary ring-1 ring-primary/30'
                      : 'hover:bg-muted/50'
                  }`}
                >
                  <div className="flex-1 truncate font-medium">{layer.name || 'Sem nome'}</div>
                  <div className="flex-shrink-0 rounded bg-muted px-2 py-0.5 text-[10px] font-semibold uppercase text-muted-foreground">
                    {layer.type}
                  </div>
                </button>
              )
            })
          )}
        </div>
      </ScrollArea>
    </div>
  )
}

interface TextControlsProps {
  layer: Layer
  setStyleValue: (layer: Layer, style: Partial<LayerStyle>) => void
  updateLayerPartial: (id: string, partial: Partial<Layer>) => void
}

function TextControls({ layer, setStyleValue, updateLayerPartial }: TextControlsProps) {
  return (
    <div className="space-y-2">
      <div className="space-y-1">
        <Label htmlFor="layer-content" className="text-[10px]">Conteúdo</Label>
        <Textarea
          id="layer-content"
          rows={3}
          className="text-xs"
          value={layer.content ?? ''}
          onChange={(event) => updateLayerPartial(layer.id, { content: event.target.value })}
        />
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div className="space-y-1">
          <Label className="text-[10px]">Fonte</Label>
          <Select
            value={layer.style?.fontFamily ?? FONT_CONFIG.DEFAULT_FONT}
            onValueChange={(value) => setStyleValue(layer, { fontFamily: value })}
          >
            <SelectTrigger className="h-8 text-xs">
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
          <Label className="text-[10px]">Tamanho</Label>
          <Input
            type="number"
            min={8}
            className="h-8 text-xs"
            value={layer.style?.fontSize ?? 16}
            onChange={(event) => setStyleValue(layer, { fontSize: Number(event.target.value) })}
          />
        </div>
        <ColorPicker
          label="Cor"
          value={layer.style?.color ?? '#000000'}
          onChange={(color) => setStyleValue(layer, { color })}
        />
        <div className="space-y-1">
          <Label className="text-[10px]">Linha</Label>
          <Input
            type="number"
            step="0.1"
            className="h-8 text-xs"
            value={layer.style?.lineHeight ?? 1.2}
            onChange={(event) => setStyleValue(layer, { lineHeight: Number(event.target.value) })}
          />
        </div>
      </div>

      {/* Text Transform Controls */}
      <div className="space-y-1">
        <Label className="text-[9px] uppercase tracking-wide">Transformação</Label>
        <div className="grid grid-cols-4 gap-1 rounded-md border border-border/30 bg-muted/30 p-1">
          {[
            { value: 'none', label: 'Aa', title: 'Normal' },
            { value: 'uppercase', label: 'AA', title: 'MAIÚSCULAS' },
            { value: 'lowercase', label: 'aa', title: 'minúsculas' },
            { value: 'capitalize', label: 'Aa', title: 'Capitalizar' },
          ].map((transform) => {
            const isActive = (layer.style?.textTransform ?? 'none') === transform.value
            return (
              <button
                key={transform.value}
                type="button"
                title={transform.title}
                className={`
                  rounded px-1 py-1 text-[10px] font-semibold transition-colors
                  ${isActive
                    ? 'bg-primary text-primary-foreground shadow-sm'
                    : 'bg-card hover:bg-accent hover:text-accent-foreground'
                  }
                `}
                onClick={() => setStyleValue(layer, { textTransform: transform.value as 'none' | 'uppercase' | 'lowercase' | 'capitalize' })}
              >
                {transform.label}
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}

interface TextEffectsOnlyProps {
  layer: Layer
  setStyleValue: (layer: Layer, style: Partial<LayerStyle>) => void
}

function TextEffectsOnly({ layer }: TextEffectsOnlyProps) {
  const editor = useTemplateEditor()

  const updateEffect = React.useCallback((effectType: string, config: any) => {
    editor.updateLayer(layer.id, (l) => ({
      ...l,
      effects: {
        ...l.effects,
        [effectType]: config
      }
    }))
  }, [editor, layer.id])

  const effects = layer.effects || {}

  return (
    <div className="space-y-2">
      {/* Blur Effect */}
      <div className="space-y-2 rounded-md border border-border/30 bg-muted/30 p-2">
        <div className="flex items-center justify-between">
          <Label className="text-[10px] font-semibold uppercase">Blur</Label>
          <input
            type="checkbox"
            className="h-4 w-4"
            checked={effects.blur?.enabled || false}
            onChange={(e) => updateEffect('blur', {
              enabled: e.target.checked,
              blurRadius: effects.blur?.blurRadius || 5
            })}
          />
        </div>
        {effects.blur?.enabled && (
          <div className="space-y-1">
            <div className="flex items-center justify-between">
              <Label className="text-[9px]">Intensidade</Label>
              <span className="text-[9px] text-muted-foreground">{effects.blur.blurRadius}</span>
            </div>
            <input
              type="range"
              min={0}
              max={20}
              step={0.5}
              className="w-full h-1"
              value={effects.blur.blurRadius}
              onChange={(e) => updateEffect('blur', {
                ...effects.blur,
                blurRadius: Number(e.target.value)
              })}
            />
          </div>
        )}
      </div>

      {/* Curved Text Effect */}
      <div className="space-y-2 rounded-md border border-border/30 bg-muted/30 p-2">
        <div className="flex items-center justify-between">
          <Label className="text-[10px] font-semibold uppercase">Curved Text</Label>
          <input
            type="checkbox"
            className="h-4 w-4"
            checked={effects.curved?.enabled || false}
            onChange={(e) => updateEffect('curved', {
              enabled: e.target.checked,
              curvature: effects.curved?.curvature || 45
            })}
          />
        </div>
        {effects.curved?.enabled && (
          <div className="space-y-1">
            <div className="flex items-center justify-between">
              <Label className="text-[9px]">Curvatura</Label>
              <span className="text-[9px] text-muted-foreground">{effects.curved.curvature}°</span>
            </div>
            <input
              type="range"
              min={-180}
              max={180}
              step={5}
              className="w-full h-1"
              value={effects.curved.curvature}
              onChange={(e) => updateEffect('curved', {
                ...effects.curved,
                curvature: Number(e.target.value)
              })}
            />
          </div>
        )}
      </div>

      {/* Text Stroke Effect */}
      <div className="space-y-2 rounded-md border border-border/30 bg-muted/30 p-2">
        <div className="flex items-center justify-between">
          <Label className="text-[10px] font-semibold uppercase">Text Stroke</Label>
          <input
            type="checkbox"
            className="h-4 w-4"
            checked={effects.stroke?.enabled || false}
            onChange={(e) => updateEffect('stroke', {
              enabled: e.target.checked,
              strokeColor: effects.stroke?.strokeColor || '#000000',
              strokeWidth: effects.stroke?.strokeWidth || 2
            })}
          />
        </div>
        {effects.stroke?.enabled && (
          <div className="space-y-2">
            <div className="space-y-1">
              <Label className="text-[9px]">Cor</Label>
              <div className="flex items-center gap-2">
                <Input
                  type="text"
                  className="h-7 text-xs flex-1"
                  value={effects.stroke.strokeColor}
                  onChange={(e) => updateEffect('stroke', {
                    ...effects.stroke,
                    strokeColor: e.target.value
                  })}
                />
                <input
                  type="color"
                  className="h-7 w-7 rounded border border-border/30"
                  value={effects.stroke.strokeColor}
                  onChange={(e) => updateEffect('stroke', {
                    ...effects.stroke,
                    strokeColor: e.target.value
                  })}
                />
              </div>
            </div>
            <div className="space-y-1">
              <div className="flex items-center justify-between">
                <Label className="text-[9px]">Espessura</Label>
                <span className="text-[9px] text-muted-foreground">{effects.stroke.strokeWidth}px</span>
              </div>
              <input
                type="range"
                min={0}
                max={10}
                step={0.5}
                className="w-full h-1"
                value={effects.stroke.strokeWidth}
                onChange={(e) => updateEffect('stroke', {
                  ...effects.stroke,
                  strokeWidth: Number(e.target.value)
                })}
              />
            </div>
          </div>
        )}
      </div>

      {/* Background Effect */}
      <div className="space-y-2 rounded-md border border-border/30 bg-muted/30 p-2">
        <div className="flex items-center justify-between">
          <Label className="text-[10px] font-semibold uppercase">Background</Label>
          <input
            type="checkbox"
            className="h-4 w-4"
            checked={effects.background?.enabled || false}
            onChange={(e) => updateEffect('background', {
              enabled: e.target.checked,
              backgroundColor: effects.background?.backgroundColor || '#ffffff',
              padding: effects.background?.padding || 10
            })}
          />
        </div>
        {effects.background?.enabled && (
          <div className="space-y-2">
            <div className="space-y-1">
              <Label className="text-[9px]">Cor</Label>
              <div className="flex items-center gap-2">
                <Input
                  type="text"
                  className="h-7 text-xs flex-1"
                  value={effects.background.backgroundColor}
                  onChange={(e) => updateEffect('background', {
                    ...effects.background,
                    backgroundColor: e.target.value
                  })}
                />
                <input
                  type="color"
                  className="h-7 w-7 rounded border border-border/30"
                  value={effects.background.backgroundColor}
                  onChange={(e) => updateEffect('background', {
                    ...effects.background,
                    backgroundColor: e.target.value
                  })}
                />
              </div>
            </div>
            <div className="space-y-1">
              <div className="flex items-center justify-between">
                <Label className="text-[9px]">Padding</Label>
                <span className="text-[9px] text-muted-foreground">{effects.background.padding}px</span>
              </div>
              <input
                type="range"
                min={0}
                max={20}
                step={1}
                className="w-full h-1"
                value={effects.background.padding}
                onChange={(e) => updateEffect('background', {
                  ...effects.background,
                  padding: Number(e.target.value)
                })}
              />
            </div>
          </div>
        )}
      </div>

      {/* Shadow Effect */}
      <div className="space-y-2 rounded-md border border-border/30 bg-muted/30 p-2">
        <div className="flex items-center justify-between">
          <Label className="text-[10px] font-semibold uppercase">Shadow</Label>
          <input
            type="checkbox"
            className="h-4 w-4"
            checked={effects.shadow?.enabled || false}
            onChange={(e) => updateEffect('shadow', {
              enabled: e.target.checked,
              shadowColor: effects.shadow?.shadowColor || '#000000',
              shadowBlur: effects.shadow?.shadowBlur || 10,
              shadowOffsetX: effects.shadow?.shadowOffsetX || 5,
              shadowOffsetY: effects.shadow?.shadowOffsetY || 5,
              shadowOpacity: effects.shadow?.shadowOpacity || 0.5
            })}
          />
        </div>
        {effects.shadow?.enabled && (
          <div className="space-y-2">
            <div className="space-y-1">
              <Label className="text-[9px]">Cor</Label>
              <div className="flex items-center gap-2">
                <Input
                  type="text"
                  className="h-7 text-xs flex-1"
                  value={effects.shadow.shadowColor}
                  onChange={(e) => updateEffect('shadow', {
                    ...effects.shadow,
                    shadowColor: e.target.value
                  })}
                />
                <input
                  type="color"
                  className="h-7 w-7 rounded border border-border/30"
                  value={effects.shadow.shadowColor}
                  onChange={(e) => updateEffect('shadow', {
                    ...effects.shadow,
                    shadowColor: e.target.value
                  })}
                />
              </div>
            </div>
            <div className="space-y-1">
              <div className="flex items-center justify-between">
                <Label className="text-[9px]">Desfoque</Label>
                <span className="text-[9px] text-muted-foreground">{effects.shadow.shadowBlur}px</span>
              </div>
              <input
                type="range"
                min={0}
                max={20}
                step={1}
                className="w-full h-1"
                value={effects.shadow.shadowBlur}
                onChange={(e) => updateEffect('shadow', {
                  ...effects.shadow,
                  shadowBlur: Number(e.target.value)
                })}
              />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <Label className="text-[9px]">Offset X</Label>
                  <span className="text-[9px] text-muted-foreground">{effects.shadow.shadowOffsetX}px</span>
                </div>
                <input
                  type="range"
                  min={-50}
                  max={50}
                  step={1}
                  className="w-full h-1"
                  value={effects.shadow.shadowOffsetX}
                  onChange={(e) => updateEffect('shadow', {
                    ...effects.shadow,
                    shadowOffsetX: Number(e.target.value)
                  })}
                />
              </div>
              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <Label className="text-[9px]">Offset Y</Label>
                  <span className="text-[9px] text-muted-foreground">{effects.shadow.shadowOffsetY}px</span>
                </div>
                <input
                  type="range"
                  min={-50}
                  max={50}
                  step={1}
                  className="w-full h-1"
                  value={effects.shadow.shadowOffsetY}
                  onChange={(e) => updateEffect('shadow', {
                    ...effects.shadow,
                    shadowOffsetY: Number(e.target.value)
                  })}
                />
              </div>
            </div>
            <div className="space-y-1">
              <div className="flex items-center justify-between">
                <Label className="text-[9px]">Opacidade</Label>
                <span className="text-[9px] text-muted-foreground">{Math.round(effects.shadow.shadowOpacity * 100)}%</span>
              </div>
              <input
                type="range"
                min={0}
                max={1}
                step={0.1}
                className="w-full h-1"
                value={effects.shadow.shadowOpacity}
                onChange={(e) => updateEffect('shadow', {
                  ...effects.shadow,
                  shadowOpacity: Number(e.target.value)
                })}
              />
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

interface ImageEffectsOnlyProps {
  layer: Layer
  setStyleValue: (layer: Layer, style: Partial<LayerStyle>) => void
  resetFilters: () => void
}


function ImageEffectsOnly({ layer, setStyleValue, resetFilters }: ImageEffectsOnlyProps) {
  const handleResetAdjustments = () => {
    setStyleValue(layer, {
      exposure: 0,
      contrast: 0,
      highlights: 0,
      shadows: 0,
      whites: 0,
      blacks: 0,
      saturation: 0,
    })
  }

  const handleResetFilters = () => {
    setStyleValue(layer, {
      blur: 0,
      vignette: 0,
    })
  }

  return (
    <div className="space-y-3 text-xs">
      {/* Basic Adjustments Section */}
      <div className="rounded-md border border-border/30 bg-muted/30 p-3">
        <div className="flex items-center justify-between mb-3">
          <span className="text-[10px] font-semibold uppercase tracking-wide">Ajustes Básicos</span>
          <Button variant="ghost" size="sm" className="h-6 text-[10px] px-2" onClick={handleResetAdjustments}>
            Resetar
          </Button>
        </div>
        <div className="space-y-2.5">
          <FilterSlider
            label="Exposição"
            min={-1}
            max={1}
            step={0.05}
            value={layer.style?.exposure ?? 0}
            onChange={(value) => setStyleValue(layer, { exposure: value })}
          />
          <FilterSlider
            label="Contraste"
            min={-2}
            max={2}
            step={0.05}
            value={layer.style?.contrast ?? 0}
            onChange={(value) => setStyleValue(layer, { contrast: value })}
          />
          <FilterSlider
            label="Realces"
            min={-100}
            max={100}
            step={1}
            value={layer.style?.highlights ?? 0}
            onChange={(value) => setStyleValue(layer, { highlights: value })}
          />
          <FilterSlider
            label="Sombras"
            min={-100}
            max={100}
            step={1}
            value={layer.style?.shadows ?? 0}
            onChange={(value) => setStyleValue(layer, { shadows: value })}
          />
          <FilterSlider
            label="Brancos"
            min={-100}
            max={100}
            step={1}
            value={layer.style?.whites ?? 0}
            onChange={(value) => setStyleValue(layer, { whites: value })}
          />
          <FilterSlider
            label="Pretos"
            min={-100}
            max={100}
            step={1}
            value={layer.style?.blacks ?? 0}
            onChange={(value) => setStyleValue(layer, { blacks: value })}
          />
          <FilterSlider
            label="Saturação"
            min={-2}
            max={2}
            step={0.1}
            value={layer.style?.saturation ?? 0}
            onChange={(value) => setStyleValue(layer, { saturation: value })}
          />
        </div>
      </div>

      {/* Filters Section */}
      <div className="rounded-md border border-border/30 bg-muted/30 p-3">
        <div className="flex items-center justify-between mb-3">
          <span className="text-[10px] font-semibold uppercase tracking-wide">Filtros</span>
          <Button variant="ghost" size="sm" className="h-6 text-[10px] px-2" onClick={handleResetFilters}>
            Resetar
          </Button>
        </div>
        <div className="space-y-2.5">
          <FilterSlider
            label="Blur"
            min={0}
            max={30}
            step={0.5}
            value={layer.style?.blur ?? 0}
            onChange={(value) => setStyleValue(layer, { blur: value })}
          />
          <FilterSlider
            label="Vinheta"
            min={0}
            max={1.5}
            step={0.05}
            value={layer.style?.vignette ?? 0}
            onChange={(value) => setStyleValue(layer, { vignette: value })}
          />
        </div>
      </div>
    </div>
  )
}

interface ImageControlsProps {
  layer: Layer
  setStyleValue: (layer: Layer, style: Partial<LayerStyle>) => void
  updateLayerPartial: (id: string, partial: Partial<Layer>) => void
  resetFilters: () => void
  onEdit: () => void
}

function ImageControls({ layer, setStyleValue, updateLayerPartial, resetFilters, onEdit }: ImageControlsProps) {
  return (
    <div className="space-y-2 text-xs">
      <div className="space-y-1">
        <Label htmlFor="layer-file-url" className="text-[10px]">URL da imagem</Label>
        <Input
          id="layer-file-url"
          className="h-8 text-xs"
          value={layer.fileUrl ?? ''}
          onChange={(event) => updateLayerPartial(layer.id, { fileUrl: event.target.value })}
        />
      </div>

      {/* Toggle para marcar imagem como dinâmica (editável no gerador de criativos) */}
      <div className="flex items-center justify-between rounded-md border border-border/30 bg-muted/30 p-2">
        <div className="space-y-0.5">
          <Label htmlFor="layer-is-dynamic" className="text-[10px] font-semibold">
            Imagem Dinâmica
          </Label>
          <p className="text-[9px] text-muted-foreground">
            Permitir substituição no gerador de criativos
          </p>
        </div>
        <Switch
          id="layer-is-dynamic"
          checked={layer.isDynamic ?? false}
          onCheckedChange={(checked) => updateLayerPartial(layer.id, { isDynamic: checked })}
        />
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div className="space-y-1">
          <Label className="text-[10px]">Object Fit</Label>
          <Select
            value={layer.style?.objectFit ?? 'cover'}
            onValueChange={(value) =>
              setStyleValue(layer, { objectFit: value as 'cover' | 'contain' | 'fill' })
            }
          >
            <SelectTrigger className="h-8 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="cover">Cover</SelectItem>
              <SelectItem value="contain">Contain</SelectItem>
              <SelectItem value="fill">Fill</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="flex items-end">
          <Button variant="outline" size="sm" className="h-8 w-full text-xs" onClick={onEdit}>
            Editar
          </Button>
        </div>
      </div>

      {/* Controle de posição do crop (somente para objectFit: cover) */}
      {layer.style?.objectFit === 'cover' && (
        <div className="space-y-1">
          <Label className="text-[9px] uppercase tracking-wide">Crop</Label>
          <div className="grid grid-cols-3 gap-1 rounded-md border border-border/30 bg-muted/30 p-1">
            {[
              { value: 'left-top', label: 'TL', title: 'Topo Esquerda' },
              { value: 'center-top', label: 'TC', title: 'Topo Centro' },
              { value: 'right-top', label: 'TR', title: 'Topo Direita' },
              { value: 'left-middle', label: 'ML', title: 'Meio Esquerda' },
              { value: 'center-middle', label: 'MC', title: 'Centro' },
              { value: 'right-middle', label: 'MR', title: 'Meio Direita' },
              { value: 'left-bottom', label: 'BL', title: 'Base Esquerda' },
              { value: 'center-bottom', label: 'BC', title: 'Base Centro' },
              { value: 'right-bottom', label: 'BR', title: 'Base Direita' },
            ].map((pos) => {
              const isActive = (layer.style?.cropPosition ?? 'center-middle') === pos.value
              return (
                <button
                  key={pos.value}
                  type="button"
                  title={pos.title}
                  className={`
                    rounded px-1 py-1 text-[9px] font-semibold transition-colors
                    ${isActive
                      ? 'bg-primary text-primary-foreground shadow-sm'
                      : 'bg-card hover:bg-accent hover:text-accent-foreground'
                    }
                  `}
                  onClick={() => setStyleValue(layer, { cropPosition: pos.value as 'left-top' | 'center-top' | 'right-top' | 'left-middle' | 'center-middle' | 'right-middle' | 'left-bottom' | 'center-bottom' | 'right-bottom' })}
                >
                  {pos.label}
                </button>
              )
            })}
          </div>
        </div>
      )}

      {/* Basic Adjustments Section */}
      <div className="rounded-md border border-border/30 bg-muted/30 p-3">
        <div className="flex items-center justify-between mb-3">
          <span className="text-[10px] font-semibold uppercase tracking-wide">Ajustes Básicos</span>
          <Button variant="ghost" size="sm" className="h-6 text-[10px] px-2" onClick={() => setStyleValue(layer, {
            exposure: 0,
            contrast: 0,
            highlights: 0,
            shadows: 0,
            whites: 0,
            blacks: 0,
            saturation: 0,
          })}>
            Resetar
          </Button>
        </div>
        <div className="space-y-2.5">
          <FilterSlider
            label="Exposição"
            min={-1}
            max={1}
            step={0.05}
            value={layer.style?.exposure ?? 0}
            onChange={(value) => setStyleValue(layer, { exposure: value })}
          />
          <FilterSlider
            label="Contraste"
            min={-2}
            max={2}
            step={0.05}
            value={layer.style?.contrast ?? 0}
            onChange={(value) => setStyleValue(layer, { contrast: value })}
          />
          <FilterSlider
            label="Realces"
            min={-100}
            max={100}
            step={1}
            value={layer.style?.highlights ?? 0}
            onChange={(value) => setStyleValue(layer, { highlights: value })}
          />
          <FilterSlider
            label="Sombras"
            min={-100}
            max={100}
            step={1}
            value={layer.style?.shadows ?? 0}
            onChange={(value) => setStyleValue(layer, { shadows: value })}
          />
          <FilterSlider
            label="Brancos"
            min={-100}
            max={100}
            step={1}
            value={layer.style?.whites ?? 0}
            onChange={(value) => setStyleValue(layer, { whites: value })}
          />
          <FilterSlider
            label="Pretos"
            min={-100}
            max={100}
            step={1}
            value={layer.style?.blacks ?? 0}
            onChange={(value) => setStyleValue(layer, { blacks: value })}
          />
          <FilterSlider
            label="Saturação"
            min={-2}
            max={2}
            step={0.1}
            value={layer.style?.saturation ?? 0}
            onChange={(value) => setStyleValue(layer, { saturation: value })}
          />
        </div>
      </div>

      {/* Filters Section */}
      <div className="rounded-md border border-border/30 bg-muted/30 p-3">
        <div className="flex items-center justify-between mb-3">
          <span className="text-[10px] font-semibold uppercase tracking-wide">Filtros</span>
          <Button variant="ghost" size="sm" className="h-6 text-[10px] px-2" onClick={() => setStyleValue(layer, {
            blur: 0,
            vignette: 0,
          })}>
            Resetar
          </Button>
        </div>
        <div className="space-y-2.5">
          <FilterSlider
            label="Blur"
            min={0}
            max={30}
            step={0.5}
            value={layer.style?.blur ?? 0}
            onChange={(value) => setStyleValue(layer, { blur: value })}
          />
          <FilterSlider
            label="Vinheta"
            min={0}
            max={1.5}
            step={0.05}
            value={layer.style?.vignette ?? 0}
            onChange={(value) => setStyleValue(layer, { vignette: value })}
          />
        </div>
      </div>
    </div>
  )
}

interface ShapeControlsProps {
  layer: Layer
  setStyleValue: (layer: Layer, style: Partial<LayerStyle>) => void
}

function ShapeControls({ layer, setStyleValue }: ShapeControlsProps) {
  return (
    <div className="space-y-3 text-xs">
      <div className="space-y-1">
        <Label>Preenchimento</Label>
        <div className="flex items-center gap-2">
          <Input
            value={layer.style?.fill ?? '#2563eb'}
            onChange={(event) => setStyleValue(layer, { fill: event.target.value })}
          />
          <input
            type="color"
            className="h-9 w-9 rounded-md border border-border/30"
            value={layer.style?.fill ?? '#2563eb'}
            onChange={(event) => setStyleValue(layer, { fill: event.target.value })}
          />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <Label>Cor da borda</Label>
          <Input
            value={layer.style?.strokeColor ?? '#1e3a8a'}
            onChange={(event) => setStyleValue(layer, { strokeColor: event.target.value })}
          />
        </div>
        <div className="space-y-1">
          <Label>Espessura</Label>
          <Input
            type="number"
            min={0}
            value={layer.style?.strokeWidth ?? 0}
            onChange={(event) => setStyleValue(layer, { strokeWidth: Number(event.target.value) })}
          />
        </div>
      </div>
    </div>
  )
}

interface IconControlsProps {
  layer: Layer
  setStyleValue: (layer: Layer, style: Partial<LayerStyle>) => void
}

function IconControls({ layer, setStyleValue }: IconControlsProps) {
  return (
    <div className="space-y-3 text-xs">
      <div className="space-y-1">
        <Label>Cor do ícone</Label>
        <div className="flex items-center gap-2">
          <Input
            value={layer.style?.fill ?? '#111111'}
            onChange={(event) => setStyleValue(layer, { fill: event.target.value })}
          />
          <input
            type="color"
            className="h-9 w-9 rounded-md border border-border/30"
            value={layer.style?.fill ?? '#111111'}
            onChange={(event) => setStyleValue(layer, { fill: event.target.value })}
          />
        </div>
      </div>
      <div className="space-y-1">
        <Label>Espessura do traço</Label>
        <Input
          type="number"
          min={0}
          value={layer.style?.strokeWidth ?? 0}
          onChange={(event) => setStyleValue(layer, { strokeWidth: Number(event.target.value) })}
        />
      </div>
    </div>
  )
}

interface FilterSliderProps {
  label: string
  min: number
  max: number
  step: number
  value: number
  onChange: (value: number) => void
}

function FilterSlider({ label, min, max, step, value, onChange }: FilterSliderProps) {
  return (
    <div className="space-y-0.5">
      <div className="flex items-center justify-between">
        <span className="text-[9px] font-semibold uppercase text-muted-foreground">{label}</span>
        <span className="text-[9px] text-muted-foreground">{value.toFixed(1)}</span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        className="w-full h-1"
        onChange={(event) => onChange(Number(event.target.value))}
      />
    </div>
  )
}

interface ToggleChipProps {
  label: string
  active: boolean
  onToggle: (active: boolean) => void
}

function ToggleChip({ label, active, onToggle }: ToggleChipProps) {
  return (
    <button
      type="button"
      onClick={() => onToggle(!active)}
      className={
        'rounded-full border px-2 py-0.5 text-[9px] font-semibold uppercase transition ' +
        (active ? 'border-primary bg-primary/10 text-primary' : 'border-border/50 bg-muted/40 text-muted-foreground')
      }
    >
      {label}
    </button>
  )
}

interface AlignmentControlsProps {
  selectedCount: number
}

function AlignmentControls({ selectedCount }: AlignmentControlsProps) {
  const {
    alignSelectedLeft,
    alignSelectedCenterH,
    alignSelectedRight,
    alignSelectedTop,
    alignSelectedMiddleV,
    alignSelectedBottom,
    distributeSelectedH,
    distributeSelectedV,
    bringSelectedToFront,
    sendSelectedToBack,
    moveSelectedForward,
    moveSelectedBackward,
    alignSelectedToCanvasCenterH,
    alignSelectedToCanvasCenterV,
  } = useTemplateEditor()

  const alignDisabled = selectedCount < 2
  const distributeDisabled = selectedCount < 3
  const orderDisabled = selectedCount === 0
  const canvasAlignDisabled = selectedCount === 0

  return (
    <div className="space-y-2 rounded-md border border-border/30 bg-muted/30 p-2 text-xs">
      <div className="flex items-center justify-between">
        <span className="font-semibold text-[10px]">Alinhamento</span>
        <span className="text-[9px] text-muted-foreground">
          {selectedCount} sel.
        </span>
      </div>

      {/* Horizontal Alignment */}
      <div className="space-y-1">
        <Label className="text-[9px] uppercase tracking-wide">Horizontal</Label>
        <div className="grid grid-cols-3 gap-1">
          <Button
            variant="outline"
            size="sm"
            disabled={alignDisabled}
            onClick={alignSelectedLeft}
            className="h-7 w-full p-0"
            title="Alinhar à esquerda (Shift+Ctrl+L)"
          >
            <AlignLeft className="h-3 w-3" />
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={alignDisabled}
            onClick={alignSelectedCenterH}
            className="h-7 w-full p-0"
            title="Centralizar horizontalmente (Shift+Ctrl+C)"
          >
            <AlignCenter className="h-3 w-3" />
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={alignDisabled}
            onClick={alignSelectedRight}
            className="h-7 w-full p-0"
            title="Alinhar à direita (Shift+Ctrl+R)"
          >
            <AlignRight className="h-3 w-3" />
          </Button>
        </div>
      </div>

      {/* Vertical Alignment */}
      <div className="space-y-1">
        <Label className="text-[9px] uppercase tracking-wide">Vertical</Label>
        <div className="grid grid-cols-3 gap-1">
          <Button
            variant="outline"
            size="sm"
            disabled={alignDisabled}
            onClick={alignSelectedTop}
            className="h-7 w-full p-0"
            title="Alinhar ao topo (Shift+Ctrl+T)"
          >
            <AlignVerticalJustifyStart className="h-3 w-3" />
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={alignDisabled}
            onClick={alignSelectedMiddleV}
            className="h-7 w-full p-0"
            title="Centralizar verticalmente (Shift+Ctrl+M)"
          >
            <AlignVerticalJustifyCenter className="h-3 w-3" />
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={alignDisabled}
            onClick={alignSelectedBottom}
            className="h-7 w-full p-0"
            title="Alinhar ao fundo (Shift+Ctrl+B)"
          >
            <AlignVerticalJustifyEnd className="h-3 w-3" />
          </Button>
        </div>
      </div>

      {/* Canvas Alignment */}
      <div className="space-y-1">
        <Label className="text-[9px] uppercase tracking-wide">Canvas</Label>
        <div className="grid grid-cols-2 gap-1">
          <Button
            variant="outline"
            size="sm"
            disabled={canvasAlignDisabled}
            onClick={alignSelectedToCanvasCenterH}
            className="h-7 w-full gap-1 px-1"
            title="Centralizar no canvas horizontalmente (Shift+Alt+C)"
          >
            <AlignCenter className="h-3 w-3" />
            <span className="text-[9px]">H</span>
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={canvasAlignDisabled}
            onClick={alignSelectedToCanvasCenterV}
            className="h-7 w-full gap-1 px-1"
            title="Centralizar no canvas verticalmente (Shift+Alt+M)"
          >
            <AlignVerticalJustifyCenter className="h-3 w-3" />
            <span className="text-[9px]">V</span>
          </Button>
        </div>
      </div>

      {/* Layer Ordering */}
      <div className="space-y-1">
        <Label className="text-[9px] uppercase tracking-wide">Camadas</Label>
        <div className="grid grid-cols-4 gap-1">
          <Button
            variant="outline"
            size="sm"
            disabled={orderDisabled}
            onClick={bringSelectedToFront}
            className="h-7 w-full p-0"
            title="Trazer para frente (Ctrl+])"
          >
            <BringToFront className="h-3 w-3" />
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={orderDisabled}
            onClick={moveSelectedForward}
            className="h-7 w-full p-0"
            title="Mover para frente (Ctrl+Shift+])"
          >
            <ArrowUp className="h-3 w-3" />
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={orderDisabled}
            onClick={moveSelectedBackward}
            className="h-7 w-full p-0"
            title="Mover para trás (Ctrl+Shift+[)"
          >
            <ArrowDown className="h-3 w-3" />
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={orderDisabled}
            onClick={sendSelectedToBack}
            className="h-7 w-full p-0"
            title="Enviar para trás (Ctrl+[)"
          >
            <SendToBack className="h-3 w-3" />
          </Button>
        </div>
      </div>

      {alignDisabled && (
        <p className="text-[9px] text-muted-foreground">
          ℹ️ Selecione 2+ elementos
        </p>
      )}
    </div>
  )
}
