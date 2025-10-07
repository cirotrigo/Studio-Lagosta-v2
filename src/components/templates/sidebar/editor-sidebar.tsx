"use client"

import * as React from 'react'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { cn } from '@/lib/utils'
import { TemplatesPanel } from './templates-panel'
import { TextPanel } from './text-panel'
import { ImagesPanel } from './images-panel'
import { ShapesPanel } from './shapes-panel'
import { IconsPanel } from './icons-panel'
import { UploadsPanel } from './uploads-panel'
import { BackgroundsPanel } from './backgrounds-panel'
import { GradientsPanel } from './gradients-panel'
import { AIImagesPanel } from './ai-images-panel'

interface EditorSidebarProps {
  className?: string
}

export function EditorSidebar({ className }: EditorSidebarProps) {
  const [activePrimaryTab, setActivePrimaryTab] = React.useState('templates')
  const [activeSecondaryTab, setActiveSecondaryTab] = React.useState('shapes')

  return (
    <div className={cn('flex h-full w-full flex-col overflow-hidden', className)}>
      <Tabs
        value={activePrimaryTab}
        onValueChange={setActivePrimaryTab}
        className="flex h-full flex-col overflow-hidden"
      >
        <div className="flex-shrink-0 border-b border-border/40 bg-muted/20 p-3">
          <TabsList className="grid h-9 grid-cols-7 rounded-md bg-muted/60">
            <TabsTrigger value="templates" className="text-[10px] font-semibold uppercase">
              Templates
            </TabsTrigger>
            <TabsTrigger value="text" className="text-[10px] font-semibold uppercase">
              Texto
            </TabsTrigger>
            <TabsTrigger value="images" className="text-[10px] font-semibold uppercase">
              Imagens
            </TabsTrigger>
            <TabsTrigger value="gradients" className="text-[10px] font-semibold uppercase">
              Gradientes
            </TabsTrigger>
            <TabsTrigger value="assets" className="text-[10px] font-semibold uppercase">
              Assets
            </TabsTrigger>
            <TabsTrigger value="backgrounds" className="text-[10px] font-semibold uppercase">
              Fundos
            </TabsTrigger>
            <TabsTrigger value="ai-images" className="text-[10px] font-semibold uppercase">
              IA ✨
            </TabsTrigger>
          </TabsList>
        </div>
        <div className="flex-1 overflow-hidden p-3">
          <TabsContent value="templates" className="h-full data-[state=inactive]:hidden">
            <TemplatesPanel />
          </TabsContent>
          <TabsContent value="text" className="h-full data-[state=inactive]:hidden">
            <TextPanel />
          </TabsContent>
          <TabsContent value="images" className="h-full data-[state=inactive]:hidden">
            <ImagesPanel />
          </TabsContent>
          <TabsContent value="gradients" className="h-full data-[state=inactive]:hidden">
            <GradientsPanel />
          </TabsContent>
          <TabsContent value="assets" className="h-full data-[state=inactive]:hidden">
            <AssetsSwitch value={activeSecondaryTab} onChange={setActiveSecondaryTab} />
            <div className="mt-3 h-[calc(100%-3rem)]">
              {activeSecondaryTab === 'shapes' && <ShapesPanel />}
              {activeSecondaryTab === 'icons' && <IconsPanel />}
              {activeSecondaryTab === 'uploads' && <UploadsPanel />}
            </div>
          </TabsContent>
          <TabsContent value="backgrounds" className="h-full data-[state=inactive]:hidden">
            <BackgroundsPanel />
          </TabsContent>
          <TabsContent value="ai-images" className="h-full data-[state=inactive]:hidden">
            <AIImagesPanel />
          </TabsContent>
        </div>
      </Tabs>
    </div>
  )
}

function AssetsSwitch({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  return (
    <div className="grid grid-cols-3 gap-2">
      {[
        { id: 'shapes', label: 'Formas' },
        { id: 'icons', label: 'Ícones' },
        { id: 'uploads', label: 'Uploads' },
      ].map((item) => (
        <button
          key={item.id}
          type="button"
          onClick={() => onChange(item.id)}
          className={cn(
            'rounded-md border px-2 py-1 text-[11px] font-semibold uppercase transition',
            value === item.id
              ? 'border-primary bg-primary/10 text-primary'
              : 'border-border/60 bg-muted/40 text-muted-foreground hover:border-primary/50 hover:text-primary',
          )}
        >
          {item.label}
        </button>
      ))}
    </div>
  )
}
