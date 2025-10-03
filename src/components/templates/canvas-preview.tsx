"use client"

import * as React from 'react'
import { useTemplateEditor } from '@/contexts/template-editor-context'

/**
 * CanvasPreview - Preview do canvas (DEPRECATED)
 *
 * NOTA: Este componente foi substituído pelo KonvaEditorStage que oferece:
 * - Preview WYSIWYG em tempo real no próprio canvas
 * - Edição interativa
 * - Melhor performance
 *
 * O canvas principal do KonvaEditor já É o preview.
 * Este componente é mantido apenas para compatibilidade.
 */
export function CanvasPreview() {
  const { design } = useTemplateEditor()

  return (
    <div className="flex flex-col gap-2 rounded-lg border border-border/40 bg-card/60 p-3 shadow-sm">
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>Dimensões do Canvas</span>
        <span>
          {design.canvas.width} × {design.canvas.height}
        </span>
      </div>
      <div className="flex items-center justify-center rounded-md border border-dashed border-border/40 bg-muted/40 p-3 py-8">
        <p className="text-xs text-muted-foreground text-center">
          O canvas principal do editor<br />já é o preview em tempo real (WYSIWYG)
        </p>
      </div>
    </div>
  )
}
