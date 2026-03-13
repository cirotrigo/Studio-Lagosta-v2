import { ChevronDown, ChevronRight } from 'lucide-react'
import { useState } from 'react'
import type {
  DropShadowEffect,
  TextStrokeEffect,
  TextBackgroundEffect,
  CurvedTextEffect,
  LayerEffects,
  Layer,
} from '@/types/template'

interface EffectSectionProps {
  title: string
  enabled: boolean
  onToggle: (enabled: boolean) => void
  children: React.ReactNode
}

function EffectSection({ title, enabled, onToggle, children }: EffectSectionProps) {
  const [isOpen, setIsOpen] = useState(enabled)

  return (
    <div className="rounded-xl border border-border bg-background/30">
      <button
        type="button"
        onClick={() => {
          if (!enabled) {
            onToggle(true)
            setIsOpen(true)
          } else {
            setIsOpen(!isOpen)
          }
        }}
        className="flex w-full items-center justify-between px-3 py-2.5"
      >
        <div className="flex items-center gap-2">
          {isOpen && enabled ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
          <span className="text-sm font-medium text-text">{title}</span>
        </div>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation()
            onToggle(!enabled)
          }}
          className={`h-5 w-9 rounded-full px-0.5 transition-colors ${
            enabled ? 'bg-primary' : 'bg-border'
          }`}
        >
          <span
            className={`block h-4 w-4 rounded-full bg-white transition-transform ${
              enabled ? 'translate-x-4' : 'translate-x-0'
            }`}
          />
        </button>
      </button>
      {isOpen && enabled && <div className="space-y-3 border-t border-border px-3 py-3">{children}</div>}
    </div>
  )
}

function SliderField({
  label,
  value,
  min,
  max,
  step = 1,
  onChange,
}: {
  label: string
  value: number
  min: number
  max: number
  step?: number
  onChange: (value: number) => void
}) {
  return (
    <label className="space-y-1.5">
      <div className="flex items-center justify-between">
        <span className="text-xs text-text-muted">{label}</span>
        <span className="text-xs text-text-subtle">{value}</span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="h-1.5 w-full cursor-pointer appearance-none rounded-full bg-border accent-primary"
      />
    </label>
  )
}

function ColorInput({
  label,
  value,
  onChange,
}: {
  label: string
  value: string
  onChange: (value: string) => void
}) {
  return (
    <label className="space-y-1">
      <span className="text-xs text-text-muted">{label}</span>
      <div className="flex items-center gap-2 rounded-lg border border-border bg-input px-2 py-1.5">
        <input
          type="color"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="h-6 w-6 cursor-pointer rounded border-0 bg-transparent p-0"
        />
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="flex-1 bg-transparent text-xs text-text focus:outline-none"
        />
      </div>
    </label>
  )
}

// Drop Shadow Control
interface DropShadowControlProps {
  effect: DropShadowEffect | undefined
  onChange: (effect: DropShadowEffect) => void
}

function DropShadowControl({ effect, onChange }: DropShadowControlProps) {
  const current: DropShadowEffect = effect ?? {
    enabled: false,
    offsetX: 4,
    offsetY: 4,
    blur: 8,
    opacity: 50,
    color: '#000000',
  }

  const update = (partial: Partial<DropShadowEffect>) => {
    onChange({ ...current, ...partial })
  }

  return (
    <EffectSection
      title="Sombra"
      enabled={current.enabled}
      onToggle={(enabled) => update({ enabled })}
    >
      <div className="grid grid-cols-2 gap-3">
        <SliderField
          label="Offset X"
          value={current.offsetX}
          min={-50}
          max={50}
          onChange={(offsetX) => update({ offsetX })}
        />
        <SliderField
          label="Offset Y"
          value={current.offsetY}
          min={-50}
          max={50}
          onChange={(offsetY) => update({ offsetY })}
        />
      </div>
      <SliderField
        label="Blur"
        value={current.blur}
        min={0}
        max={50}
        onChange={(blur) => update({ blur })}
      />
      <SliderField
        label="Opacidade"
        value={current.opacity}
        min={0}
        max={100}
        onChange={(opacity) => update({ opacity })}
      />
      <ColorInput label="Cor" value={current.color} onChange={(color) => update({ color })} />
    </EffectSection>
  )
}

// Text Stroke Control
interface TextStrokeControlProps {
  effect: TextStrokeEffect | undefined
  onChange: (effect: TextStrokeEffect) => void
}

