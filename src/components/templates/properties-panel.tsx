"use client"

import * as React from 'react'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Button } from '@/components/ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Settings, Layers } from 'lucide-react'
import { FONT_CONFIG } from '@/lib/font-config'
import { useTemplateEditor } from '@/contexts/template-editor-context'
import type { Layer, LayerStyle } from '@/types/template'
import { ImageEditorModal } from './modals/image-editor-modal'
import { ColorPicker } from '@/components/canvas/effects/ColorPicker'

const FONT_OPTIONS = FONT_CONFIG.AVAILABLE_FONTS

const IMAGE_FILTER_PRESETS: Array<{
  id: string
  label: string
  style: Partial<Pick<LayerStyle, 'blur' | 'brightness' | 'contrast' | 'grayscale' | 'sepia' | 'invert'>>
}> = [
  { id: 'original', label: 'Original', style: { blur: 0, brightness: 0, contrast: 0, grayscale: false, sepia: false, invert: false } },
  { id: 'warm', label: 'Quente', style: { brightness: 0.1, contrast: 0.1, sepia: true, grayscale: false, invert: false } },
  { id: 'cool', label: 'Frio', style: { brightness: -0.1, contrast: 0.15, grayscale: false, sepia: false, invert: false } },
  { id: 'dramatic', label: 'Dramático', style: { brightness: -0.2, contrast: 0.3, grayscale: false, sepia: false, invert: false } },
  { id: 'mono', label: 'Monocromático', style: { grayscale: true, sepia: false, invert: false, brightness: 0, contrast: 0.1 } },
]

interface GradientPropertiesProps {
  layerId: string
  layerType: 'gradient' | 'gradient2'
}

