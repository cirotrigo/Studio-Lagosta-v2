"use client"

import * as React from 'react'
import { Button } from '@/components/ui/button'
import { useTemplateEditor, createDefaultLayer } from '@/contexts/template-editor-context'

export function TextToolsPanel() {
  const { addLayer } = useTemplateEditor()

  const addTextLayer = React.useCallback((preset: 'heading' | 'subheading' | 'body') => {
    const base = createDefaultLayer('text')
    const presets = {
      heading: { fontSize: 48, content: 'Adicione um título', fontWeight: 'bold' },
      subheading: { fontSize: 32, content: 'Adicione um subtítulo', fontWeight: '600' },
      body: { fontSize: 16, content: 'Adicione um texto', fontWeight: 'normal' },
    }
    const config = presets[preset]
    const layer = {
      ...base,
      name: `Texto - ${preset}`,
      content: config.content,
      style: {
        ...base.style,
        fontSize: config.fontSize,
        fontWeight: config.fontWeight,
      },
    }
    addLayer(layer)
  }, [addLayer])

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <h3 className="text-xs font-semibold uppercase text-muted-foreground">Presets de Texto</h3>
        <div className="space-y-2">
          <Button
            variant="outline"
            className="h-auto w-full justify-start p-4 text-left"
            onClick={() => addTextLayer('heading')}
          >
            <div>
              <div className="text-2xl font-bold">Título</div>
              <div className="text-xs text-muted-foreground">Grande e em destaque</div>
            </div>
          </Button>
          <Button
            variant="outline"
            className="h-auto w-full justify-start p-4 text-left"
            onClick={() => addTextLayer('subheading')}
          >
            <div>
              <div className="text-xl font-semibold">Subtítulo</div>
              <div className="text-xs text-muted-foreground">Médio e secundário</div>
            </div>
          </Button>
          <Button
            variant="outline"
            className="h-auto w-full justify-start p-4 text-left"
            onClick={() => addTextLayer('body')}
          >
            <div>
              <div className="text-sm">Corpo de texto</div>
              <div className="text-xs text-muted-foreground">Texto normal</div>
            </div>
          </Button>
        </div>
      </div>
    </div>
  )
}
