"use client"

import * as React from 'react'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { cn } from '@/lib/utils'
import { TemplatesPanel } from './templates-panel'
import { ResizePanel } from './resize-panel'

interface EditorSidebarProps {
  className?: string
}

export function EditorSidebar({ className }: EditorSidebarProps) {
  const [activePrimaryTab, setActivePrimaryTab] = React.useState('templates')

  return (
    <div className={cn('flex h-full w-full flex-col overflow-hidden', className)}>
      <Tabs
        value={activePrimaryTab}
        onValueChange={setActivePrimaryTab}
        className="flex h-full flex-col overflow-hidden"
      >
        <div className="flex-shrink-0 border-b border-border/40 bg-muted/20 p-3">
          <TabsList className="grid h-9 grid-cols-2 rounded-md bg-muted/60">
            <TabsTrigger value="templates" className="text-[10px] font-semibold uppercase">
              Templates
            </TabsTrigger>
            <TabsTrigger value="resize" className="text-[10px] font-semibold uppercase">
              Redimensionar
            </TabsTrigger>
          </TabsList>
        </div>
        <div className="flex-1 overflow-hidden p-3">
          <TabsContent value="templates" className="h-full data-[state=inactive]:hidden">
            <TemplatesPanel />
          </TabsContent>
          <TabsContent value="resize" className="h-full data-[state=inactive]:hidden">
            <ResizePanel />
          </TabsContent>
        </div>
      </Tabs>
    </div>
  )
}
