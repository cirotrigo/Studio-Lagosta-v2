"use client"

import * as React from 'react'
import type { TemplateDto } from '@/hooks/use-template'

interface StudioCanvasProps {
  template: TemplateDto
  fieldValues: Record<string, unknown>
}

/**
 * StudioCanvas - Preview do template (DEPRECATED)
 *
 * NOTA: Este componente foi substituído pelo KonvaEditor que oferece:
 * - Preview WYSIWYG em tempo real
 * - Edição interativa completa
 * - Melhor performance
 *
 * Mantido apenas para compatibilidade. Use KonvaEditor em novos projetos.
 */
export function StudioCanvas({ template, fieldValues }: StudioCanvasProps) {
  const width = template.designData.canvas.width
  const height = template.designData.canvas.height
  const scale = React.useMemo(() => {
    const maxDimension = 520
    return Math.min(1, maxDimension / Math.max(width, height))
  }, [width, height])

  return (
    <div className="flex flex-col gap-2">
      <div className="rounded-md border border-border/40 bg-muted/30 p-3 text-xs text-muted-foreground">
        Preview estático (use KonvaEditor para preview interativo)
      </div>
      <div className="flex items-center justify-center rounded-lg border border-border/40 bg-card/60 p-4">
        <div
          style={{
            width: width * scale,
            height: height * scale,
            maxWidth: '100%',
            borderRadius: 12,
            backgroundColor: template.designData.canvas.backgroundColor || '#ffffff',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '14px',
            color: '#888',
          }}
        >
          {template.name}
        </div>
      </div>
    </div>
  )
}
