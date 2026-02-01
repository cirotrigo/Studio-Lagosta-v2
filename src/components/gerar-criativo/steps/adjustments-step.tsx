'use client'

import { useRef } from 'react'
import { useGerarCriativo } from '../gerar-criativo-context'
import { useStepper } from '../stepper'
import { useGerarCriativoFinalize } from '@/hooks/use-gerar-criativo-finalize'
import { useMediaQuery } from '@/hooks/use-media-query'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { ChevronLeft, Sparkles, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { CanvasPreview, type CanvasPreviewHandle } from '../components/canvas-preview'
import { LayerActionsToolbar } from '../components/layer-actions-toolbar'
import { LayerControls } from '../components/layer-controls'

export function AdjustmentsStep() {
  const {
    selectedProjectId,
    selectedTemplateId,
    selectedModelPageId,
    layers,
    templateWidth,
    templateHeight,
    selectedLayerId,
    selectLayer,
    reorderLayers,
    addBgRemovedLayer,
    imageValues,
    textValues,
    setTextValue,
    setGeneratedCreative,
    hiddenLayerIds,
    deleteLayer,
    toggleLayerVisibility,
    updateLayerPosition,
    updateLayerSize,
  } = useGerarCriativo()

  // Handler for resize that updates both size and position
  const handleLayerResize = (
    layerId: string,
    size: { width: number; height: number },
    position: { x: number; y: number }
  ) => {
    updateLayerSize(layerId, size)
    updateLayerPosition(layerId, position)
  }

  const stepper = useStepper()
  const finalize = useGerarCriativoFinalize()
  const isMobile = useMediaQuery('(max-width: 1023px)')
  const canvasRef = useRef<CanvasPreviewHandle>(null)

  const handleGenerateCreative = async () => {
    try {
      // First, export the canvas to dataUrl using Konva (frontend rendering)
      if (!canvasRef.current) {
        throw new Error('Canvas not ready')
      }

      toast.info('Renderizando criativo...')
      const dataUrl = await canvasRef.current.exportToDataUrl('png')

      toast.info('Salvando criativo...')
      const result = await finalize.mutateAsync({
        templateId: selectedTemplateId!,
        templatePageId: selectedModelPageId!,
        dataUrl,
        images: imageValues,
        texts: textValues,
        layers,
        hiddenLayerIds: Array.from(hiddenLayerIds),
      })

      setGeneratedCreative({
        id: result.id,
        resultUrl: result.resultUrl,
      })

      stepper.next()
    } catch (error) {
      console.error('Error generating creative:', error)
      toast.error('Erro ao gerar criativo. Tente novamente.')
    }
  }

  // Show all text layers (both dynamic and non-dynamic)
  const textLayers = layers.filter(
    (layer) => (layer.type === 'text' || layer.type === 'rich-text') && !hiddenLayerIds.has(layer.id)
  )

  const selectedLayer = layers.find((l) => l.id === selectedLayerId)

  if (isMobile) {
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon" onClick={() => stepper.prev()}>
            <ChevronLeft className="w-5 h-5" />
          </Button>
          <div>
            <h2 className="text-lg font-semibold">Ajustes Finais</h2>
            <p className="text-sm text-muted-foreground">Edite textos e camadas</p>
          </div>
        </div>

        <Tabs defaultValue="preview">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="preview">Preview</TabsTrigger>
            <TabsTrigger value="layers">Camadas</TabsTrigger>
            <TabsTrigger value="texts">Textos</TabsTrigger>
          </TabsList>

          <TabsContent value="preview" className="mt-4">
            <Card className="p-4">
              <CanvasPreview
                ref={canvasRef}
                layers={layers}
                selectedLayerId={selectedLayerId}
                onSelectLayer={selectLayer}
                imageValues={imageValues}
                textValues={textValues}
                hiddenLayerIds={hiddenLayerIds}
                onLayerDrag={updateLayerPosition}
                onLayerResize={handleLayerResize}
                templateWidth={templateWidth}
                templateHeight={templateHeight}
              />
            </Card>
            {selectedLayer && selectedLayer.type === 'image' && (
              <div className="mt-4">
                <LayerActionsToolbar
                  layer={selectedLayer}
                  projectId={selectedProjectId!}
                  overrideImageUrl={imageValues[selectedLayerId!]?.url}
                  onBackgroundRemoved={(newUrl) => {
                    addBgRemovedLayer(selectedLayerId!, newUrl)
                  }}
                />
              </div>
            )}
          </TabsContent>

          <TabsContent value="layers" className="mt-4 space-y-4">
            <LayerControls
              layers={layers}
              selectedLayerId={selectedLayerId}
              onSelectLayer={selectLayer}
              onReorder={reorderLayers}
              hiddenLayerIds={hiddenLayerIds}
              onToggleVisibility={toggleLayerVisibility}
              onDeleteLayer={deleteLayer}
            />
            {selectedLayer && selectedLayer.type === 'image' && (
              <LayerActionsToolbar
                layer={selectedLayer}
                projectId={selectedProjectId!}
                overrideImageUrl={imageValues[selectedLayerId!]?.url}
                onBackgroundRemoved={(newUrl) => {
                  addBgRemovedLayer(selectedLayerId!, newUrl)
                }}
              />
            )}
          </TabsContent>

          <TabsContent value="texts" className="mt-4">
            {textLayers.length > 0 ? (
              <Card className="p-4">
                <h3 className="text-sm font-medium mb-3">Textos Editaveis</h3>
                <div className="space-y-3">
                  {textLayers.map((layer) => (
                    <div key={layer.id}>
                      <Label className="text-xs flex items-center gap-2">
                        {layer.name}
                        {layer.isDynamic && (
                          <span className="px-1.5 py-0.5 text-[10px] bg-primary/10 text-primary rounded">
                            Dinamico
                          </span>
                        )}
                      </Label>
                      <Input
                        value={textValues[layer.id] || layer.content || ''}
                        onChange={(e) => setTextValue(layer.id, e.target.value)}
                        placeholder={layer.content}
                        className="mt-1"
                      />
                    </div>
                  ))}
                </div>
              </Card>
            ) : (
              <Card className="p-8 text-center">
                <p className="text-sm text-muted-foreground">Nenhum texto encontrado</p>
              </Card>
            )}
          </TabsContent>
        </Tabs>

        <Button
          className="w-full"
          size="lg"
          onClick={handleGenerateCreative}
          disabled={finalize.isPending}
        >
          {finalize.isPending ? (
            <>
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              Gerando...
            </>
          ) : (
            <>
              <Sparkles className="w-4 h-4 mr-2" />
              Gerar Criativo
            </>
          )}
        </Button>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="icon" onClick={() => stepper.prev()}>
          <ChevronLeft className="w-5 h-5" />
        </Button>
        <div>
          <h2 className="text-lg font-semibold">Ajustes Finais</h2>
          <p className="text-sm text-muted-foreground">
            Edite textos, reordene camadas e remova fundos
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-8">
          <Card className="p-4">
            <CanvasPreview
              ref={canvasRef}
              layers={layers}
              selectedLayerId={selectedLayerId}
              onSelectLayer={selectLayer}
              imageValues={imageValues}
              textValues={textValues}
              hiddenLayerIds={hiddenLayerIds}
              onLayerDrag={updateLayerPosition}
              onLayerResize={handleLayerResize}
              templateWidth={templateWidth}
              templateHeight={templateHeight}
            />
          </Card>
        </div>

        <div className="lg:col-span-4 space-y-4">
          {selectedLayer && selectedLayer.type === 'image' && (
            <LayerActionsToolbar
              layer={selectedLayer}
              projectId={selectedProjectId!}
              overrideImageUrl={imageValues[selectedLayerId!]?.url}
              onBackgroundRemoved={(newUrl) => {
                addBgRemovedLayer(selectedLayerId!, newUrl)
              }}
            />
          )}

          <LayerControls
            layers={layers}
            selectedLayerId={selectedLayerId}
            onSelectLayer={selectLayer}
            onReorder={reorderLayers}
            hiddenLayerIds={hiddenLayerIds}
            onToggleVisibility={toggleLayerVisibility}
            onDeleteLayer={deleteLayer}
          />

          {textLayers.length > 0 && (
            <Card className="p-4">
              <h3 className="text-sm font-medium mb-3">Textos Editaveis</h3>
              <div className="space-y-3">
                {textLayers.map((layer) => (
                  <div key={layer.id}>
                    <Label className="text-xs flex items-center gap-2">
                      {layer.name}
                      {layer.isDynamic && (
                        <span className="px-1.5 py-0.5 text-[10px] bg-primary/10 text-primary rounded">
                          Dinamico
                        </span>
                      )}
                    </Label>
                    <Input
                      value={textValues[layer.id] || layer.content || ''}
                      onChange={(e) => setTextValue(layer.id, e.target.value)}
                      placeholder={layer.content}
                      className="mt-1"
                    />
                  </div>
                ))}
              </div>
            </Card>
          )}

          <Button
            className="w-full"
            size="lg"
            onClick={handleGenerateCreative}
            disabled={finalize.isPending}
          >
            {finalize.isPending ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Gerando...
              </>
            ) : (
              <>
                <Sparkles className="w-4 h-4 mr-2" />
                Gerar Criativo
              </>
            )}
          </Button>
        </div>
      </div>
    </div>
  )
}
