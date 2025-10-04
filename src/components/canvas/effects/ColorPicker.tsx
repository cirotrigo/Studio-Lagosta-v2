"use client"

import * as React from 'react'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'

interface ColorPickerProps {
  label: string
  value: string
  onChange: (color: string) => void
  disabled?: boolean
}

/**
 * Simple color picker component with text input and native color picker
 */
export function ColorPicker({ label, value, onChange, disabled }: ColorPickerProps) {
  const [localValue, setLocalValue] = React.useState(value)

  React.useEffect(() => {
    setLocalValue(value)
  }, [value])

  const handleColorChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newColor = e.target.value
    setLocalValue(newColor)
    onChange(newColor)
  }

  const handleTextChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newColor = e.target.value
    setLocalValue(newColor)

    // Validate hex color before calling onChange
    if (/^#[0-9A-F]{6}$/i.test(newColor)) {
      onChange(newColor)
    }
  }

  return (
    <div className="space-y-2">
      <Label className="text-sm font-medium">{label}</Label>
      <div className="flex gap-2">
        <Input
          type="color"
          value={localValue}
          onChange={handleColorChange}
          disabled={disabled}
          className="w-16 h-9 p-1 cursor-pointer"
        />
        <Input
          type="text"
          value={localValue}
          onChange={handleTextChange}
          disabled={disabled}
          className="flex-1 font-mono text-sm"
          placeholder="#000000"
          maxLength={7}
        />
      </div>
    </div>
  )
}
