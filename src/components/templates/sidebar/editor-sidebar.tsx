"use client"

import * as React from 'react'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { cn } from '@/lib/utils'
import { LayersPanel } from '../layers-panel'
import { TemplatesPanel } from './templates-panel'

interface EditorSidebarProps {
  className?: string
}

export function EditorSidebar({ className }: EditorSidebarProps) {
  const [activeTab, setActiveTab] = React.useState<'templates' | 'layers'>('templates')

  return (
    <div className={cn('flex h-full w-full max-w-[360px] flex-col', className)}>
      <Tabs
        value={activeTab}
        onValueChange={(value) => setActiveTab(value as 'templates' | 'layers')}
        className="flex h-full flex-col"
      >
        <TabsList className="grid h-10 grid-cols-2 rounded-lg bg-muted/60">
          <TabsTrigger value="templates" className="text-xs font-semibold uppercase">
            Templates
          </TabsTrigger>
          <TabsTrigger value="layers" className="text-xs font-semibold uppercase">
            Layers
          </TabsTrigger>
        </TabsList>
        <div className="mt-3 flex-1 overflow-hidden">
          <TabsContent
            value="templates"
            className="h-full data-[state=inactive]:hidden"
          >
            <TemplatesPanel />
          </TabsContent>
          <TabsContent
            value="layers"
            className="h-full data-[state=inactive]:hidden"
          >
            <LayersPanel />
          </TabsContent>
        </div>
      </Tabs>
    </div>
  )
}
