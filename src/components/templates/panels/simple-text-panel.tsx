"use client"

import * as React from 'react'
import { Button } from '@/components/ui/button'
import { Type, Heading1, Heading2, Heading3, AlignLeft } from 'lucide-react'
import { useTemplateEditor, createDefaultLayer } from '@/contexts/template-editor-context'
import { useToast } from '@/hooks/use-toast'

export function SimpleTextPanel() {
  const { addLayer, design } = useTemplateEditor()
  const { toast } = useToast()

  const canvasWidth = design.canvas.width
  const canvasHeight = design.canvas.height

  const addSimpleText = React.useCallback(
    (type: 'heading' | 'subheading' | 'body' | 'title') => {
      const base = createDefaultLayer('text')

      let fontSize = 48
      let fontWeight = 400
      let text = 'Seu Texto Aqui'

      switch (type) {
        case 'title':
          fontSize = 72
          fontWeight = 700
          text = 'Título Principal'
          break
        case 'heading':
          fontSize = 56
          fontWeight = 600
          text = 'Título'
          break
        case 'subheading':
          fontSize = 36
          fontWeight = 500
          text = 'Subtítulo'
          break
        case 'body':
          fontSize = 24
          fontWeight = 400
          text = 'Texto do corpo'
          break
      }

      const layer = {
        ...base,
        name: `Texto - ${text}`,
        text,
        position: { x: canvasWidth / 2, y: canvasHeight / 2 },
        style: {
          ...base.style,
          fontSize,
          fontWeight,
          fontFamily: 'Inter',
          color: '#FFFFFF',
          align: 'center' as const,
        },
      }

      addLayer(layer)

      toast({
        title: 'Texto adicionado',
        description: 'Clique no texto para editar.'
      })
    },
    [addLayer, canvasWidth, canvasHeight, toast],
  )

  return (
    <div className="space-y-3">
      <div>
        <h3 className="text-sm font-semibold mb-1">Adicionar Texto</h3>
        <p className="text-xs text-muted-foreground">
          Escolha um estilo de texto para começar
        </p>
      </div>

      <div className="grid gap-2">
        <Button
          variant="outline"
          className="h-auto flex-col items-start gap-1 py-3 px-4"
          onClick={() => addSimpleText('title')}
        >
          <div className="flex items-center gap-2 w-full">
            <Heading1 className="h-5 w-5 text-primary" />
            <span className="font-semibold text-sm">Título Principal</span>
          </div>
          <span className="text-xs text-muted-foreground pl-7">72px · Bold</span>
        </Button>

        <Button
          variant="outline"
          className="h-auto flex-col items-start gap-1 py-3 px-4"
          onClick={() => addSimpleText('heading')}
        >
          <div className="flex items-center gap-2 w-full">
            <Heading2 className="h-5 w-5 text-primary" />
            <span className="font-semibold text-sm">Título</span>
          </div>
          <span className="text-xs text-muted-foreground pl-7">56px · Semibold</span>
        </Button>

        <Button
          variant="outline"
          className="h-auto flex-col items-start gap-1 py-3 px-4"
          onClick={() => addSimpleText('subheading')}
        >
          <div className="flex items-center gap-2 w-full">
            <Heading3 className="h-5 w-5 text-primary" />
            <span className="font-semibold text-sm">Subtítulo</span>
          </div>
          <span className="text-xs text-muted-foreground pl-7">36px · Medium</span>
        </Button>

        <Button
          variant="outline"
          className="h-auto flex-col items-start gap-1 py-3 px-4"
          onClick={() => addSimpleText('body')}
        >
          <div className="flex items-center gap-2 w-full">
            <AlignLeft className="h-5 w-5 text-primary" />
            <span className="font-semibold text-sm">Corpo de Texto</span>
          </div>
          <span className="text-xs text-muted-foreground pl-7">24px · Regular</span>
        </Button>
      </div>

      <div className="rounded-lg border border-border/40 bg-muted/20 p-3 mt-4">
        <p className="text-xs text-muted-foreground">
          <strong>Dica:</strong> Após adicionar, clique no texto no canvas para editar o conteúdo e ajustar o estilo.
        </p>
      </div>
    </div>
  )
}
