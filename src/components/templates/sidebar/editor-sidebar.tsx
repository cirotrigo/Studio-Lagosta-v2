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

interface EditorSidebarProps {
  className?: string
}

export function EditorSidebar({ className }: EditorSidebarProps) {
  const [activePrimaryTab, setActivePrimaryTab] = React.useState('templates')
  const [activeSecondaryTab, setActiveSecondaryTab] = React.useState('shapes')

  return (
    <div className={cn('flex h-full w-full max-w-[360px] flex-col', className)}>
      <Tabs
        value={activePrimaryTab}
        onValueChange={setActivePrimaryTab}
        className="flex h-full flex-col"
      >
        <TabsList className="grid h-10 grid-cols-5 rounded-lg bg-muted/60">
          <TabsTrigger value="templates" className="text-[11px] font-semibold uppercase">
            Templates
          </TabsTrigger>
          <TabsTrigger value="text" className="text-[11px] font-semibold uppercase">
            Texto
          </TabsTrigger>
          <TabsTrigger value="images" className="text-[11px] font-semibold uppercase">
            Imagens
          </TabsTrigger>
          <TabsTrigger value="assets" className="text-[11px] font-semibold uppercase">
            Assets
          </TabsTrigger>
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
