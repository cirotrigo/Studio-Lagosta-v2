import { useMemo } from 'react'
import type { KonvaShapeLayer, StrokeStyle, StrokeStyleType } from '@/types/template'

interface ShapeStylePanelProps {
  layer: KonvaShapeLayer
  palette: string[]
  onUpdate: (updates: Partial<KonvaShapeLayer>) => void
}

const STROKE_PRESETS: Array<{ type: StrokeStyleType; label: string; dashArray?: number[] }> = [
  { type: 'solid', label: 'Solido' },
  { type: 'dashed', label: 'Tracejado', dashArray: [10, 5] },
  { type: 'dotted', label: 'Pontilhado', dashArray: [2, 4] },
]

export function ShapeStylePanel({ layer, palette, onUpdate }: ShapeStylePanelProps) {
  // Calcula o maximo do corner radius baseado nas dimensoes
  const maxCornerRadius = useMemo(() => {
    const width = layer.width ?? 100
    const height = layer.height ?? 100
    return Math.floor(Math.min(width, height) / 2)
  }, [layer.width, layer.height])

  const currentStrokeStyle = layer.strokeStyle ?? { type: 'solid' as StrokeStyleType }

  const handleStrokeStyleChange = (type: StrokeStyleType) => {
    const preset = STROKE_PRESETS.find((p) => p.type === type)
    const strokeStyle: StrokeStyle = {
      type,
      dashArray: preset?.dashArray,
    }
    onUpdate({ strokeStyle })
  }

  return (
    <div className="space-y-4">
      <div className="space-y-1 rounded-2xl border border-border/70 bg-background/20 px-3 py-3">
        <p className="text-sm font-semibold text-text">Estilo da Forma</p>
        <p className="text-xs text-text-muted">Borda, preenchimento e arredondamento.</p>
      </div>

      {/* Fill Color */}
      <label className="space-y-2">
        <span className="text-xs font-medium uppercase tracking-[0.18em] text-text-subtle">
          Preenchimento
        </span>
        {palette.length > 0 && (
          <div className="flex flex-wrap gap-2 rounded-xl border border-border bg-background/30 p-2">
            {palette.map((color) => (
              <button
                key={color}
                type="button"
                onClick={() => onUpdate({ fill: color })}
                className={`h-6 w-6 rounded-full border-2 transition-transform hover:scale-110 ${
                  layer.fill === color ? 'border-primary' : 'border-white/20'
                }`}
                style={{ backgroundColor: color }}
              />
            ))}
          </div>
        )}
        <div className="flex items-center gap-2 rounded-lg border border-border bg-input px-2 py-1.5">
          <input
            type="color"
            value={layer.fill ?? '#ffffff'}
            onChange={(e) => onUpdate({ fill: e.target.value })}
            className="h-6 w-6 cursor-pointer rounded border-0 bg-transparent p-0"
          />
          <input
            type="text"
            value={layer.fill ?? '#ffffff'}
            onChange={(e) => onUpdate({ fill: e.target.value })}
            className="flex-1 bg-transparent text-xs text-text focus:outline-none"
          />
        </div>
      </label>

      {/* Fill Opacity */}
      <label className="space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-xs font-medium uppercase tracking-[0.18em] text-text-subtle">
            Opacidade do Preenchimento
          </span>
          <span className="text-xs text-text-muted">{layer.fillOpacity ?? 100}%</span>
        </div>
        <div className="flex items-center gap-3">
          <input
            type="range"
            min={0}
            max={100}
            value={layer.fillOpacity ?? 100}
            onChange={(e) => onUpdate({ fillOpacity: Number(e.target.value) })}
            className="h-1.5 flex-1 cursor-pointer appearance-none rounded-full bg-border accent-primary"
          />
          <input
            type="number"
            min={0}
            max={100}
            value={layer.fillOpacity ?? 100}
            onChange={(e) => onUpdate({ fillOpacity: Math.min(100, Math.max(0, Number(e.target.value))) })}
            className="w-16 rounded-lg border border-border bg-input px-2 py-1.5 text-center text-xs text-text"
          />
        </div>
      </label>

      {/* Stroke Color */}
      <label className="space-y-2">
        <span className="text-xs font-medium uppercase tracking-[0.18em] text-text-subtle">
          Cor da Borda
        </span>
        {palette.length > 0 && (
          <div className="flex flex-wrap gap-2 rounded-xl border border-border bg-background/30 p-2">
            {palette.map((color) => (
              <button
                key={color}
                type="button"
                onClick={() => onUpdate({ stroke: color })}
                className={`h-6 w-6 rounded-full border-2 transition-transform hover:scale-110 ${
                  layer.stroke === color ? 'border-primary' : 'border-white/20'
                }`}
                style={{ backgroundColor: color }}
              />
            ))}
          </div>
        )}
        <div className="flex items-center gap-2 rounded-lg border border-border bg-input px-2 py-1.5">
          <input
            type="color"
            value={layer.stroke ?? '#000000'}
            onChange={(e) => onUpdate({ stroke: e.target.value })}
            className="h-6 w-6 cursor-pointer rounded border-0 bg-transparent p-0"
          />
          <input
            type="text"
            value={layer.stroke ?? '#000000'}
            onChange={(e) => onUpdate({ stroke: e.target.value })}
            className="flex-1 bg-transparent text-xs text-text focus:outline-none"
          />
        </div>
      </label>

      {/* Stroke Opacity */}
      <label className="space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-xs font-medium uppercase tracking-[0.18em] text-text-subtle">
            Opacidade da Borda
          </span>
          <span className="text-xs text-text-muted">{layer.strokeOpacity ?? 100}%</span>
        </div>
        <div className="flex items-center gap-3">
          <input
            type="range"
            min={0}
            max={100}
            value={layer.strokeOpacity ?? 100}
            onChange={(e) => onUpdate({ strokeOpacity: Number(e.target.value) })}
            className="h-1.5 flex-1 cursor-pointer appearance-none rounded-full bg-border accent-primary"
          />
          <input
            type="number"
            min={0}
            max={100}
            value={layer.strokeOpacity ?? 100}
            onChange={(e) => onUpdate({ strokeOpacity: Math.min(100, Math.max(0, Number(e.target.value))) })}
            className="w-16 rounded-lg border border-border bg-input px-2 py-1.5 text-center text-xs text-text"
          />
        </div>
      </label>

      {/* Stroke Style */}
      <div className="space-y-2">
        <span className="text-xs font-medium uppercase tracking-[0.18em] text-text-subtle">
          Estilo da Borda
        </span>
        <div className="flex gap-2">
          {STROKE_PRESETS.map((preset) => (
            <button
              key={preset.type}
              type="button"
              onClick={() => handleStrokeStyleChange(preset.type)}
              className={`flex-1 rounded-lg border px-3 py-2 text-xs transition-colors ${
                currentStrokeStyle.type === preset.type
                  ? 'border-primary bg-primary/10 text-primary'
                  : 'border-border bg-background/30 text-text-muted hover:border-primary/40'
              }`}
            >
              {preset.label}
            </button>
          ))}
        </div>
      </div>

      {/* Stroke Width */}
      <label className="space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-xs font-medium uppercase tracking-[0.18em] text-text-subtle">
            Espessura da Borda
          </span>
          <span className="text-xs text-text-muted">{layer.strokeWidth ?? 0}px</span>
        </div>
        <div className="flex items-center gap-3">
          <input
            type="range"
            min={0}
            max={100}
            value={layer.strokeWidth ?? 0}
            onChange={(e) => onUpdate({ strokeWidth: Number(e.target.value) })}
            className="h-1.5 flex-1 cursor-pointer appearance-none rounded-full bg-border accent-primary"
          />
          <input
            type="number"
            min={0}
            max={100}
            value={layer.strokeWidth ?? 0}
            onChange={(e) => onUpdate({ strokeWidth: Number(e.target.value) })}
            className="w-16 rounded-lg border border-border bg-input px-2 py-1.5 text-center text-xs text-text"
          />
        </div>
      </label>

      {/* Corner Radius */}
      <label className="space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-xs font-medium uppercase tracking-[0.18em] text-text-subtle">
            Arredondamento
          </span>
          <span className="text-xs text-text-muted">
            {layer.cornerRadius ?? 0}px (max: {maxCornerRadius}px)
          </span>
        </div>
        <div className="flex items-center gap-3">
          <input
            type="range"
            min={0}
            max={maxCornerRadius}
            value={Math.min(layer.cornerRadius ?? 0, maxCornerRadius)}
            onChange={(e) => onUpdate({ cornerRadius: Number(e.target.value) })}
            className="h-1.5 flex-1 cursor-pointer appearance-none rounded-full bg-border accent-primary"
          />
          <input
            type="number"
            min={0}
            max={maxCornerRadius}
            value={Math.min(layer.cornerRadius ?? 0, maxCornerRadius)}
            onChange={(e) => onUpdate({ cornerRadius: Math.min(Number(e.target.value), maxCornerRadius) })}
            className="w-16 rounded-lg border border-border bg-input px-2 py-1.5 text-center text-xs text-text"
          />
        </div>
        <p className="text-[10px] text-text-subtle">
          Maximo dinamico baseado na menor dimensao do objeto.
        </p>
      </label>
    </div>
  )
}
