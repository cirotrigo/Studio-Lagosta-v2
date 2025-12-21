'use client'

import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { AIGenerationTab } from './tabs/ai-generation-tab'
import { GoogleDriveTab } from './tabs/google-drive-tab'
import { AIGalleryTab } from './tabs/ai-gallery-tab'
import type { ImageSource } from '@/lib/ai-creative-generator/layout-types'

interface ImageSourceTabsProps {
  projectId: number
  onImageSelected: (image: ImageSource) => void
}

export function ImageSourceTabs({
  projectId,
  onImageSelected,
}: ImageSourceTabsProps) {
  return (
    <div className="space-y-2">
      <label className="text-sm font-medium">Escolha a Imagem</label>
      <Tabs defaultValue="ai" className="w-full">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="ai">Gerar IA</TabsTrigger>
          <TabsTrigger value="drive">Google Drive</TabsTrigger>
          <TabsTrigger value="gallery">Galeria IA</TabsTrigger>
        </TabsList>

        <TabsContent value="ai" className="mt-4">
          <AIGenerationTab
            projectId={projectId}
            onImageGenerated={onImageSelected}
          />
        </TabsContent>

        <TabsContent value="drive" className="mt-4">
          <GoogleDriveTab
            projectId={projectId}
            onImageSelected={onImageSelected}
          />
        </TabsContent>

        <TabsContent value="gallery" className="mt-4">
          <AIGalleryTab
            projectId={projectId}
            onImageSelected={onImageSelected}
          />
        </TabsContent>
      </Tabs>
    </div>
  )
}
