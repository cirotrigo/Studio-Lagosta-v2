'use client'

import { getAllLayouts } from '@/lib/ai-creative-generator/layout-templates'
import type { LayoutId } from '@/lib/ai-creative-generator/layout-types'

interface LayoutSelectorProps {
  selected: LayoutId
  onChange: (layout: LayoutId) => void
}

export function LayoutSelector({ selected, onChange }: LayoutSelectorProps) {
  const layouts = getAllLayouts()

  return (
    <div className="space-y-2">
      <label className="text-sm font-medium">Escolha o Layout</label>
      <div className="grid grid-cols-1 gap-2">
        {layouts.map((layout) => (
          <button
            key={layout.id}
            onClick={() => onChange(layout.id)}
            className={`p-4 border rounded-lg text-left transition ${
              selected === layout.id
                ? 'border-primary bg-primary/10'
                : 'border-border hover:border-primary/50'
            }`}
          >
            <h3 className="font-semibold">{layout.name}</h3>
            <p className="text-sm text-muted-foreground">{layout.description}</p>
          </button>
        ))}
      </div>
    </div>
  )
}
