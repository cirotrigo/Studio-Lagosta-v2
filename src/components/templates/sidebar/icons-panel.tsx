"use client"

import * as React from 'react'
import { ScrollArea } from '@/components/ui/scroll-area'
import { ICON_LIBRARY } from '@/lib/assets/icon-library'
import { useTemplateEditor, createDefaultLayer } from '@/contexts/template-editor-context'

export function IconsPanel() {
  const { addLayer } = useTemplateEditor()

  const handleAddIcon = React.useCallback(
    (iconId: string) => {
      const icon = ICON_LIBRARY.find((item) => item.id === iconId)
      if (!icon) return
      const base = createDefaultLayer('icon')
      addLayer({
        ...base,
        name: `Ícone - ${icon.label}`,
        style: {
          ...base.style,
          iconId: icon.id,
          fill: base.style?.fill ?? '#111111',
        },
      })
    },
    [addLayer],
  )

  return (
    <div className="flex h-full min-h-[400px] flex-col gap-3 rounded-lg border border-border/40 bg-card/60 p-4 shadow-sm">
      <div className="space-y-2">
        <h3 className="text-sm font-semibold">Ícones</h3>
        <p className="text-xs text-muted-foreground">Selecione ícones vetoriais para compor o layout.</p>
      </div>
      <ScrollArea className="flex-1">
        <div className="grid gap-3 pr-2 md:grid-cols-3">
          {ICON_LIBRARY.map((icon) => (
            <button
              key={icon.id}
              type="button"
              onClick={() => handleAddIcon(icon.id)}
              className="flex flex-col items-center justify-center gap-2 rounded-lg border border-border/40 bg-muted/40 p-3 transition hover:border-primary"
            >
              <div className="flex h-12 w-12 items-center justify-center rounded-md bg-background">
                <svg viewBox="0 0 24 24" className="h-7 w-7" fill="currentColor" stroke="none">
                  <path d={icon.path} />
                </svg>
              </div>
              <span className="text-[10px] font-medium uppercase text-muted-foreground">{icon.label}</span>
            </button>
          ))}
        </div>
      </ScrollArea>
    </div>
  )
}
