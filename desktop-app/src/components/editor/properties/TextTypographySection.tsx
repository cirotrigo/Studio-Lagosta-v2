import {
  Bold,
  Italic,
  Underline,
  Strikethrough,
  AlignLeft,
  AlignCenter,
  AlignRight,
  AlignJustify,
  ArrowUpFromLine,
  ArrowDownFromLine,
  Minus,
  CaseSensitive,
  CaseUpper,
  CaseLower,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import type { KonvaTextLayer } from '@/types/template'

// ─── Compact Number Input with Icon ────────────────────────────────

function CompactNumberInput({
  icon: Icon,
  value,
  min,
  max,
  step = 1,
  onChange,
  title,
}: {
  icon: React.ElementType
  value: number
  min: number
  max: number
  step?: number
  onChange: (value: number) => void
  title: string
}) {
  return (
    <div className="flex flex-col items-center gap-1" title={title}>
      <Icon size={13} className="text-white/40" />
      <input
        type="number"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full h-7 text-xs text-center bg-black/40 border border-white/10 rounded-md text-white/90 focus:border-orange-500/50 outline-none"
      />
    </div>
  )
}

// ─── Toggle Button ─────────────────────────────────────────────────

function ToolbarButton({
  active,
  onClick,
  title,
  children,
}: {
  active: boolean
  onClick: () => void
  title: string
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      className={cn(
        'flex h-8 w-8 items-center justify-center rounded-lg transition-all text-xs font-bold',
        active
          ? 'bg-orange-500/20 text-orange-400 border border-orange-500/40'
          : 'bg-white/[0.04] text-white/50 border border-white/[0.06] hover:bg-white/[0.08] hover:text-white/70',
      )}
    >
      {children}
    </button>
  )
}

// ─── Main Component ────────────────────────────────────────────────

interface TextTypographySectionProps {
  layer: KonvaTextLayer
  availableFontFamilies: string[]
  onUpdate: (updater: (layer: KonvaTextLayer) => KonvaTextLayer) => void
}

export function TextTypographySection({
  layer,
  availableFontFamilies,
  onUpdate,
}: TextTypographySectionProps) {
  const style = layer.textStyle ?? {}

  const fontWeight = style.fontWeight ?? 'normal'
  const fontStyle = style.fontStyle ?? 'normal'
  const fontSize = style.fontSize ?? 32
  const lineHeight = style.lineHeight ?? 1.2
  const letterSpacing = style.letterSpacing ?? 0
  const align = style.align ?? 'left'
  const verticalAlign = style.verticalAlign ?? 'top'
  const textTransform = style.textTransform ?? 'none'
  const underline = style.underline ?? false
  const strikethrough = style.strikethrough ?? false

  const isBold = fontWeight === 'bold' || fontWeight === '700' || fontWeight === '800' || fontWeight === '900'
  const isItalic = fontStyle === 'italic'

  const updateStyle = (updates: Partial<KonvaTextLayer['textStyle']>) => {
    onUpdate((l) => ({
      ...l,
      textStyle: { ...l.textStyle, ...updates },
    }))
  }

  const weightOptions = [
    { label: 'Thin', value: '100' },
    { label: 'Extra Light', value: '200' },
    { label: 'Light', value: '300' },
    { label: 'Regular', value: 'normal' },
    { label: 'Medium', value: '500' },
    { label: 'Semi Bold', value: '600' },
    { label: 'Bold', value: 'bold' },
    { label: 'Extra Bold', value: '800' },
    { label: 'Black', value: '900' },
  ]

  return (
    <div className="space-y-3">
      {/* Font Family + Weight row */}
      <div className="grid grid-cols-5 gap-2">
        <div className="col-span-3">
          <select
            value={style.fontFamily ?? ''}
            onChange={(e) => updateStyle({ fontFamily: e.target.value })}
            className="w-full h-8 text-xs bg-black/40 border border-white/10 rounded-lg text-white/90 px-2 focus:border-orange-500/50 outline-none truncate"
          >
            <option value="">Fonte...</option>
            {availableFontFamilies.map((f) => (
              <option key={f} value={f}>{f}</option>
            ))}
          </select>
        </div>
        <div className="col-span-2">
          <select
            value={fontWeight}
            onChange={(e) => updateStyle({ fontWeight: e.target.value })}
            className="w-full h-8 text-xs bg-black/40 border border-white/10 rounded-lg text-white/90 px-2 focus:border-orange-500/50 outline-none"
          >
            {weightOptions.map((opt) => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Font Size, Line Height, Letter Spacing row */}
      <div className="grid grid-cols-3 gap-2">
        <CompactNumberInput
          icon={CaseSensitive}
          value={fontSize}
          min={8}
          max={400}
          step={1}
          onChange={(v) => updateStyle({
            fontSize: v,
            maxFontSize:
              (style.overflowBehavior ?? 'clip') === 'autoScale'
                ? Math.max(v, style.maxFontSize ?? v)
                : style.maxFontSize,
          })}
          title="Tamanho da fonte (px)"
        />
        <CompactNumberInput
          icon={Minus}
          value={lineHeight}
          min={0.5}
          max={3}
          step={0.05}
          onChange={(v) => updateStyle({ lineHeight: v })}
          title="Altura da linha"
        />
        <CompactNumberInput
          icon={ArrowDownFromLine}
          value={letterSpacing}
          min={-20}
          max={100}
          step={0.5}
          onChange={(v) => updateStyle({ letterSpacing: v })}
          title="Espacamento entre letras"
        />
      </div>

      {/* Formatting toolbar: B I U S | AA Aa aa */}
      <div className="flex items-center gap-1">
        <div className="flex items-center gap-1">
          <ToolbarButton
            active={isBold}
            onClick={() => updateStyle({ fontWeight: isBold ? 'normal' : 'bold' })}
            title="Negrito"
          >
            <Bold size={14} />
          </ToolbarButton>
          <ToolbarButton
            active={isItalic}
            onClick={() => updateStyle({ fontStyle: isItalic ? 'normal' : 'italic' })}
            title="Italico"
          >
            <Italic size={14} />
          </ToolbarButton>
          <ToolbarButton
            active={underline}
            onClick={() => updateStyle({ underline: !underline })}
            title="Sublinhado"
          >
            <Underline size={14} />
          </ToolbarButton>
          <ToolbarButton
            active={strikethrough}
            onClick={() => updateStyle({ strikethrough: !strikethrough })}
            title="Tachado"
          >
            <Strikethrough size={14} />
          </ToolbarButton>
        </div>

        <div className="w-px h-6 bg-white/10 mx-1" />

        {/* Text Transform */}
        <div className="flex items-center gap-1">
          <ToolbarButton
            active={textTransform === 'uppercase'}
            onClick={() => updateStyle({ textTransform: textTransform === 'uppercase' ? 'none' : 'uppercase' })}
            title="MAIUSCULAS"
          >
            <CaseUpper size={14} />
          </ToolbarButton>
          <ToolbarButton
            active={textTransform === 'capitalize'}
            onClick={() => updateStyle({ textTransform: textTransform === 'capitalize' ? 'none' : 'capitalize' })}
            title="Capitalize"
          >
            <CaseSensitive size={14} />
          </ToolbarButton>
          <ToolbarButton
            active={textTransform === 'lowercase'}
            onClick={() => updateStyle({ textTransform: textTransform === 'lowercase' ? 'none' : 'lowercase' })}
            title="minusculas"
          >
            <CaseLower size={14} />
          </ToolbarButton>
        </div>
      </div>

      {/* Alignment row: H align | V align */}
      <div className="flex items-center gap-1">
        <div className="flex items-center gap-1">
          {([
            { value: 'left', icon: AlignLeft, title: 'Esquerda' },
            { value: 'center', icon: AlignCenter, title: 'Centro' },
            { value: 'right', icon: AlignRight, title: 'Direita' },
            { value: 'justify', icon: AlignJustify, title: 'Justificado' },
          ] as const).map(({ value, icon: AlignIcon, title }) => (
            <ToolbarButton
              key={value}
              active={align === value}
              onClick={() => updateStyle({ align: value })}
              title={title}
            >
              <AlignIcon size={14} />
            </ToolbarButton>
          ))}
        </div>

        <div className="w-px h-6 bg-white/10 mx-1" />

        <div className="flex items-center gap-1">
          {([
            { value: 'top', icon: ArrowUpFromLine, title: 'Topo' },
            { value: 'middle', icon: Minus, title: 'Meio' },
            { value: 'bottom', icon: ArrowDownFromLine, title: 'Base' },
          ] as const).map(({ value, icon: VIcon, title }) => (
            <ToolbarButton
              key={value}
              active={verticalAlign === value}
              onClick={() => updateStyle({ verticalAlign: value })}
              title={title}
            >
              <VIcon size={14} />
            </ToolbarButton>
          ))}
        </div>
      </div>
    </div>
  )
}
