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
  FlipHorizontal2,
  FlipVertical2,
  Link2,
  Lock,
  Unlock,
} from 'lucide-react'
import { FONT_CONFIG } from '@/lib/font-config'
import { patchLineHeight } from '@/lib/text-line-height'
import { getFontManager } from '@/lib/font-manager'
import { useTemplateEditor } from '@/contexts/template-editor-context'
import type { Layer, LayerStyle } from '@/types/template'
import { controlesDaForma } from '@/lib/konva/trava-de-proporcao'
import { lerCor } from '@/lib/vetor/cor'
import { corParaSeletor } from '@/lib/editor/cor-do-seletor'
import { escolhaExplicitaDaCor } from '@/lib/editor/camada-do-elemento'
import {
  alvoValido,
  atualizadorDoReaplicar,
  alvoDaChave,
  chavesDaForma,
  classificarPaleta,
  coresNestaPagina,
  estiloComCorDoSlot,
  fallbackDaChave,
  valorDaChave,
  DICA_DO_ELO,
  eloDoCanal,
  podeReaplicar,
  reaplicarCoresDaMarca,
  resumoDoReaplicar,
  rotuloDoCanal,
  swatchAtivo,
  type AlvoDoReaplicar,
  type CorAplicavel,
  type SituacaoDoEditor,
} from '@/lib/editor/cores-da-forma'
import { estadoDaInsercao } from '@/lib/editor/estado-da-insercao'
import { useBrandColorsEstrita } from '@/hooks/use-brand-colors'
import { useProject } from '@/hooks/use-project'
import { useMultiPageOpcional } from '@/contexts/multi-page-context'
import type { ChaveDeCor } from '@/lib/vetor/tipos'
import { ehMulticor } from '@/lib/vetor/partes'
import { ImageEditorModal } from './modals/image-editor-modal'
import { GradientEditor } from './gradient-editor'
import { ColorPicker } from '@/components/canvas/effects/ColorPicker'
import { BrandColorSwatches } from './brand-color-swatches'
import { FundoDeTextoControls } from './fundo-de-texto-controls'
import { VideoProperties } from './video-properties'
import { CamposDaCaixa } from './grade-toolbar'
import { metadadoDeGrade } from '@/lib/grades/conferir'
import {
  applyOpacityToEditableColor,
  corDigitadaParaGravar,
  estiloComOpacidadeDaForma,
  opacidadeDaForma,
  parseColorOpacity,
} from '@/lib/shape-style'

// Image filter presets removed - professional adjustments should be configured manually

interface GradientPropertiesProps {
  layerId: string
}

