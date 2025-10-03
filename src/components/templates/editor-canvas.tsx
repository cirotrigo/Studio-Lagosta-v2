"use client"

import * as React from 'react'
import dynamic from 'next/dynamic'
import { Skeleton } from '@/components/ui/skeleton'
import { useTemplateEditor } from '@/contexts/template-editor-context'
import { TextToolbar } from './text-toolbar'

const KonvaEditorStage = dynamic(
  () => import('./konva-editor-stage').then((mod) => mod.KonvaEditorStage),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-full w-full flex-1 items-center justify-center overflow-auto rounded-lg border border-border/40 bg-muted/50 p-8">
        <Skeleton className="h-[480px] w-full" />
      </div>
    ),
  },
)

export function EditorCanvas() {
  const { selectedLayerIds, design, updateLayer } = useTemplateEditor()

  // Obter layer selecionado para verificar se é texto
  const selectedLayer = React.useMemo(() => {
    if (selectedLayerIds.length === 1) {
      return design.layers.find((layer) => layer.id === selectedLayerIds[0])
    }
    return null
  }, [selectedLayerIds, design.layers])

  const isTextSelected = selectedLayer?.type === 'text'

  return (
    <div className="flex h-full flex-col">
      {/* Text Toolbar - mostrar apenas quando um texto estiver selecionado */}
      {isTextSelected && selectedLayer && (
        <TextToolbar
          selectedLayer={selectedLayer}
          onUpdateLayer={(id, updates) => {
            updateLayer(id, (layer) => ({ ...layer, ...updates }))
          }}
        />
      )}

      {/* Canvas Konva */}
      <div className="flex-1 overflow-hidden">
        <KonvaEditorStage />
      </div>
    </div>
  )
}
