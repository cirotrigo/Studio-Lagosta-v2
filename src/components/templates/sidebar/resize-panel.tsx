"use client"

import * as React from 'react'
import { Button } from '@/components/ui/button'
import { useTemplateEditor } from '@/contexts/template-editor-context'
import { useToast } from '@/hooks/use-toast'
import { RectangleVertical, Maximize2, Square } from 'lucide-react'

// Dimensões predefinidas para cada formato
const RESIZE_PRESETS = [
  {
    id: 'FEED',
    label: 'Feed',
    description: '1080 x 1350 px',
    width: 1080,
    height: 1350,
    icon: RectangleVertical,
  },
  {
    id: 'STORY',
    label: 'Stories',
    description: '1080 x 1920 px',
    width: 1080,
    height: 1920,
    icon: Maximize2,
  },
  {
    id: 'SQUARE',
    label: 'Quadrado',
    description: '1080 x 1080 px',
    width: 1080,
    height: 1080,
    icon: Square,
  },
]

export function ResizePanel() {
  const { toast } = useToast()
  const { design, updateCanvas } = useTemplateEditor()
  const [isResizing, setIsResizing] = React.useState(false)

  const currentWidth = design.canvas.width
  const currentHeight = design.canvas.height

  const handleResize = React.useCallback(
    async (preset: typeof RESIZE_PRESETS[0]) => {
      try {
        setIsResizing(true)

        // Verificar se já está no tamanho desejado
        if (currentWidth === preset.width && currentHeight === preset.height) {
          toast({
            title: 'Canvas já está neste tamanho',
            description: `O canvas já possui as dimensões ${preset.description}.`,
            variant: 'default',
          })
          return
        }

        // Atualizar as dimensões do canvas
        updateCanvas({
          width: preset.width,
          height: preset.height,
        })

        toast({
          title: 'Canvas redimensionado!',
          description: `O canvas foi redimensionado para ${preset.description}.`,
        })
      } catch (_error) {
        console.error('[ResizePanel] Erro ao redimensionar canvas:', error)
        toast({
          title: 'Erro ao redimensionar',
          description: 'Não foi possível redimensionar o canvas. Tente novamente.',
          variant: 'destructive',
        })
      } finally {
        setIsResizing(false)
      }
    },
    [currentWidth, currentHeight, updateCanvas, toast]
  )

  return (
    <div className="flex h-full min-h-[400px] flex-col gap-4 rounded-lg border border-border/40 bg-card/60 p-4 shadow-sm">
      <div className="space-y-2">
        <h3 className="text-sm font-semibold">Redimensionar Canvas</h3>
        <p className="text-xs text-muted-foreground">
          Escolha um dos formatos pré-definidos para redimensionar seu canvas. Os elementos existentes serão
          mantidos.
        </p>
        <div className="rounded-md bg-muted/40 p-3">
          <p className="text-xs font-medium text-foreground">
            Tamanho atual: {currentWidth} x {currentHeight} px
          </p>
        </div>
      </div>

      <div className="flex flex-1 flex-col gap-3">
        {RESIZE_PRESETS.map((preset) => {
          const Icon = preset.icon
          const isCurrent = currentWidth === preset.width && currentHeight === preset.height

          return (
            <button
              key={preset.id}
              onClick={() => handleResize(preset)}
              disabled={isResizing || isCurrent}
              className={`group relative flex items-center gap-4 rounded-lg border-2 p-4 text-left transition-all ${
                isCurrent
                  ? 'border-primary/60 bg-primary/10 cursor-default'
                  : 'border-border/40 bg-card/70 hover:border-primary/60 hover:bg-card hover:shadow-md'
              } ${isResizing ? 'opacity-50 cursor-not-allowed' : ''}`}
            >
              <div
                className={`flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-md ${
                  isCurrent ? 'bg-primary/20 text-primary' : 'bg-muted/60 text-muted-foreground group-hover:bg-primary/10 group-hover:text-primary'
                }`}
              >
                <Icon className="h-6 w-6" />
              </div>

              <div className="flex-1">
                <h4 className="font-semibold text-sm mb-0.5">{preset.label}</h4>
                <p className="text-xs text-muted-foreground">{preset.description}</p>
              </div>

              {isCurrent && (
                <div className="flex-shrink-0">
                  <span className="rounded-full bg-primary/20 px-2.5 py-1 text-[10px] font-semibold text-primary">
                    Atual
                  </span>
                </div>
              )}
            </button>
          )
        })}
      </div>

      <div className="rounded-md border border-amber-200/60 bg-amber-50/50 p-3 dark:border-amber-900/60 dark:bg-amber-950/20">
        <p className="text-xs text-amber-900 dark:text-amber-200">
          <strong>Atenção:</strong> Ao redimensionar o canvas, os elementos existentes não serão redimensionados
          automaticamente. Você precisará ajustá-los manualmente.
        </p>
      </div>
    </div>
  )
}