function GradientProperties({ layerId }: GradientPropertiesProps) {
  return (
    <div className="space-y-3 rounded-md border border-border/30 bg-muted/30 p-3 text-xs">
      <span className="font-semibold">Gradiente</span>
      <GradientEditor layerId={layerId} />
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
  // Shape ganhou blur (o halo do canvas de design): ShapeNode e o render
  // server-side leem o mesmo `effects.blur` do texto.
  const isShapeLayer = selectedLayer?.type === 'shape'

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

          {selectedLayer && !isImageLayer && !isTextLayer && !isShapeLayer && (
            <div className="rounded-md border border-dashed border-border/40 p-4 text-center text-xs text-muted-foreground">
              Efeitos disponíveis para texto, formas e imagens.
            </div>
          )}

          {selectedLayer && isTextLayer && (
            <TextEffectsOnly
              layer={selectedLayer}
              setStyleValue={setStyleValue}
            />
          )}

          {selectedLayer && isShapeLayer && (
            <ShapeEffectsOnly layer={selectedLayer} />
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
  const gradeDaCamada = selectedLayer ? metadadoDeGrade(selectedLayer) : undefined
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
          <BrandColorSwatches
            value={design.canvas.backgroundColor ?? '#ffffff'}
            onSelect={(hex) => editor.updateCanvas({ backgroundColor: hex })}
          />
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
              {/* G3: célula de grade — posição e tamanho são da grade inteira (operações da grade), rotação bloqueada */}
              {gradeDaCamada ? (
                <>
                  <p className="col-span-2 text-[10px] text-muted-foreground">Célula de grade: posição e tamanho valem para a grade inteira.</p>
                  <CamposDaCaixa gradeId={gradeDaCamada.id} campos={['x', 'y', 'w', 'h']} variante="painel" />
                  <div className="space-y-1">
                    <Label className="text-[10px]">Rotação</Label>
                    <Input
                      aria-label="Rotação da grade"
                      type="number"
                      className="h-8 text-xs"
                      value={0}
                      readOnly
                      disabled
                      title="Rotação bloqueada na grade: desvincule da grade para girar a foto."
                    />
                  </div>
                </>
              ) : (
              <>
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
              </>
              )}
              <div className="space-y-1">
                <Label className="text-[10px]">Opacidade</Label>
                <input
                  type="range"
                  min={10}
                  max={100}
                  className="w-full"
                  value={Math.round((selectedLayer.type === 'shape' ? opacidadeDaForma(selectedLayer.style) : selectedLayer.style?.opacity ?? 1) * 100)}
                  onChange={(event) => {
                    const nextOpacity = Number(event.target.value) / 100
                    if (selectedLayer.type === 'shape') {
                      editor.updateLayerStyle(selectedLayer.id, estiloComOpacidadeDaForma(selectedLayer.style, nextOpacity))
                      return
                    }

                    editor.updateLayerStyle(selectedLayer.id, { opacity: nextOpacity })
                  }}
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
              <GradientProperties layerId={selectedLayer.id} />
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
  const { projectId } = useTemplateEditor()
  const fontManager = React.useMemo(() => getFontManager(), [])
  // Mesma fonte de dados do toolbar flutuante: sistema + fontes do projeto
  const availableFonts = React.useMemo(
    () => fontManager.getAvailableFonts(projectId),
    [fontManager, projectId],
  )

  // Os itens do select são variantes ("Montserrat Bold"), enquanto a layer
  // guarda família + peso separados — converte para casar com o item
  const fontDisplayName = React.useMemo(() => {
    const family = layer.style?.fontFamily ?? FONT_CONFIG.DEFAULT_FONT
    const weight = layer.style?.fontWeight
    if (weight) {
      const variant = Object.entries(FONT_CONFIG.MONTSERRAT_VARIANTS).find(
        ([, config]) => config.family === family && config.weight === String(weight),
      )
      if (variant) return variant[0]
    }
    return family
  }, [layer.style?.fontFamily, layer.style?.fontWeight])

  const handleFontChange = React.useCallback(
    async (value: string) => {
      const { family, weight } = FONT_CONFIG.parseFontVariant(value)
      if (fontManager.isCustomFont(value, projectId)) {
        try {
          await fontManager.loadFont(family)
        } catch (error) {
          console.error(`[PropertiesPanel] Falha ao carregar fonte "${value}":`, error)
        }
      }
      setStyleValue(layer, weight ? { fontFamily: family, fontWeight: weight } : { fontFamily: family })
    },
    [fontManager, projectId, layer, setStyleValue],
  )

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
          <Select value={fontDisplayName} onValueChange={handleFontChange}>
            <SelectTrigger className="h-8 text-xs">
              <SelectValue placeholder="Fonte" />
            </SelectTrigger>
            <SelectContent className="max-h-[400px]">
              {availableFonts.system.length > 0 && (
                <>
                  <div className="px-2 py-1 text-[10px] font-semibold uppercase text-muted-foreground">
                    Sistema
                  </div>
                  {availableFonts.system.map((font) => (
                    <SelectItem key={font} value={font} className="text-xs">
                      <span style={{ fontFamily: font }}>{font}</span>
                    </SelectItem>
                  ))}
                </>
              )}
              {availableFonts.custom.length > 0 && (
                <>
                  <div className="mt-2 px-2 py-1 text-[10px] font-semibold uppercase text-muted-foreground">
                    ✨ Minhas Fontes
                  </div>
                  {availableFonts.custom.map((font) => (
                    <SelectItem key={font} value={font} className="text-xs">
                      <span style={{ fontFamily: font }}>{font}</span>
                    </SelectItem>
                  ))}
                </>
              )}
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
            // Nos dois campos: só o style não chega ao render server-side
            onChange={(event) =>
              updateLayerPartial(layer.id, patchLineHeight(layer, Number(event.target.value)))
            }
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
              <BrandColorSwatches
                value={effects.stroke.strokeColor}
                onSelect={(hex) => updateEffect('stroke', {
                  ...effects.stroke,
                  strokeColor: hex
                })}
              />
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

      {/* Fundo / halo (effects.background) — o mesmo componente do painel Gradientes */}
      <FundoDeTextoControls layer={layer} />

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
              <BrandColorSwatches
                value={effects.shadow.shadowColor}
                onSelect={(hex) => updateEffect('shadow', {
                  ...effects.shadow,
                  shadowColor: hex
                })}
              />
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

/**
 * Efeitos de forma: só o blur, por enquanto. É o que faz o HALO (a mancha
 * desfocada atrás do bloco de texto) ser editável no editor — o retângulo é
 * borrado nos PRÓPRIOS pixels, a foto atrás fica intacta. O teto do controle
 * é maior que o do texto porque o raio do halo é da ordem de 100px.
 */
function ShapeEffectsOnly({ layer }: { layer: Layer }) {
  const editor = useTemplateEditor()
  const effects = layer.effects || {}

  const updateBlur = React.useCallback((config: { enabled: boolean; blurRadius: number }) => {
    editor.updateLayer(layer.id, (l) => ({
      ...l,
      effects: { ...l.effects, blur: config },
    }))
  }, [editor, layer.id])

  return (
    <div className="space-y-2">
      <div className="space-y-2 rounded-md border border-border/30 bg-muted/30 p-2">
        <div className="flex items-center justify-between">
          <Label className="text-[10px] font-semibold uppercase">Blur</Label>
          <input
            type="checkbox"
            className="h-4 w-4"
            checked={effects.blur?.enabled || false}
            onChange={(e) => updateBlur({
              enabled: e.target.checked,
              blurRadius: effects.blur?.blurRadius || 20,
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
              max={600}
              step={1}
              className="w-full h-1"
              value={effects.blur.blurRadius}
              onChange={(e) => updateBlur({
                enabled: true,
                blurRadius: Number(e.target.value),
              })}
            />
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
  // G3: na célula de grade a foto entra só pelo preenchimento (URL validada, cover, recorte limpo) e a caixa é da grade
  const naGrade = metadadoDeGrade(layer) !== undefined
  return (
    <div className="space-y-2 text-xs">
      <div className="space-y-1">
        <Label htmlFor="layer-file-url" className="text-[10px]">URL da imagem</Label>
        <Input
          id="layer-file-url"
          className="h-8 text-xs"
          value={layer.fileUrl ?? ''}
          onChange={(event) => updateLayerPartial(layer.id, { fileUrl: event.target.value })}
          {...(naGrade ? { disabled: true, title: 'Na grade, troque a foto pelo painel Imagens (com a célula selecionada).' } : {})}
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
            {...(naGrade ? { disabled: true } : {})}
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
          <Button
            variant="outline"
            size="sm"
            className="h-8 w-full text-xs"
            onClick={onEdit}
            {...(naGrade ? { disabled: true, title: 'Editar a imagem mudaria a caixa da célula: desvincule da grade para editar.' } : {})}
          >
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
                  // A grade escolhe o enquadramento automático — limpa o crop
                  // manual, senão os dois controles brigariam pelo recorte
                  onClick={() => setStyleValue(layer, { cropPosition: pos.value as 'left-top' | 'center-top' | 'right-top' | 'left-middle' | 'center-middle' | 'right-middle' | 'left-bottom' | 'center-bottom' | 'right-bottom', crop: undefined })}
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

const ehCorCss = (cor: string) => typeof CSS !== 'undefined' && CSS.supports('color', cor)
/**
 * CP-X2b: no `svg-path` o servidor recusa (422 `VETOR_INVALIDO`) a cor que o `lerCor` não lê — `currentcolor` e as
 * palavras CSS-wide, que o `CSS.supports` aceita. O campo recusa antes e volta ao salvo, como com qualquer texto
 * inválido; assim o autosave nunca manda o que o servidor recusa. As outras formas seguem só com o `CSS.supports`.
 */
const ehCorDoSvgPath = (cor: string) => ehCorCss(cor) && lerCor(cor) !== null

/**
 * Campo de texto da cor: enquanto a pessoa digita, mostra o rascunho e não grava; grava no Enter ou
 * ao sair do campo, se for cor completa (`corDigitadaParaGravar`). Esc ou texto inválido voltam ao
 * salvo. Gravar por tecla reescrevia o campo no meio da digitação (`#111` → rgba).
 * Quem usa passa `key` da camada: o rascunho nunca atravessa a troca de seleção. Se o valor salvo
 * mudar por fora durante a digitação (seletor, alpha, paleta, undo), o rascunho é DESCARTADO — não
 * só escondido: voltar depois ao valor antigo não o ressuscita.
 * Clicar em outra camada no palco troca a seleção no mousedown e desmonta o campo ANTES de o foco
 * sair: o blur nunca chegava e a cor digitada se perdia (prova do componente, 21/10/2026). Por isso,
 * com rascunho, um `pointerdown` FORA do campo (captura no document, antes do palco) confirma na
 * camada atual. Desmontar sem gesto (troca de página, camada removida, editor fechado) DESCARTA o
 * rascunho: gravar na desmontagem acertaria a página errada quando páginas repetem o id da camada.
 * `origem` é o objeto da camada: trocar de página com o MESMO id e a MESMA cor não remonta o campo
 * nem muda o valor, mas troca o objeto — e isso também descarta o rascunho.
 */
export function CampoDeCorDigitada({ valor, origem, aoGravar }: { valor: string; origem: object; aoGravar: (texto: string) => void }) {
  const [rascunho, setRascunho] = React.useState<string | null>(null)
  const [visto, setVisto] = React.useState({ valor, origem })
  if (visto.valor !== valor || visto.origem !== origem) {
    setVisto({ valor, origem })
    setRascunho(null)
  }
  const campo = React.useRef<HTMLInputElement>(null)
  // Espelho do rascunho: o pointerdown e o blur do mesmo clique confirmam UMA vez só.
  const pendente = React.useRef<string | null>(null)
  React.useEffect(() => {
    pendente.current = rascunho
  }, [rascunho])
  const editar = (texto: string | null) => {
    pendente.current = texto
    setRascunho(texto)
  }
  const confirmar = () => {
    const texto = pendente.current
    editar(null)
    if (texto !== null && texto.trim() !== valor) aoGravar(texto)
  }
  React.useEffect(() => {
    if (rascunho === null) return
    const aoTocarFora = (event: PointerEvent) => {
      if (event.target instanceof Node && campo.current?.contains(event.target)) return
      confirmar()
    }
    document.addEventListener('pointerdown', aoTocarFora, true)
    return () => document.removeEventListener('pointerdown', aoTocarFora, true)
  })
  return (
    <Input
      ref={campo}
      value={rascunho ?? valor}
      onChange={(event) => editar(event.target.value)}
      onBlur={confirmar}
      onKeyDown={(event) => {
        if (event.key === 'Enter') event.currentTarget.blur()
        if (event.key === 'Escape') editar(null)
      }}
    />
  )
}

/**
 * CP-V4: a leitura e a escrita de cor da forma, UMA vez para o painel (`ShapeControls`) e a toolbar (`ShapeToolbar`).
 * Cor escolhida (paleta, seletor nativo, texto digitado) grava com o alfa atual do canal e rompe só o elo DESSE canal
 * (`escolhaExplicitaDaCor`, Q1); a transparência muda só o alfa e mantém o elo.
 * CP-V5: a chave é o canal (monocolor) ou o slot das partes (multicor, `chaves`); a escrita do slot vai por
 * `estiloComCorDoSlot` (só a cor daquele slot, e a silhueta quando é o slot dela).
 */
export function useCoresDaForma(layer: Layer, setStyleValue: ShapeControlsProps['setStyleValue']) {
  const fillOpacity = Math.round(parseColorOpacity(layer.style?.fill, layer.style?.fillOpacity ?? 1) * 100)
  const strokeOpacity = Math.round(parseColorOpacity(layer.style?.strokeColor, layer.style?.strokeOpacity ?? 1) * 100)
  // CP-V3: o `lerCor` vale também na camada com `style.vetor` que não é `svg-path` (fio, moldura, pílula)
  const corAceita = layer.style?.shapeType === 'svg-path' || ehObjetoDeEstilo(layer.style?.vetor) ? ehCorDoSvgPath : ehCorCss
  const editor = useTemplateEditor()
  const consultaDaPaleta = useBrandColorsEstrita(editor.projectId)
  const paleta = consultaDaPaleta.status === 'success' && consultaDaPaleta.data?.projectId === editor.projectId
    ? classificarPaleta(consultaDaPaleta.data.cores)
    : null
  const nestaPagina = coresNestaPagina(editor.design, paleta?.aplicaveis.map((c) => c.hex) ?? [])
  const multicor = ehMulticor(layer.style)
  const chaves = chavesDaForma(layer.style)
  const valorDo = (canal: ChaveDeCor) => valorDaChave(layer.style, canal)
  /** O alfa da chave em %: o do canal (legado, com o multiplicador) ou o próprio da cor do slot (multicor). */
  const alfaEmPorcento = (canal: ChaveDeCor) =>
    multicor ? Math.round(parseColorOpacity(valorDo(canal), 1) * 100) : canal === 'preenchimento' ? fillOpacity : strokeOpacity
  const alfaDo = (canal: ChaveDeCor) => alfaEmPorcento(canal) / 100
  const gravar = (canal: ChaveDeCor, cor: string, explicita: boolean) => {
    const elo = explicita ? escolhaExplicitaDaCor(layer.style, canal) : {}
    setStyleValue(
      layer,
      multicor
        ? estiloComCorDoSlot({ ...layer.style, ...elo }, canal, cor)
        : canal === 'preenchimento' ? { fill: cor, fillOpacity: 1, ...elo } : { strokeColor: cor, strokeOpacity: 1, ...elo },
    )
  }
  /** Paleta ou seletor nativo: a cor com o alfa atual do canal. */
  const escolher = (canal: ChaveDeCor, hex: string) => gravar(canal, applyOpacityToEditableColor(hex, alfaDo(canal), fallbackDaChave(canal)), true)
  /** Texto confirmado no `CampoDeCorDigitada`; texto que não é cor não grava. */
  const digitar = (canal: ChaveDeCor, texto: string) => {
    const cor = corDigitadaParaGravar(texto, alfaDo(canal), fallbackDaChave(canal), corAceita)
    if (cor) gravar(canal, cor, true)
  }
  const transparencia = (canal: ChaveDeCor, alfa: number) =>
    gravar(canal, applyOpacityToEditableColor(valorDo(canal), alfa, fallbackDaChave(canal)), false)
  const alvoDo = (canal: ChaveDeCor) => alvoDaChave(layer.style, canal)
  return { consultaDaPaleta, paleta, nestaPagina, fillOpacity, strokeOpacity, multicor, chaves, valorDo, alfaEmPorcento, alvoDo, escolher, digitar, transparencia }
}

function ShapeControls({ layer, setStyleValue }: ShapeControlsProps) {
  const cores = useCoresDaForma(layer, setStyleValue)
  const { consultaDaPaleta, paleta, nestaPagina, fillOpacity, strokeOpacity, escolher, digitar, transparencia } = cores
  if (cores.multicor) return <ControlesDosSlots layer={layer} setStyleValue={setStyleValue} cores={cores} />

  return (
    <div className="space-y-3 text-xs">
      <EstadoDaPaletaDaForma consulta={consultaDaPaleta} paleta={paleta} />
      <div className="space-y-1">
        <Label>{rotuloDoCanal(layer, 'preenchimento')}</Label>
        <EloDoCanal layer={layer} canal="preenchimento" />
        <FileirasDoCanal paleta={paleta} nestaPagina={nestaPagina} valor={layer.style?.fill} onSelect={(hex) => escolher('preenchimento', hex)} />
        <span data-fileira="personalizada" className="block text-[10px] text-muted-foreground">Personalizada</span>
        <div className="flex items-center gap-2">
          <CampoDeCorDigitada
            key={layer.id}
            valor={layer.style?.fill ?? '#2563eb'}
            origem={layer}
            aoGravar={(texto) => digitar('preenchimento', texto)}
          />
          <input
            type="color"
            className="h-9 w-9 rounded-md border border-border/30"
            value={corParaSeletor(layer.style?.fill, '#2563eb')}
            onChange={(event) => escolher('preenchimento', event.target.value)}
          />
        </div>
        <p className="text-[10px] text-muted-foreground break-all">
          Valor salvo: {layer.style?.fill ?? '#2563eb'}
        </p>
        <div className="space-y-1 pt-2">
          <div className="flex items-center justify-between">
            <Label className="text-[10px]">Transparência do preenchimento</Label>
            <span className="text-[10px] text-muted-foreground">{fillOpacity}%</span>
          </div>
          <input
            type="range"
            min={0}
            max={100}
            className="w-full"
            value={fillOpacity}
            onChange={(event) => transparencia('preenchimento', Number(event.target.value) / 100)}
          />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <Label>{rotuloDoCanal(layer, 'contorno')}</Label>
          <EloDoCanal layer={layer} canal="contorno" />
          <FileirasDoCanal paleta={paleta} nestaPagina={nestaPagina} valor={layer.style?.strokeColor} onSelect={(hex) => escolher('contorno', hex)} />
          <span data-fileira="personalizada" className="block text-[10px] text-muted-foreground">Personalizada</span>
          <div className="flex items-center gap-2">
            <CampoDeCorDigitada
              key={layer.id}
              valor={layer.style?.strokeColor ?? '#1e3a8a'}
              origem={layer}
              aoGravar={(texto) => digitar('contorno', texto)}
            />
            <input
              type="color"
              className="h-9 w-9 rounded-md border border-border/30"
              value={corParaSeletor(layer.style?.strokeColor, '#1e3a8a')}
              onChange={(event) => escolher('contorno', event.target.value)}
            />
          </div>
          <p className="text-[10px] text-muted-foreground break-all">
            Valor salvo: {layer.style?.strokeColor ?? '#1e3a8a'}
          </p>
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
      <div className="space-y-1">
        <div className="flex items-center justify-between">
          <Label className="text-[10px]">Transparência da borda</Label>
          <span className="text-[10px] text-muted-foreground">{strokeOpacity}%</span>
        </div>
        <input
          type="range"
          min={0}
          max={100}
          className="w-full"
          value={strokeOpacity}
          onChange={(event) => transparencia('contorno', Number(event.target.value) / 100)}
        />
      </div>
      <ReaplicarCoresDaMarca layer={layer} />
      <GestoDaFormaControls layer={layer} setStyleValue={setStyleValue} />
    </div>
  )
}

const ehObjetoDeEstilo = (v: unknown): boolean => typeof v === 'object' && v !== null && !Array.isArray(v)

/**
 * CP-V5: os controles da forma MULTICOR — um bloco por slot (na ordem das partes), com as mesmas fileiras Marca → Nesta
 * página → Personalizada, elo e transparência própria do slot; a escrita é a do `useCoresDaForma` (nada próprio aqui).
 * A opacidade da forma inteira é o slider geral; espessura só quando algum slot é de contorno.
 */
function ControlesDosSlots({ layer, setStyleValue, cores }: ShapeControlsProps & { cores: ReturnType<typeof useCoresDaForma> }) {
  return (
    <div className="space-y-3 text-xs" data-controles-multicor="">
      <EstadoDaPaletaDaForma consulta={cores.consultaDaPaleta} paleta={cores.paleta} />
      {cores.chaves.map((c) => {
        const valor = cores.valorDo(c)
        const fallback = fallbackDaChave(c)
        return (
          <div key={c} className="space-y-1" data-slot-da-forma={c}>
            <Label>{rotuloDoCanal(layer, c)}</Label>
            <EloDoCanal layer={layer} canal={c} />
            <FileirasDoCanal paleta={cores.paleta} nestaPagina={cores.nestaPagina} valor={valor} onSelect={(hex) => cores.escolher(c, hex)} />
            <span data-fileira="personalizada" className="block text-[10px] text-muted-foreground">Personalizada</span>
            <div className="flex items-center gap-2">
              <CampoDeCorDigitada key={`${layer.id}:${c}`} valor={valor ?? fallback} origem={layer} aoGravar={(texto) => cores.digitar(c, texto)} />
              <input
                type="color"
                aria-label={`Escolher ${rotuloDoCanal(layer, c).toLowerCase()}`}
                className="h-9 w-9 rounded-md border border-border/30"
                value={corParaSeletor(valor, fallback)}
                onChange={(event) => cores.escolher(c, event.target.value)}
              />
            </div>
            <div className="flex items-center justify-between pt-1">
              <Label className="text-[10px]">Transparência</Label>
              <span className="text-[10px] text-muted-foreground">{cores.alfaEmPorcento(c)}%</span>
            </div>
            <input
              type="range"
              min={0}
              max={100}
              aria-label={`Transparência: ${rotuloDoCanal(layer, c).toLowerCase()}`}
              className="w-full"
              value={cores.alfaEmPorcento(c)}
              onChange={(event) => cores.transparencia(c, Number(event.target.value) / 100)}
            />
          </div>
        )
      })}
      {cores.chaves.some((c) => cores.alvoDo(c) === 'stroke') && (
        <div className="space-y-1">
          <Label>Espessura</Label>
          <Input type="number" min={0} value={layer.style?.strokeWidth ?? 0} onChange={(event) => setStyleValue(layer, { strokeWidth: Number(event.target.value) })} />
        </div>
      )}
      <ReaplicarCoresDaMarca layer={layer} />
      <GestoDaFormaControls layer={layer} setStyleValue={setStyleValue} />
    </div>
  )
}

type PaletaDaForma = ReturnType<typeof classificarPaleta> | null

/**
 * CP-V3: o estado da paleta ESTRITA da forma, uma vez para os dois canais. Carregando e erro (HTML 200, cor sem
 * `hexCode`) nunca viram "sem cores"; item com hex inválido sai da fileira e é contado.
 */
export function EstadoDaPaletaDaForma({ consulta, paleta }: { consulta: ReturnType<typeof useBrandColorsEstrita>; paleta: PaletaDaForma }) {
  if (consulta.status === 'error') {
    return (
      <div data-paleta-da-forma="erro" className="space-y-1 rounded-md border border-destructive/40 p-2 text-[10px]">
        <p>Não foi possível carregar as cores da marca.</p>
        <Button size="sm" variant="outline" className="h-6 text-[10px]" onClick={() => void consulta.refetch()}>
          Tentar de novo
        </Button>
      </div>
    )
  }
  if (!paleta) return <p data-paleta-da-forma="carregando" className="text-[10px] text-muted-foreground">Carregando as cores da marca…</p>
  if (paleta.aplicaveis.length === 0 && paleta.ignoradas === 0) {
    return <p data-paleta-da-forma="vazia" className="text-[10px] text-muted-foreground">Sem cores cadastradas.</p>
  }
  if (paleta.ignoradas === 0) return null
  return (
    <p data-paleta-da-forma="ignoradas" className="text-[10px] text-muted-foreground">
      {paleta.ignoradas === 1 ? '1 cor da paleta ignorada: hex inválido.' : `${paleta.ignoradas} cores da paleta ignoradas: hex inválido.`}
    </p>
  )
}

/** CP-V3: o elo do canal com o papel da marca. Só o Reaplicar o usa; a cor não muda sozinha (d08). */
export function EloDoCanal({ layer, canal }: { layer: Layer; canal: ChaveDeCor }) {
  const elo = eloDoCanal(layer.style, canal)
  if (!elo) return null
  return (
    <p data-elo={canal} title={DICA_DO_ELO} className="flex items-center gap-1 text-[10px] text-muted-foreground">
      <Link2 className="h-3 w-3" aria-hidden="true" />
      {elo}
    </p>
  )
}

/**
 * CP-V3: Marca (só os itens aplicáveis da paleta estrita, gravando o hex canônico) e Nesta página (as cores já usadas,
 * sem a paleta). O ativo compara os canais da cor SALVA, crua, pelo `lerCor`: sem cor legível, nada acende.
 */
export function FileirasDoCanal({ paleta, nestaPagina, valor, onSelect }: { paleta: PaletaDaForma; nestaPagina: string[]; valor: string | undefined; onSelect: (hex: string) => void }) {
  return (
    <>
      {paleta && paleta.aplicaveis.length > 0 && (
        <div className="space-y-1" data-fileira="marca">
          <span className="text-[10px] text-muted-foreground">Marca</span>
          <BrandColorSwatches cores={paleta.aplicaveis as CorAplicavel[]} ativo={(hex) => swatchAtivo(valor, hex)} onSelect={onSelect} />
        </div>
      )}
      {nestaPagina.length > 0 && (
        <div className="space-y-1" data-fileira="nesta-pagina">
          <span className="text-[10px] text-muted-foreground">Nesta página</span>
          <div className="flex flex-wrap gap-1.5" data-nesta-pagina="">
            {nestaPagina.map((hex) => (
              <button
                key={hex}
                type="button"
                onClick={() => onSelect(hex)}
                className="relative h-5 w-5 shrink-0 rounded border border-border transition hover:scale-110 hover:border-primary"
                style={{ backgroundColor: hex }}
                title={hex}
                aria-label={`Usar ${hex} desta página`}
              >
                {swatchAtivo(valor, hex) && (
                  <span className="absolute inset-0 flex items-center justify-center">
                    <span className="h-1.5 w-1.5 rounded-full bg-white shadow-sm ring-1 ring-black/20" />
                  </span>
                )}
              </button>
            ))}
          </div>
        </div>
      )}
    </>
  )
}

/** Número de cada operação do Reaplicar: identidade do aviso e chave de desfazer única (o histórico funde a mesma chave em 800 ms). */
let operacoesDoReaplicar = 0

type ConsultaLida = { status: 'pending' | 'error' | 'success'; data: unknown }
/** O estado de UMA operação: só ela o muda, e só enquanto o token dela vale. */
interface OperacaoDoReaplicar {
  op: number
  token: number
  chave: string
  alvo: AlvoDoReaplicar
  tipo: 'em-voo' | 'carregando' | 'erro' | 'feito'
  texto: string
  /** Na falha: a consulta que voltou boa, guardada para o "Tentar de novo" (mesmo alvo e token) não relê-la. */
  confirmadas: { paleta?: ConsultaLida; projeto?: ConsultaLida }
}

/**
 * CP-V3: "Reaplicar cores da marca" na camada. Relê a paleta e a assinatura (R2) e só grava com o alvo do clique
 * intacto: token da operação, montagem, projeto, template, página, geração da carga e a seleção exatamente [camada].
 * A guarda se repete DENTRO do atualizador (`atualizadorDoReaplicar`). O aviso, o "em voo" e o retry pertencem à
 * operação (número + token): trocar o alvo os descarta, e uma resposta velha nunca mexe no aviso de outra operação,
 * mesmo quando a seleção volta à mesma camada. "Tentar de novo" relê só a consulta que falhou; um clique novo relê as
 * duas. Sem mudança, nada é gravado (nem desfazer, nem PATCH). Só os canais ainda vinculados mudam (Q1 = A).
 */
function ReaplicarCoresDaMarca({ layer }: { layer: Layer }) {
  const editor = useTemplateEditor()
  const multiPage = useMultiPageOpcional()
  const paleta = useBrandColorsEstrita(editor.projectId)
  const projeto = useProject(editor.projectId)
  const situacao = {
    projectId: editor.projectId,
    templateId: editor.templateId,
    pageId: multiPage?.currentPageId ?? null,
    selecao: editor.selectedLayerIds,
    geracao: editor.geracaoDaCarga(),
  }
  const chave = [situacao.projectId, situacao.templateId, situacao.pageId, situacao.selecao.join(','), situacao.geracao, layer.id].join('|')
  const situacaoRef = React.useRef(situacao)
  situacaoRef.current = situacao
  const camadaRef = React.useRef(layer)
  camadaRef.current = layer
  const tokenRef = React.useRef(0)
  const montadoRef = React.useRef(false)
  const emVooRef = React.useRef<{ op: number; token: number } | null>(null)
  const [operacao, setOperacao] = React.useState<OperacaoDoReaplicar | null>(null)
  React.useEffect(() => {
    montadoRef.current = true
    return () => {
      montadoRef.current = false
      tokenRef.current += 1
    }
  }, [])
  // Qualquer troca do alvo invalida a operação em voo e DESCARTA o aviso dela (A → B → A não o ressuscita)
  React.useEffect(() => () => {
    tokenRef.current += 1
    emVooRef.current = null
    setOperacao(null)
  }, [chave])

  if (!ehObjetoDeEstilo(layer.style?.vetor)) return null

  const geracaoDaCarga = editor.geracaoDaCarga
  const lerSituacao = (): SituacaoDoEditor => ({ ...situacaoRef.current, token: tokenRef.current, montado: montadoRef.current, geracao: geracaoDaCarga() })
  const desta = (op: number, mudar: (o: OperacaoDoReaplicar) => OperacaoDoReaplicar | null) =>
    setOperacao((o) => (o && o.op === op ? mudar(o) : o))

  const executar = async (alvo: AlvoDoReaplicar, op: number, confirmadas: OperacaoDoReaplicar['confirmadas']) => {
    emVooRef.current = { op, token: alvo.token }
    try {
      const [p, j] = await Promise.all([
        confirmadas.paleta ? Promise.resolve(confirmadas.paleta) : paleta.refetch(),
        confirmadas.projeto ? Promise.resolve(confirmadas.projeto) : projeto.refetch(),
      ])
      if (!alvoValido(alvo, lerSituacao())) {
        if (montadoRef.current) desta(op, () => null)
        return
      }
      const estado = estadoDaInsercao({ projectId: alvo.projectId, paleta: p, projeto: j })
      if (estado.estado !== 'pronto') {
        const falhas = estado.estado === 'erro' ? estado.falhas : []
        desta(op, (o) => ({
          ...o,
          tipo: estado.estado,
          texto: estado.estado === 'erro' ? 'Não foi possível reler as cores da marca. Nada foi alterado.' : 'Carregando as cores da marca…',
          confirmadas: estado.estado === 'erro'
            ? { paleta: falhas.includes('paleta') ? undefined : p, projeto: falhas.includes('projeto') ? undefined : j }
            : {},
        }))
        return
      }
      const resumo = resumoDoReaplicar(reaplicarCoresDaMarca(camadaRef.current.style, estado.marca).canais)
      editor.updateLayer(alvo.layerId, atualizadorDoReaplicar(alvo, lerSituacao, estado.marca), { coalesceKey: `reaplicar:${op}` })
      desta(op, (o) => ({
        ...o,
        tipo: 'feito',
        texto: estado.ausenciaConfirmada ? `${resumo} Marca sem cores cadastradas: foram usadas as cores padrão.` : resumo,
        confirmadas: {},
      }))
    } finally {
      if (emVooRef.current?.op === op) emVooRef.current = null
    }
  }

  const reaplicar = () => {
    if (emVooRef.current?.token === tokenRef.current) return
    const agora = lerSituacao()
    const alvo: AlvoDoReaplicar = { token: agora.token, projectId: agora.projectId, templateId: agora.templateId, pageId: agora.pageId, geracao: agora.geracao, layerId: camadaRef.current.id }
    if (!alvoValido(alvo, agora)) return
    operacoesDoReaplicar += 1
    const op = operacoesDoReaplicar
    setOperacao({ op, token: alvo.token, chave, alvo, tipo: 'em-voo', texto: 'Relendo as cores da marca…', confirmadas: {} })
    void executar(alvo, op, {})
  }

  const visivel = operacao && operacao.chave === chave && operacao.token === tokenRef.current ? operacao : null

  const tentarDeNovo = () => {
    if (!visivel || visivel.tipo !== 'erro' || emVooRef.current?.token === tokenRef.current) return
    if (!alvoValido(visivel.alvo, lerSituacao())) return
    desta(visivel.op, (o) => ({ ...o, tipo: 'em-voo', texto: 'Relendo as cores da marca…' }))
    void executar(visivel.alvo, visivel.op, visivel.confirmadas)
  }

  const habilitado = podeReaplicar(layer.style) && situacao.selecao.length === 1 && situacao.selecao[0] === layer.id
  return (
    <div className="space-y-1 border-t border-border/30 pt-3">
      <Button
        size="sm"
        variant="outline"
        className="h-8 w-full text-xs"
        disabled={!habilitado || visivel?.tipo === 'em-voo'}
        onClick={reaplicar}
      >
        Reaplicar cores da marca
      </Button>
      {!habilitado && <p className="text-[10px] text-muted-foreground">Nenhuma cor desta forma acompanha a marca.</p>}
      {visivel && (
        <p data-aviso-reaplicar={visivel.tipo} data-operacao={visivel.op} className="text-[10px] text-muted-foreground">
          {visivel.texto}
        </p>
      )}
      {visivel?.tipo === 'erro' && (
        <Button size="sm" variant="outline" className="h-6 text-[10px]" data-tentar-reaplicar="" onClick={tentarDeNovo}>
          Tentar de novo
        </Button>
      )}
    </div>
  )
}

/**
 * Espelhar e travar a proporção (CP-V1), pelo que `controlesDaForma` libera: a trava em toda
 * forma; o espelho só no `svg-path`, o único desenho que espelha nos dois renderers (src/lib/vetor).
 * CP-V4: a `variante="barra"` é a mesma regra em botões compactos na toolbar da forma; o id do switch vem do `useId`
 * para painel e toolbar abertos juntos não repetirem id no DOM.
 */
export function GestoDaFormaControls({ layer, setStyleValue, variante = 'painel' }: ShapeControlsProps & { variante?: 'painel' | 'barra' }) {
  const idDaTrava = React.useId()
  const controles = controlesDaForma(layer)
  if (!controles.trava && !controles.espelho) return null
  const flipH = layer.style?.flipH === true
  const flipV = layer.style?.flipV === true
  const travada = layer.style?.manterProporcao === true
  const barra = variante === 'barra'
  const botao = barra ? 'h-9 w-9 p-0 md:h-8 md:w-8' : 'h-8 w-8 p-0'
  const espelhos = (
    <>
      <Button
        size="sm"
        variant={flipH ? 'default' : 'ghost'}
        className={botao}
        title="Espelhar horizontalmente"
        aria-pressed={flipH}
        onClick={() => setStyleValue(layer, { flipH: !flipH })}
      >
        <FlipHorizontal2 className="h-4 w-4" />
      </Button>
      <Button
        size="sm"
        variant={flipV ? 'default' : 'ghost'}
        className={botao}
        title="Espelhar verticalmente"
        aria-pressed={flipV}
        onClick={() => setStyleValue(layer, { flipV: !flipV })}
      >
        <FlipVertical2 className="h-4 w-4" />
      </Button>
    </>
  )
  if (barra) {
    return (
      <div className="flex flex-shrink-0 items-center gap-1" data-gesto-da-forma="barra">
        {controles.espelho && espelhos}
        {controles.trava && (
          <Button
            size="sm"
            variant={travada ? 'default' : 'ghost'}
            className={botao}
            title="Manter proporção"
            aria-label="Manter proporção"
            aria-pressed={travada}
            onClick={() => setStyleValue(layer, { manterProporcao: !travada })}
          >
            {travada ? <Lock className="h-4 w-4" /> : <Unlock className="h-4 w-4" />}
          </Button>
        )}
      </div>
    )
  }
  return (
    <div className="space-y-2 border-t border-border/30 pt-3">
      {controles.espelho && <div className="flex items-center justify-between">
        <Label>Espelhar</Label>
        <div className="flex items-center gap-1">
          {espelhos}
        </div>
      </div>}
      {controles.trava && <div className="flex items-center justify-between">
        <Label htmlFor={idDaTrava}>Manter proporção</Label>
        <Switch
          id={idDaTrava}
          checked={layer.style?.manterProporcao === true}
          onCheckedChange={(checked) => setStyleValue(layer, { manterProporcao: checked })}
        />
      </div>}
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
        <BrandColorSwatches
          value={layer.style?.fill ?? '#111111'}
          onSelect={(hex) => setStyleValue(layer, { fill: hex })}
        />
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

  // Com um elemento só o alvo é a página; com dois ou mais, os elementos se
  // alinham entre si. Antes esses botões ficavam desativados na seleção única,
  // e clicar não fazia nada.
  const alvoPagina = selectedCount === 1
  const sufixo = alvoPagina ? ' na página' : ' entre si'
  const alignDisabled = selectedCount === 0
  const distributeDisabled = selectedCount < 3
  const orderDisabled = selectedCount === 0
  const canvasAlignDisabled = selectedCount === 0

  return (
    <div className="space-y-2 rounded-md border border-border/30 bg-muted/30 p-2 text-xs">
      <div className="flex items-center justify-between">
        <span className="font-semibold text-[10px]">Alinhamento</span>
        <span className="text-[9px] text-muted-foreground">
          {selectedCount} sel. · {alvoPagina ? 'na página' : 'entre si'}
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
            title={`Alinhar à esquerda${sufixo} (Shift+Ctrl+L)`}
          >
            <AlignLeft className="h-3 w-3" />
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={alignDisabled}
            onClick={alignSelectedCenterH}
            className="h-7 w-full p-0"
            title={`Centralizar horizontalmente${sufixo} (Shift+Ctrl+C)`}
          >
            <AlignCenter className="h-3 w-3" />
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={alignDisabled}
            onClick={alignSelectedRight}
            className="h-7 w-full p-0"
            title={`Alinhar à direita${sufixo} (Shift+Ctrl+R)`}
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
            title={`Alinhar ao topo${sufixo} (Shift+Ctrl+T)`}
          >
            <AlignVerticalJustifyStart className="h-3 w-3" />
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={alignDisabled}
            onClick={alignSelectedMiddleV}
            className="h-7 w-full p-0"
            title={`Centralizar verticalmente${sufixo} (Shift+Ctrl+M)`}
          >
            <AlignVerticalJustifyCenter className="h-3 w-3" />
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={alignDisabled}
            onClick={alignSelectedBottom}
            className="h-7 w-full p-0"
            title={`Alinhar ao fundo${sufixo} (Shift+Ctrl+B)`}
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
