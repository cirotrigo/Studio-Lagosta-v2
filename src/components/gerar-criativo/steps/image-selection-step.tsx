'use client'

import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useGerarCriativo } from '../gerar-criativo-context'
import { useStepper } from '../stepper'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { ChevronLeft, ChevronRight, X, Sparkles, Upload, FolderOpen, ImageIcon } from 'lucide-react'
import { GenerateImageModal } from '../components/generate-image-modal'
import { ImageGalleryTab } from '../components/image-gallery-tab'
import { ImageUploadTab } from '../components/image-upload-tab'
import { GoogleDriveTab } from '@/components/ai-creative-generator/tabs/google-drive-tab'
import type { ImageSource } from '@/lib/ai-creative-generator/layout-types'

export function ImageSelectionStep() {
  const { selectedProjectId, layers, imageValues, setImageValue } = useGerarCriativo()
  const stepper = useStepper()
  const queryClient = useQueryClient()
  const [isGenerateModalOpen, setIsGenerateModalOpen] = useState(false)
  const [activeLayerId, setActiveLayerId] = useState<string | null>(null)

  const dynamicImageLayers = layers.filter(
    (layer) => layer.type === 'image' && layer.isDynamic === true
  )

  const allLayersHaveImages = dynamicImageLayers.every((layer) => imageValues[layer.id])

  const handleGenerateComplete = async (aiImage: { id: string; fileUrl: string }) => {
    await queryClient.invalidateQueries({
      queryKey: ['project-images', selectedProjectId],
    })

    if (activeLayerId) {
      setImageValue(activeLayerId, {
        type: 'ai-gallery',
        url: aiImage.fileUrl,
        aiImageId: aiImage.id,
      })
    }

    setIsGenerateModalOpen(false)
    setActiveLayerId(null)
  }

  const handleImageSelected = (layerId: string, imageSource: ImageSource) => {
    setImageValue(layerId, imageSource)
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon" onClick={() => stepper.prev()}>
            <ChevronLeft className="w-5 h-5" />
          </Button>
          <div>
            <h2 className="text-lg font-semibold">Escolha as Imagens</h2>
            <p className="text-sm text-muted-foreground">
              Selecione ou gere imagens para cada campo dinamico
            </p>
          </div>
        </div>
        <Button onClick={() => stepper.next()} disabled={!allLayersHaveImages} size="sm">
          Continuar
          <ChevronRight className="w-4 h-4 ml-1" />
        </Button>
      </div>

      <div className="space-y-6">
        {dynamicImageLayers.map((layer) => (
          <Card key={layer.id} className="p-4">
            <div className="flex items-center justify-between mb-4">
              <Label className="font-medium">{layer.name}</Label>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setActiveLayerId(layer.id)
                  setIsGenerateModalOpen(true)
                }}
              >
                <Sparkles className="h-4 w-4 mr-2" />
                Gerar com IA
              </Button>
            </div>

            <Tabs defaultValue="gallery" className="w-full">
              <TabsList className="grid w-full grid-cols-3">
                <TabsTrigger value="gallery">
                  <ImageIcon className="w-4 h-4 mr-2" />
                  Galeria
                </TabsTrigger>
                <TabsTrigger value="drive">
                  <FolderOpen className="w-4 h-4 mr-2" />
                  Drive
                </TabsTrigger>
                <TabsTrigger value="upload">
                  <Upload className="w-4 h-4 mr-2" />
                  Upload
                </TabsTrigger>
              </TabsList>

              <TabsContent value="gallery" className="mt-4">
                <ImageGalleryTab
                  projectId={selectedProjectId!}
                  onImageSelected={(url, aiImageId) =>
                    handleImageSelected(layer.id, {
                      type: 'ai-gallery',
                      url,
                      aiImageId,
                    })
                  }
                />
              </TabsContent>

              <TabsContent value="drive" className="mt-4">
                <GoogleDriveTab
                  projectId={selectedProjectId!}
                  onImageSelected={(imageSource) =>
                    handleImageSelected(layer.id, imageSource)
                  }
                />
              </TabsContent>

              <TabsContent value="upload" className="mt-4">
                <ImageUploadTab
                  projectId={selectedProjectId!}
                  onImageSelected={(url, pathname) =>
                    handleImageSelected(layer.id, {
                      type: 'local-upload',
                      url,
                      pathname,
                    })
                  }
                />
              </TabsContent>
            </Tabs>

            {imageValues[layer.id] && (
              <div className="mt-4 flex items-center gap-3 p-2 bg-muted rounded">
                <img
                  src={imageValues[layer.id].url}
                  alt="Preview"
                  className="w-16 h-16 rounded object-cover"
                />
                <div className="flex-1">
                  <p className="text-sm font-medium">Imagem selecionada</p>
                  <p className="text-xs text-muted-foreground">
                    {imageValues[layer.id].type === 'ai-gallery'
                      ? 'Da galeria'
                      : imageValues[layer.id].type === 'local-upload'
                        ? 'Upload'
                        : 'Google Drive'}
                  </p>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setImageValue(layer.id, null)}
                >
                  <X className="w-4 h-4" />
                </Button>
              </div>
            )}
          </Card>
        ))}
      </div>

      <div className="flex justify-end pt-4">
        <Button onClick={() => stepper.next()} disabled={!allLayersHaveImages}>
          Continuar
          <ChevronRight className="w-4 h-4 ml-2" />
        </Button>
      </div>

      <GenerateImageModal
        open={isGenerateModalOpen}
        onOpenChange={setIsGenerateModalOpen}
        projectId={selectedProjectId!}
        onComplete={handleGenerateComplete}
      />
    </div>
  )
}
