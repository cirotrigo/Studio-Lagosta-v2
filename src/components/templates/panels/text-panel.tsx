"use client"

import * as React from 'react'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { FontsPanel } from '../sidebar/fonts-panel'
import { TextPresetsPanel } from '../presets/text-presets-panel'
import { SimpleTextPanel } from './simple-text-panel'
import { Type, Sparkles, Plus } from 'lucide-react'

export function TextToolsPanel() {
  return (
    <Tabs defaultValue="simple" className="w-full">
      <TabsList className="grid w-full grid-cols-3">
        <TabsTrigger value="simple" className="gap-1.5 text-xs">
          <Plus className="h-3.5 w-3.5" />
          Texto
        </TabsTrigger>
        <TabsTrigger value="presets" className="gap-1.5 text-xs">
          <Type className="h-3.5 w-3.5" />
          Presets
        </TabsTrigger>
        <TabsTrigger value="fonts" className="gap-1.5 text-xs">
          <Sparkles className="h-3.5 w-3.5" />
          Fontes
        </TabsTrigger>
      </TabsList>

      <TabsContent value="simple" className="mt-4">
        <SimpleTextPanel />
      </TabsContent>

      <TabsContent value="presets" className="mt-4">
        <TextPresetsPanel />
      </TabsContent>

      <TabsContent value="fonts" className="mt-4">
        <FontsPanel />
      </TabsContent>
    </Tabs>
  )
}
