"use client"

import * as React from 'react'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { useTemplateEditor, createDefaultLayer } from '@/contexts/template-editor-context'

const TEXT_PRESETS = [
  {
    id: 'heading',
    label: 'Título',
    content: 'Título de destaque',
    style: {
      fontSize: 48,
      fontWeight: 700,
    },
  },
  {
    id: 'subheading',
    label: 'Subtítulo',
    content: 'Subtítulo cativante',
    style: {
      fontSize: 32,
      fontWeight: 600,
    },
  },
  {
    id: 'body',
    label: 'Parágrafo',
    content: 'Escreva sua mensagem aqui. Este é um texto padrão para parágrafos.',
    style: {
      fontSize: 20,
      fontWeight: 400,
      lineHeight: 1.4,
    },
  },
  {
    id: 'quote',
    label: 'Citação',
    content: '“Criatividade exige coragem.” — Henri Matisse',
    style: {
      fontSize: 28,
      fontStyle: 'italic' as const,
      fontWeight: 500,
    },
  },
]

export function TextPanel() {
  const { addLayer } = useTemplateEditor()

  const handleAddText = React.useCallback(
    (preset: (typeof TEXT_PRESETS)[number]) => {
      const base = createDefaultLayer('text')
      addLayer({
        ...base,
        name: `Texto - ${preset.label}`,
        content: preset.content,
        style: {
          ...base.style,
          ...preset.style,
        },
      })
    },
    [addLayer],
  )

  const handleAddSimpleText = React.useCallback(() => {
    const base = createDefaultLayer('text')
    addLayer({
      ...base,
      name: 'Novo texto',
    })
  }, [addLayer])

  return (
    <div className="flex h-full min-h-[400px] flex-col gap-3 rounded-lg border border-border/40 bg-card/60 p-4 shadow-sm">
      <div className="space-y-2">
        <h3 className="text-sm font-semibold">Texto</h3>
        <p className="text-xs text-muted-foreground">Adicione blocos de texto com estilos pré-definidos.</p>
        <Button size="sm" onClick={handleAddSimpleText} className="w-full">
          Adicionar texto simples
        </Button>
      </div>
      <ScrollArea className="flex-1">
        <div className="space-y-3 pr-2">
          {TEXT_PRESETS.map((preset) => (
            <button
              key={preset.id}
              type="button"
              onClick={() => handleAddText(preset)}
              className="w-full rounded-lg border border-border/40 bg-muted/30 p-3 text-left transition hover:border-primary"
            >
              <p className="text-xs font-semibold uppercase text-muted-foreground">{preset.label}</p>
              <p
                className="mt-2 text-sm"
                style={{
                  fontSize: preset.style.fontSize,
                  fontWeight: preset.style.fontWeight,
                  fontStyle: preset.style.fontStyle,
                  lineHeight: preset.style.lineHeight,
                }}
              >
                {preset.content}
              </p>
            </button>
          ))}
        </div>
      </ScrollArea>
    </div>
  )
}
