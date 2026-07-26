"use client"

import * as React from 'react'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useTemplateEditor, createDefaultLayer } from '@/contexts/template-editor-context'
import { useBrandFonts, useUpdateBrandFonts } from '@/hooks/use-brand-fonts'
import { getFontManager } from '@/lib/font-manager'
import { FONT_CONFIG } from '@/lib/font-config'
import {
  COMBO_BASE_CANVAS_WIDTH,
  FONT_COMBO_LAYOUTS,
  estimateComboElementHeight,
  resolveComboFontFamily,
  type FontComboLayout,
  type FontComboPair,
} from '@/lib/font-combinations'
import type { Layer } from '@/types/template'

/**
 * FontCombinationsPanel - Combinações de fontes estilo Canva.
 *
 * Galeria de composições tipográficas (título + corpo) usando as fontes da
 * marca do projeto. Um clique insere o grupo no canvas; o grupo se move
 * junto, mas cada texto pode ser editado individualmente (clicando de novo).
 */
export function FontCombinationsPanel() {
  const { projectId, design, addLayer, selectLayers } = useTemplateEditor()
  const { data: brand, isLoading } = useBrandFonts(projectId)
  const updateBrand = useUpdateBrandFonts(projectId)
  const fontManager = React.useMemo(() => getFontManager(), [])
  const [isApplying, setIsApplying] = React.useState(false)

  const customFamilies = React.useMemo(
    () => [...new Set((brand?.fonts ?? []).map((font) => font.fontFamily))],
    [brand?.fonts],
  )
  const families = React.useMemo(
    () => [...new Set([FONT_CONFIG.DEFAULT_FONT, ...customFamilies])],
    [customFamilies],
  )

  // Par da marca: usa as fontes salvas no projeto; sem elas, primeira fonte
  // customizada como título e Montserrat como corpo
  const pair: FontComboPair = React.useMemo(
    () => ({
      title: brand?.titleFontFamily ?? customFamilies[0] ?? FONT_CONFIG.DEFAULT_FONT,
      body: brand?.bodyFontFamily ?? FONT_CONFIG.DEFAULT_FONT,
    }),
    [brand?.titleFontFamily, brand?.bodyFontFamily, customFamilies],
  )

  const setPairFont = React.useCallback(
    (role: 'title' | 'body', family: string) => {
      updateBrand.mutate(role === 'title' ? { titleFontFamily: family } : { bodyFontFamily: family })
    },
    [updateBrand],
  )

  const applyCombo = React.useCallback(
    async (layout: FontComboLayout) => {
      if (isApplying) return
      setIsApplying(true)
      try {
        // Garantir fontes carregadas antes de criar as layers
        await Promise.all(
          [pair.title, pair.body]
            .filter((family) => fontManager.isCustomFont(family))
            .map((family) => fontManager.loadFont(family)),
        )

        const canvasWidth = design.canvas.width
        const canvasHeight = design.canvas.height
        const scale = canvasWidth / COMBO_BASE_CANVAS_WIDTH
        const contentWidth = Math.round(canvasWidth * 0.82)
        const baseX = Math.round((canvasWidth - contentWidth) / 2)

        const totalHeight = layout.elements.reduce(
          (sum, element) =>
            sum + estimateComboElementHeight(element, scale) + Math.round((element.spacingBefore ?? 0) * scale),
          0,
        )
        let currentY = Math.round((canvasHeight - totalHeight) / 2)

        const groupId = `combo-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
        const created: Layer[] = []

        for (const element of layout.elements) {
          currentY += Math.round((element.spacingBefore ?? 0) * scale)
          const height = estimateComboElementHeight(element, scale)
          const base = createDefaultLayer('text')
          created.push({
            ...base,
            name: `${layout.name} - ${element.label}`,
            content: element.text,
            position: { x: baseX, y: currentY },
            size: { width: contentWidth, height },
            style: {
              ...base.style,
              fontSize: Math.round(element.fontSize * scale),
              fontFamily: resolveComboFontFamily(element.role, pair),
              fontWeight: element.fontWeight,
              fontStyle: element.fontStyle ?? 'normal',
              color: '#FFFFFF',
              textAlign: 'center',
              lineHeight: element.lineHeight,
              letterSpacing: element.letterSpacing ? Math.round(element.letterSpacing * scale) : undefined,
              textTransform: element.textTransform ?? 'none',
            },
            metadata: {
              presetId: layout.id,
              presetName: layout.name,
              elementId: element.id,
              elementLabel: element.label,
              groupId,
            },
          })
          currentY += height
        }

        created.forEach((layer) => addLayer(layer))
        selectLayers(created.map((layer) => layer.id))
      } finally {
        setIsApplying(false)
      }
    },
    [isApplying, pair, fontManager, design.canvas, addLayer, selectLayers],
  )

  return (
    <div className="space-y-4">
      {/* Par de fontes da marca */}
      <div className="space-y-2 rounded-md border border-border/40 bg-muted/30 p-2.5">
        <Label className="text-[11px] uppercase tracking-wide">Fontes da marca</Label>
        <div className="grid grid-cols-2 gap-2">
          <div className="space-y-1">
            <span className="text-[10px] text-muted-foreground">Título</span>
            <Select value={pair.title} onValueChange={(value) => setPairFont('title', value)}>
              <SelectTrigger className="h-8 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {families.map((family) => (
                  <SelectItem key={family} value={family} className="text-xs">
                    <span style={{ fontFamily: family }}>{family}</span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <span className="text-[10px] text-muted-foreground">Corpo</span>
            <Select value={pair.body} onValueChange={(value) => setPairFont('body', value)}>
              <SelectTrigger className="h-8 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {families.map((family) => (
                  <SelectItem key={family} value={family} className="text-xs">
                    <span style={{ fontFamily: family }}>{family}</span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        {customFamilies.length === 0 && !isLoading && (
          <p className="text-[10px] leading-snug text-muted-foreground">
            Envie fontes na aba <strong>Fontes</strong> para usá-las nas combinações.
          </p>
        )}
      </div>

      {/* Galeria de combinações */}
      <div className="grid grid-cols-2 gap-2">
        {FONT_COMBO_LAYOUTS.map((layout) => (
          <ComboCard key={layout.id} layout={layout} pair={pair} onApply={() => applyCombo(layout)} />
        ))}
      </div>
    </div>
  )
}

const PREVIEW_SCALE = 0.19

function ComboCard({
  layout,
  pair,
  onApply,
}: {
  layout: FontComboLayout
  pair: FontComboPair
  onApply: () => void
}) {
  return (
    <button
      type="button"
      onClick={onApply}
      title={layout.name}
      className="flex min-h-[110px] flex-col items-center justify-center gap-1 rounded-md border border-border/40 bg-card p-3 text-center transition hover:border-primary/60 hover:bg-muted/40"
    >
      {layout.elements.map((element) => (
        <span
          key={element.id}
          className="block max-w-full text-foreground"
          style={{
            fontFamily: resolveComboFontFamily(element.role, pair),
            fontSize: Math.max(8, Math.round(element.fontSize * PREVIEW_SCALE)),
            fontWeight: Number(element.fontWeight) || 400,
            fontStyle: element.fontStyle ?? 'normal',
            letterSpacing: element.letterSpacing ? element.letterSpacing * PREVIEW_SCALE : undefined,
            lineHeight: element.lineHeight,
            textTransform: element.textTransform === 'uppercase' ? 'uppercase' : 'none',
            whiteSpace: 'pre-line',
          }}
        >
          {element.text}
        </span>
      ))}
    </button>
  )
}
