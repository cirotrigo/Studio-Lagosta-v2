"use client"

import * as React from 'react'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { FontsPanel } from '../sidebar/fonts-panel'
import { TextPresetsPanel } from '../presets/text-presets-panel'
import { Type, Sparkles } from 'lucide-react'

export function TextToolsPanel() {
  return (
    <Tabs defaultValue="presets" className="w-full">
      <TabsList className="grid w-full grid-cols-2">
        <TabsTrigger value="presets" className="gap-2">
          <Type className="h-4 w-4" />
          Presets
        </TabsTrigger>
        <TabsTrigger value="fonts" className="gap-2">
          <Sparkles className="h-4 w-4" />
          Minhas Fontes
        </TabsTrigger>
      </TabsList>

      <TabsContent value="presets" className="mt-4">
        <TextPresetsPanel />
      </TabsContent>

      <TabsContent value="fonts" className="mt-4">
        <FontsPanel />
      </TabsContent>
    </Tabs>
  )
}
