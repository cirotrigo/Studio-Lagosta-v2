"use client"

import * as React from 'react'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { BrandColorSwatches } from './brand-color-swatches'

/** Hex que o canvas aceita: #rgb, #rgba, #rrggbb, #rrggbbaa. */
const HEX = /^#(?:[0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/i

export function isValidHexColor(value: string): boolean {
  return HEX.test(value.trim())
}

/**
 * Normaliza o que a pessoa digitou. Aceita sem `#` ("fff", "008C44") porque é
 * como a cor costuma vir colada de outro lugar. Devolve `null` quando não dá
 * para salvar — aí o campo não commita.
 */
function normalizeHex(raw: string): string | null {
  const trimmed = raw.trim()
  const candidate = trimmed.startsWith('#') ? trimmed : `#${trimmed}`
  return HEX.test(candidate) ? candidate : null
}

/** O `<input type="color">` só aceita #rrggbb — qualquer outra forma o zera. */
function toPickerValue(value: string): string {
  const hex = normalizeHex(value)
  if (!hex) return '#000000'
  const body = hex.slice(1)
  if (body.length === 6 || body.length === 8) return `#${body.slice(0, 6)}`
  return `#${body
    .slice(0, 3)
    .split('')
    .map((c) => c + c)
    .join('')}`
}

interface HexColorFieldProps {
  value: string
  onChange: (hex: string) => void
  label?: string
  id?: string
  /** Tamanho dos controles — o painel de efeitos usa campos menores. */
  size?: 'sm' | 'md'
  showSwatches?: boolean
  pickerLabel?: string
}

/**
 * Campo de cor com validação.
 *
 * O campo de texto era cru: qualquer coisa digitada ia para a camada. Um `#`
 * com sete dígitos (`#0000000`) é ignorado em silêncio pelo navegador, então o
 * editor continuava bonito, mas o canvas do napi-rs LANÇA — a arte inteira
 * falhava no render server-side, sem sombra e sem post. Aqui a digitação é
 * livre (senão não dá para apagar um caractere), mas só uma cor válida é
 * commitada, e o que sobrar inválido é revertido ao sair do campo.
 */
export function HexColorField({
  value,
  onChange,
  label,
  id,
  size = 'md',
  showSwatches = true,
  pickerLabel,
}: HexColorFieldProps) {
  const [draft, setDraft] = React.useState(value)
  const [editing, setEditing] = React.useState(false)

  // Enquanto a pessoa digita, o draft manda; fora disso o valor da camada
  // manda (undo, seleção de outra camada, swatch, picker).
  React.useEffect(() => {
    if (!editing) setDraft(value)
  }, [value, editing])

  const handleText = React.useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      const next = event.target.value
      setDraft(next)
      const hex = normalizeHex(next)
      if (hex) onChange(hex)
    },
    [onChange],
  )

  const handleBlur = React.useCallback(() => {
    setEditing(false)
    if (!normalizeHex(draft)) setDraft(value)
  }, [draft, value])

  const invalid = draft.trim().length > 0 && !normalizeHex(draft)
  const inputHeight = size === 'sm' ? 'h-7 text-xs' : 'h-8 text-xs'
  const pickerSize = size === 'sm' ? 'h-7 w-7' : 'h-8 w-8'

  return (
    <div className="space-y-1">
      {label && (
        <Label htmlFor={id} className={size === 'sm' ? 'text-[9px]' : 'text-[10px]'}>
          {label}
        </Label>
      )}
      <div className="flex items-center gap-2">
        <Input
          id={id}
          type="text"
          spellCheck={false}
          className={`${inputHeight} flex-1 ${invalid ? 'border-destructive focus-visible:ring-destructive' : ''}`}
          value={draft}
          onChange={handleText}
          onFocus={() => setEditing(true)}
          onBlur={handleBlur}
          aria-invalid={invalid || undefined}
        />
        <input
          aria-label={pickerLabel ?? label ?? 'Selecionar cor'}
          type="color"
          className={`${pickerSize} rounded border border-border/30`}
          value={toPickerValue(value)}
          onChange={(event) => onChange(event.target.value)}
        />
      </div>
      {invalid && (
        <p className="text-[9px] text-destructive">Cor inválida — use #RGB, #RRGGBB ou #RRGGBBAA.</p>
      )}
      {showSwatches && <BrandColorSwatches value={value} onSelect={onChange} />}
    </div>
  )
}
