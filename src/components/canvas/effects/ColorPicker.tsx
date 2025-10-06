"use client"

import * as React from 'react'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { useTemplateEditor } from '@/contexts/template-editor-context'

interface ColorPickerProps {
  label: string
  value: string
  onChange: (color: string) => void
  disabled?: boolean
}

interface BrandColor {
  id: number
  name: string
  hexCode: string
}

/**
 * Simple color picker component with text input and native color picker
 * Includes brand colors palette
 */
export function ColorPicker({ label, value, onChange, disabled }: ColorPickerProps) {
  const { projectId } = useTemplateEditor()
  const [localValue, setLocalValue] = React.useState(value)
  const [brandColors, setBrandColors] = React.useState<BrandColor[]>([])

  React.useEffect(() => {
    setLocalValue(value)
  }, [value])

  // Load brand colors
  React.useEffect(() => {
    if (!projectId) return

    fetch(`/api/projects/${projectId}/colors`)
      .then((res) => res.ok ? res.json() : [])
      .then((data) => setBrandColors(data))
      .catch(() => setBrandColors([]))
  }, [projectId])

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

  const handleBrandColorClick = (hexCode: string) => {
    setLocalValue(hexCode)
    onChange(hexCode)
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

      {/* Brand Colors - Discrete */}
      {brandColors.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {brandColors.map((color) => (
            <button
              key={color.id}
              type="button"
              onClick={() => handleBrandColorClick(color.hexCode)}
              disabled={disabled}
              className="group relative h-6 w-6 rounded border border-border transition hover:scale-110 hover:border-primary disabled:opacity-50 disabled:cursor-not-allowed"
              style={{ backgroundColor: color.hexCode }}
              title={`${color.name} (${color.hexCode})`}
            >
              {localValue.toUpperCase() === color.hexCode.toUpperCase() && (
                <div className="absolute inset-0 flex items-center justify-center">
                  <div className="h-1.5 w-1.5 rounded-full bg-white shadow-sm ring-1 ring-black/20" />
                </div>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
