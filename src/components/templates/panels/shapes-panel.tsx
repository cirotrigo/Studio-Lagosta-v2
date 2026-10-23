"use client"

import * as React from 'react'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { SHAPES_LIBRARY, SHAPE_CATEGORIES, type ShapeDefinition } from '@/lib/assets/shapes-library'
import { useTemplateEditor, createDefaultLayer } from '@/contexts/template-editor-context'
import { useBrandColorsEstrita } from '@/hooks/use-brand-colors'
import { useProject } from '@/hooks/use-project'
import { camadaParaInserir, estadoDaInsercao } from '@/lib/editor/estado-da-insercao'

/**
 * Painel "Formas" único (estilo Polotno): busca + categorias. Substitui os antigos painéis órfãos de formas/ícones.
 * Insere SÓ pelo construtor (`camadaParaInserir`, CP-V2c): cores da marca por papel, nunca a vitrine do item, e só
 * com a paleta e a assinatura do projeto atual confirmadas (`estadoDaInsercao`).
 */
export function ShapesPanel() {
  const { addLayer, design, projectId } = useTemplateEditor()
  const [query, setQuery] = React.useState('')
  const paleta = useBrandColorsEstrita(projectId)
  const projeto = useProject(projectId)
  const estado = estadoDaInsercao({ projectId, paleta, projeto })

  const filtered = React.useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return SHAPES_LIBRARY
    return SHAPES_LIBRARY.filter(
      (shape) =>
        shape.label.toLowerCase().includes(q) ||
        shape.keywords?.some((k) => k.toLowerCase().includes(q)),
    )
  }, [query])

  const handleAddShape = React.useCallback(
    (definition: ShapeDefinition) => {
      // fora de `pronto` não há camada: nenhum addLayer, nenhuma entrada de desfazer
      const camada = camadaParaInserir(estado, definition, { base: createDefaultLayer('shape'), canvas: design.canvas })
      if (camada) addLayer(camada)
    },
    [addLayer, design.canvas, estado],
  )
  const pronto = estado.estado === 'pronto'

  return (
    <div className="flex h-full min-h-[400px] flex-col gap-3 rounded-lg border border-border/40 bg-card/60 p-4 shadow-sm">
      <div className="space-y-2">
        <h3 className="text-sm font-semibold">Formas</h3>
        <Input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Buscar forma..."
          className="h-8 text-xs"
        />
        {estado.estado === 'carregando' && (
          <p className="text-xs text-muted-foreground">Carregando as cores da marca…</p>
        )}
        {estado.estado === 'erro' && (
          <div className="space-y-2 rounded-md border border-destructive/40 p-2 text-xs">
            <p>Não foi possível carregar as cores da marca. As formas ficam bloqueadas até carregar.</p>
            <Button
              size="sm"
              variant="outline"
              className="h-7 text-xs"
              onClick={() => {
                if (estado.falhas.includes('paleta')) void paleta.refetch()
                if (estado.falhas.includes('projeto')) void projeto.refetch()
              }}
            >
              Tentar de novo
            </Button>
          </div>
        )}
      </div>
      <ScrollArea className="flex-1">
        <div className="space-y-4 pr-2">
          {SHAPE_CATEGORIES.map((category) => {
            const shapes = filtered.filter((shape) => shape.category === category.id)
            if (shapes.length === 0) return null
            return (
              <div key={category.id}>
                <p className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                  {category.label}
                </p>
                <div className="grid grid-cols-3 gap-2">
                  {shapes.map((shape) => (
                    <button
                      key={shape.id}
                      type="button"
                      onClick={() => handleAddShape(shape)}
                      disabled={!pronto}
                      title={shape.label}
                      className="flex aspect-square items-center justify-center rounded-lg border border-border/40 bg-muted/40 p-2 transition hover:border-primary hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      <ShapePreview shape={shape} />
                    </button>
                  ))}
                </div>
              </div>
            )
          })}
          {filtered.length === 0 && (
            <p className="text-xs text-muted-foreground">Nenhuma forma encontrada.</p>
          )}
        </div>
      </ScrollArea>
    </div>
  )
}

function ShapePreview({ shape }: { shape: ShapeDefinition }) {
  const fill = 'currentColor'

  if (shape.shapeType === 'svg-path' && shape.pathData) {
    return (
      <svg viewBox="0 0 100 100" className="h-full w-full text-muted-foreground">
        <path d={shape.pathData} fill={fill} fillRule={shape.pathFillRule ?? 'nonzero'} />
      </svg>
    )
  }

  if (shape.shapeType === 'line') {
    const dash = shape.lineStyle === 'dashed' ? '10 7' : shape.lineStyle === 'dotted' ? '0.5 8' : undefined
    return (
      <svg viewBox="0 0 100 100" className="h-full w-full text-muted-foreground">
        {shape.lineStartCap === 'arrow' && <path d="M2 50 L20 40 V60 Z" fill={fill} />}
        {shape.lineEndCap === 'arrow' && <path d="M98 50 L80 40 V60 Z" fill={fill} />}
        <line
          x1={shape.lineStartCap === 'arrow' ? 18 : 5}
          y1={50}
          x2={shape.lineEndCap === 'arrow' ? 82 : 95}
          y2={50}
          stroke={fill}
          strokeWidth={5}
          strokeLinecap="round"
          strokeDasharray={dash}
        />
      </svg>
    )
  }

  switch (shape.shapeType) {
    case 'rectangle':
      return <svg viewBox="0 0 100 100" className="h-full w-full text-muted-foreground"><rect x="8" y="18" width="84" height="64" fill={fill} /></svg>
    case 'rounded-rectangle':
      return <svg viewBox="0 0 100 100" className="h-full w-full text-muted-foreground"><rect x="8" y="18" width="84" height="64" rx="14" fill={fill} /></svg>
    case 'circle':
      return <svg viewBox="0 0 100 100" className="h-full w-full text-muted-foreground"><circle cx="50" cy="50" r="42" fill={fill} /></svg>
    case 'triangle':
      return <svg viewBox="0 0 100 100" className="h-full w-full text-muted-foreground"><path d="M50 8 L92 88 H8 Z" fill={fill} /></svg>
    case 'star':
      return (
        <svg viewBox="0 0 100 100" className="h-full w-full text-muted-foreground">
          <path d="M50 5 L61 38 L96 38 L68 59 L79 92 L50 72 L21 92 L32 59 L4 38 L39 38 Z" fill={fill} />
        </svg>
      )
    case 'arrow':
      return (
        <svg viewBox="0 0 100 100" className="h-full w-full text-muted-foreground">
          <path d="M5 50 H65 V38 L95 50 L65 62 V50" stroke={fill} strokeWidth="8" fill={fill} strokeLinejoin="round" />
        </svg>
      )
    default:
      return null
  }
}
