'use client'

import { useMemo } from 'react'
import { Label } from '@/components/ui/label'
import { Card } from '@/components/ui/card'
import { Sparkles } from 'lucide-react'
import { ImageSourceTabs } from './image-source-tabs'
import type { ImageSource } from '@/lib/ai-creative-generator/layout-types'
import Image from 'next/image'

interface ImageLayer {
  id: string
  type: string
  name: string
  fileUrl?: string
  isDynamic?: boolean
  [key: string]: any
}

interface DynamicImageFieldsFormProps {
  layers: any[]
  projectId: number
  imageValues: Record<string, ImageSource>
  onImageChange: (layerId: string, imageSource: ImageSource) => void
}

export function DynamicImageFieldsForm({
  layers,
  projectId,
  imageValues,
  onImageChange,
}: DynamicImageFieldsFormProps) {
  // Filtrar apenas layers de imagem marcadas como dinâmicas
  const dynamicImageLayers = useMemo(() => {
    return layers.filter((layer) =>
      layer.type === 'image' && layer.isDynamic === true
    ) as ImageLayer[]
  }, [layers])

  if (dynamicImageLayers.length === 0) {
    return (
      <Card className="rounded-lg border border-amber-200 bg-amber-50 p-4">
        <p className="text-sm text-amber-700">
          Este modelo não possui imagens dinâmicas. Para marcar imagens como editáveis,
          abra o editor de templates e ative o toggle "Imagem Dinâmica" nas propriedades da camada.
        </p>
      </Card>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <Sparkles className="h-5 w-5 text-primary" />
        <h3 className="text-lg font-semibold">Imagens Dinâmicas</h3>
      </div>

      <p className="text-sm text-muted-foreground -mt-2">
        Substitua as imagens abaixo. Se não substituir, a imagem original do template será mantida.
      </p>

      <div className="space-y-6">
        {dynamicImageLayers.map((layer, index) => {
          const selectedImage = imageValues[layer.id]

          return (
            <Card key={layer.id} className="p-4 space-y-4 border-2 hover:border-primary/50 transition-colors">
              {/* Header com miniatura e nome */}
              <div className="flex items-start gap-4">
                {/* Miniatura da imagem original */}
                <div className="relative w-20 h-20 rounded-lg overflow-hidden border-2 border-border flex-shrink-0 bg-muted">
                  {layer.fileUrl ? (
                    <Image
                      src={layer.fileUrl}
                      alt={layer.name || `Imagem ${index + 1}`}
                      fill
                      className="object-cover"
                      unoptimized
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center bg-muted">
                      <Sparkles className="h-8 w-8 text-muted-foreground" />
                    </div>
                  )}
                </div>

                {/* Info da camada */}
                <div className="flex-1 min-w-0">
                  <Label className="text-sm font-semibold">
                    {layer.name || `Imagem ${index + 1}`}
                  </Label>
                  <p className="text-xs text-muted-foreground mt-1">
                    Camada ID: {layer.id.slice(0, 8)}...
                  </p>
                  {selectedImage && (
                    <p className="text-xs text-green-600 dark:text-green-400 mt-1 font-medium">
                      ✓ Nova imagem selecionada
                    </p>
                  )}
                </div>
              </div>

              {/* Tabs de seleção de imagem */}
              <div>
                <ImageSourceTabs
                  projectId={projectId}
                  onImageSelected={(imageSource) => onImageChange(layer.id, imageSource)}
                />
              </div>

              {/* Preview da nova imagem selecionada */}
              {selectedImage && (
                <div className="pt-2 border-t">
                  <Label className="text-xs text-muted-foreground mb-2 block">
                    Preview da nova imagem:
                  </Label>
                  <div className="relative w-full aspect-video rounded-lg overflow-hidden border-2 border-primary/50 bg-muted">
                    <Image
                      src={selectedImage.url}
                      alt="Preview"
                      fill
                      className="object-cover"
                      unoptimized
                    />
                  </div>
                </div>
              )}
            </Card>
          )
        })}
      </div>
    </div>
  )
}
