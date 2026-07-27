"use client"

import * as React from 'react'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { FontsPanel } from '../sidebar/fonts-panel'
import { FontCombinationsPanel } from './font-combinations-panel'
import { Type, Sparkles } from 'lucide-react'

/**
 * Texto reúne adicionar textos, o par de fontes da marca e as combinações do
 * projeto — antes eram duas abas que exigiam ir e voltar para o mesmo trabalho.
 * Fontes segue separada por ser outra tarefa: enviar arquivos.
 */
export function TextToolsPanel() {
  return (
    <Tabs defaultValue="texto" className="w-full">
      <TabsList className="grid w-full grid-cols-2 rounded-lg border border-border/20 bg-muted/40 p-1">
        <TabsTrigger
          value="texto"
          className="gap-1.5 text-xs font-medium transition-all data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow-sm"
        >
          <Type className="h-3.5 w-3.5" />
          Texto
        </TabsTrigger>
        <TabsTrigger
          value="fonts"
          className="gap-1.5 text-xs font-medium transition-all data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow-sm"
        >
          <Sparkles className="h-3.5 w-3.5" />
          Fontes
        </TabsTrigger>
      </TabsList>

      <TabsContent value="texto" className="mt-4">
        <FontCombinationsPanel />
      </TabsContent>

      <TabsContent value="fonts" className="mt-4">
        <FontsPanel />
      </TabsContent>
    </Tabs>
  )
}
