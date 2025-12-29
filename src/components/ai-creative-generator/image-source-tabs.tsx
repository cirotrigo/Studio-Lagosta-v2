'use client'

import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { Upload, HardDrive, Sparkles } from 'lucide-react'
import { GoogleDriveTab } from './tabs/google-drive-tab'
import { AIGalleryTab } from './tabs/ai-gallery-tab'
import { LocalUploadTab } from './tabs/local-upload-tab'
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
      <Tabs defaultValue="local" className="w-full">
        <TabsList className="grid w-full grid-cols-3">
          <TooltipProvider delayDuration={300}>
            <Tooltip>
              <TooltipTrigger asChild>
                <TabsTrigger value="local" className="gap-2">
                  <Upload className="h-4 w-4" />
                  <span className="sr-only">Upload Local</span>
                </TabsTrigger>
              </TooltipTrigger>
              <TooltipContent>
                <p className="text-xs">Upload Local</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>

          <TooltipProvider delayDuration={300}>
            <Tooltip>
              <TooltipTrigger asChild>
                <TabsTrigger value="drive" className="gap-2">
                  <HardDrive className="h-4 w-4" />
                  <span className="sr-only">Google Drive</span>
                </TabsTrigger>
              </TooltipTrigger>
              <TooltipContent>
                <p className="text-xs">Google Drive</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>

          <TooltipProvider delayDuration={300}>
            <Tooltip>
              <TooltipTrigger asChild>
                <TabsTrigger value="gallery" className="gap-2">
                  <Sparkles className="h-4 w-4" />
                  <span className="sr-only">Galeria IA</span>
                </TabsTrigger>
              </TooltipTrigger>
              <TooltipContent>
                <p className="text-xs">Galeria IA</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </TabsList>

        <TabsContent value="local" className="mt-4">
          <LocalUploadTab
            projectId={projectId}
            onImageSelected={onImageSelected}
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
