"use client"

import * as React from 'react'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { cn } from '@/lib/utils'
import { LayersPanel } from '../layers-panel'
import { TemplatesPanel } from './templates-panel'
import { TextPanel } from './text-panel'
import { ImagesPanel } from './images-panel'
import { ShapesPanel } from './shapes-panel'
import { IconsPanel } from './icons-panel'
import { UploadsPanel } from './uploads-panel'
import { BackgroundsPanel } from './backgrounds-panel'

interface EditorSidebarProps {
  className?: string
}

export function EditorSidebar({ className }: EditorSidebarProps) {
  const [activeTab, setActiveTab] = React.useState('templates')

  return (
    <div className={cn('flex h-full w-full max-w-[360px] flex-col', className)}>
      <Tabs
        value={activeTab}
        onValueChange={setActiveTab}
        className="flex h-full flex-col"
      >
        <TabsList className="grid h-10 grid-cols-4 rounded-lg bg-muted/60">
          <TabsTrigger value="templates" className="text-[11px] font-semibold uppercase">
            Templates
          </TabsTrigger>
          <TabsTrigger value="text" className="text-[11px] font-semibold uppercase">
            Texto
          </TabsTrigger>
          <TabsTrigger value="images" className="text-[11px] font-semibold uppercase">
            Imagens
          </TabsTrigger>
          <TabsTrigger value="layers" className="text-[11px] font-semibold uppercase">
            Layers
          </TabsTrigger>
        </TabsList>
        <TabsList className="mt-2 grid h-9 grid-cols-3 rounded-lg bg-muted/40">
          <TabsTrigger value="shapes" className="text-[11px] font-semibold uppercase">
            Formas
          </TabsTrigger>
          <TabsTrigger value="icons" className="text-[11px] font-semibold uppercase">
            Ícones
          </TabsTrigger>
          <TabsTrigger value="uploads" className="text-[11px] font-semibold uppercase">
            Uploads
          </TabsTrigger>
        </TabsList>
        <TabsList className="mt-2 grid h-9 grid-cols-1 rounded-lg bg-muted/40">
          <TabsTrigger value="backgrounds" className="text-[11px] font-semibold uppercase">
            Fundos
          </TabsTrigger>
        </TabsList>
        <div className="mt-3 flex-1 overflow-hidden">
          <TabsContent value="templates" className="h-full data-[state=inactive]:hidden">
            <TemplatesPanel />
          </TabsContent>
          <TabsContent value="text" className="h-full data-[state=inactive]:hidden">
            <TextPanel />
          </TabsContent>
          <TabsContent value="images" className="h-full data-[state=inactive]:hidden">
            <ImagesPanel />
          </TabsContent>
          <TabsContent value="layers" className="h-full data-[state=inactive]:hidden">
            <LayersPanel />
          </TabsContent>
          <TabsContent value="shapes" className="h-full data-[state=inactive]:hidden">
            <ShapesPanel />
          </TabsContent>
          <TabsContent value="icons" className="h-full data-[state=inactive]:hidden">
            <IconsPanel />
          </TabsContent>
          <TabsContent value="uploads" className="h-full data-[state=inactive]:hidden">
            <UploadsPanel />
          </TabsContent>
          <TabsContent value="backgrounds" className="h-full data-[state=inactive]:hidden">
            <BackgroundsPanel />
          </TabsContent>
        </div>
      </Tabs>
    </div>
  )
}