function TextStrokeControl({ effect, onChange }: TextStrokeControlProps) {
  const current: TextStrokeEffect = effect ?? {
    enabled: false,
    width: 2,
    color: '#000000',
  }

  const update = (partial: Partial<TextStrokeEffect>) => {
    onChange({ ...current, ...partial })
  }

  return (
    <EffectSection
      title="Contorno do Texto"
      enabled={current.enabled}
      onToggle={(enabled) => update({ enabled })}
    >
      <SliderField
        label="Espessura"
        value={current.width}
        min={0}
        max={20}
        onChange={(width) => update({ width })}
      />
      <ColorInput label="Cor" value={current.color} onChange={(color) => update({ color })} />
    </EffectSection>
  )
}

// Text Background Control
interface TextBackgroundControlProps {
  effect: TextBackgroundEffect | undefined
  onChange: (effect: TextBackgroundEffect) => void
}

function TextBackgroundControl({ effect, onChange }: TextBackgroundControlProps) {
  const current: TextBackgroundEffect = effect ?? {
    enabled: false,
    cornerRadius: 8,
    padding: 12,
    opacity: 100,
    color: '#000000',
  }

  const update = (partial: Partial<TextBackgroundEffect>) => {
    onChange({ ...current, ...partial })
  }

  return (
    <EffectSection
      title="Fundo do Texto"
      enabled={current.enabled}
      onToggle={(enabled) => update({ enabled })}
    >
      <SliderField
        label="Arredondamento"
        value={current.cornerRadius}
        min={0}
        max={50}
        onChange={(cornerRadius) => update({ cornerRadius })}
      />
      <SliderField
        label="Padding"
        value={current.padding}
        min={0}
        max={50}
        onChange={(padding) => update({ padding })}
      />
      <SliderField
        label="Opacidade"
        value={current.opacity}
        min={0}
        max={100}
        onChange={(opacity) => update({ opacity })}
      />
      <ColorInput label="Cor" value={current.color} onChange={(color) => update({ color })} />
    </EffectSection>
  )
}

// Curved Text Control
interface CurvedTextControlProps {
  effect: CurvedTextEffect | undefined
  onChange: (effect: CurvedTextEffect) => void
}

function CurvedTextControl({ effect, onChange }: CurvedTextControlProps) {
  const current: CurvedTextEffect = effect ?? {
    enabled: false,
    power: 0,
  }

  const update = (partial: Partial<CurvedTextEffect>) => {
    onChange({ ...current, ...partial })
  }

  return (
    <EffectSection
      title="Texto Curvado"
      enabled={current.enabled}
      onToggle={(enabled) => update({ enabled })}
    >
      <SliderField
        label="Curvatura"
        value={current.power}
        min={-100}
        max={100}
        onChange={(power) => update({ power })}
      />
      <p className="text-[10px] text-text-subtle">
        Negativo = curva para baixo, Positivo = curva para cima
      </p>
    </EffectSection>
  )
}

// Main Effects Panel
interface EffectsPanelProps {
  layer: Layer
  onUpdateEffects: (effects: LayerEffects) => void
}

export function EffectsPanel({ layer, onUpdateEffects }: EffectsPanelProps) {
  const effects = layer.effects ?? {}
  const isTextLayer = layer.type === 'text' || layer.type === 'rich-text'

  const updateEffect = <K extends keyof LayerEffects>(key: K, value: LayerEffects[K]) => {
    onUpdateEffects({ ...effects, [key]: value })
  }

  return (
    <div className="space-y-3">
      <div className="space-y-1 rounded-2xl border border-border/70 bg-background/20 px-3 py-3">
        <p className="text-sm font-semibold text-text">Efeitos</p>
        <p className="text-xs text-text-muted">Sombras, contornos e transformacoes visuais.</p>
      </div>

      <DropShadowControl
        effect={effects.dropShadow}
        onChange={(dropShadow) => updateEffect('dropShadow', dropShadow)}
      />

      {isTextLayer && (
        <>
          <TextStrokeControl
            effect={effects.textStroke}
            onChange={(textStroke) => updateEffect('textStroke', textStroke)}
          />
          <TextBackgroundControl
            effect={effects.textBackground}
            onChange={(textBackground) => updateEffect('textBackground', textBackground)}
          />
          <CurvedTextControl
            effect={effects.curvedText}
            onChange={(curvedText) => updateEffect('curvedText', curvedText)}
          />
        </>
      )}
    </div>
  )
}