function GradientProperties({ layerId, layerType }: GradientPropertiesProps) {
  const { design, updateLayerStyle } = useTemplateEditor()
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
    [editor],
  )

  const resetImageFilters = React.useCallback(
    (layer: Layer) => {
      setStyleValue(layer, {
        blur: 0,
        brightness: 0,
        contrast: 0,
        grayscale: false,
        sepia: false,
        invert: false,
      })
    },
    [setStyleValue],
  )

  const isImageLayer = selectedLayer && ['image', 'logo', 'element'].includes(selectedLayer.type)

  return (
    <Tabs defaultValue="properties" className="flex h-full flex-col overflow-hidden">
      <div className="flex-shrink-0 border-b border-border/40 bg-muted/20 p-3">
        <TabsList className="grid h-9 w-full grid-cols-2">
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

      <TabsContent value="properties" className="flex-1 overflow-hidden p-4 data-[state=inactive]:hidden">
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
      </TabsContent>

      <TabsContent value="layers" className="flex-1 overflow-hidden p-4 data-[state=inactive]:hidden">
        <LayersContent />
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
  design: any
  selectedLayer: Layer | null
  isImageLayer: boolean
  editor: any
  updateLayerPartial: any
  setStyleValue: any
  resetImageFilters: any
  handleCanvasBackground: any
  updatePosition: any
  updateSize: any
  handleApplyImageEdit: any
  imageEditorOpen: boolean
  setImageEditorOpen: (open: boolean) => void
}) {
  return (
    <div className="flex h-full flex-col gap-3">
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
            <React.Fragment>
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
                <div>
                  <Label>Opacidade</Label>
                  <input
                    type="range"
                    min={10}
                    max={100}
                    value={Math.round((selectedLayer.style?.opacity ?? 1) * 100)}
                    onChange={(event) =>
                      editor.updateLayerStyle(selectedLayer.id, { opacity: Number(event.target.value) / 100 })
                    }
                  />
                </div>
              </div>

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
            </React.Fragment>
          )}
        </div>
      </ScrollArea>

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
  const { design, selectedLayerIds, selectLayer, toggleLayerVisibility, toggleLayerLock } = useTemplateEditor()

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
    <div className="space-y-4">
      <div className="space-y-1">
        <Label htmlFor="layer-content">Conteúdo</Label>
        <Textarea
          id="layer-content"
          rows={4}
          value={layer.content ?? ''}
          onChange={(event) => updateLayerPartial(layer.id, { content: event.target.value })}
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <Label>Fonte</Label>
          <Select
            value={layer.style?.fontFamily ?? FONT_CONFIG.DEFAULT_FONT}
            onValueChange={(value) => setStyleValue(layer, { fontFamily: value })}
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
            value={layer.style?.fontSize ?? 16}
            onChange={(event) => setStyleValue(layer, { fontSize: Number(event.target.value) })}
          />
        </div>
        <ColorPicker
          label="Cor do Texto"
          value={layer.style?.color ?? '#000000'}
          onChange={(color) => setStyleValue(layer, { color })}
        />
        <div className="space-y-1">
          <Label>Altura de linha</Label>
          <Input
            type="number"
            step="0.1"
            value={layer.style?.lineHeight ?? 1.2}
            onChange={(event) => setStyleValue(layer, { lineHeight: Number(event.target.value) })}
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
    <div className="space-y-4 text-xs">
      <div className="space-y-1">
        <Label htmlFor="layer-file-url">URL da imagem</Label>
        <Input
          id="layer-file-url"
          value={layer.fileUrl ?? ''}
          onChange={(event) => updateLayerPartial(layer.id, { fileUrl: event.target.value })}
        />
      </div>
      <div className="space-y-1">
        <Label>Object Fit</Label>
        <Select
          value={layer.style?.objectFit ?? 'cover'}
          onValueChange={(value) =>
            setStyleValue(layer, { objectFit: value as 'cover' | 'contain' | 'fill' })
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

      {/* Controle de posição do crop (somente para objectFit: cover) */}
      {layer.style?.objectFit === 'cover' && (
        <div className="space-y-2">
          <Label className="text-xs">Posição do Crop</Label>
          <div className="grid grid-cols-3 gap-1 rounded-md border border-border/30 bg-muted/30 p-2">
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
                    rounded px-2 py-1.5 text-[10px] font-semibold transition-colors
                    ${isActive
                      ? 'bg-primary text-primary-foreground shadow-sm'
                      : 'bg-card hover:bg-accent hover:text-accent-foreground'
                    }
                  `}
                  onClick={() => setStyleValue(layer, { cropPosition: pos.value as any })}
                >
                  {pos.label}
                </button>
              )
            })}
          </div>
          <p className="text-[10px] text-muted-foreground">
            Define qual parte da imagem será visível quando redimensionada
          </p>
        </div>
      )}

      <div className="rounded-md border border-border/30 bg-muted/30 p-3">
        <div className="flex items-center justify-between">
          <span className="text-[11px] font-semibold uppercase text-muted-foreground">Filtros</span>
          <Button variant="ghost" size="sm" onClick={resetFilters}>
            Resetar
          </Button>
        </div>
        <div className="mt-3 space-y-3">
          <FilterSlider
            label="Desfoque"
            min={0}
            max={15}
            step={0.5}
            value={layer.style?.blur ?? 0}
            onChange={(value) => setStyleValue(layer, { blur: value })}
          />
          <FilterSlider
            label="Brilho"
            min={-1}
            max={1}
            step={0.05}
            value={layer.style?.brightness ?? 0}
            onChange={(value) => setStyleValue(layer, { brightness: value })}
          />
          <FilterSlider
            label="Contraste"
            min={-1}
            max={1}
            step={0.05}
            value={layer.style?.contrast ?? 0}
            onChange={(value) => setStyleValue(layer, { contrast: value })}
          />
          <div className="flex flex-wrap gap-2">
            <ToggleChip
              label="P&B"
              active={Boolean(layer.style?.grayscale)}
              onToggle={(active) => setStyleValue(layer, { grayscale: active })}
            />
            <ToggleChip
              label="Sépia"
              active={Boolean(layer.style?.sepia)}
              onToggle={(active) => setStyleValue(layer, { sepia: active })}
            />
            <ToggleChip
              label="Inverter"
              active={Boolean(layer.style?.invert)}
              onToggle={(active) => setStyleValue(layer, { invert: active })}
            />
          </div>
        </div>
        <div className="mt-4 space-y-2">
          <p className="text-[11px] font-semibold uppercase text-muted-foreground">Presets</p>
          <div className="flex flex-wrap gap-2">
            {IMAGE_FILTER_PRESETS.map((preset) => (
              <Button
                key={preset.id}
                variant="outline"
                size="sm"
                onClick={() => setStyleValue(layer, preset.style)}
              >
                {preset.label}
              </Button>
            ))}
          </div>
        </div>
      </div>

      <Button variant="outline" size="sm" onClick={onEdit}>
        Abrir editor de imagem
      </Button>
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
    <div className="space-y-1">
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-semibold uppercase text-muted-foreground">{label}</span>
        <span className="text-[11px] text-muted-foreground">{value.toFixed(2)}</span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
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
        'rounded-full border px-3 py-1 text-[11px] font-semibold uppercase transition ' +
        (active ? 'border-primary bg-primary/10 text-primary' : 'border-border/50 bg-muted/40 text-muted-foreground')
      }
    >
      {label}
    </button>
  )
}
