"use client"

import * as React from 'react'
import { Label } from '@/components/ui/label'
import { Slider } from '@/components/ui/slider'
import { Switch } from '@/components/ui/switch'
import { ColorPicker } from './ColorPicker'
import type { StrokeEffectConfig } from '@/lib/konva/effects'

interface StrokeControlProps {
  config: StrokeEffectConfig
  onChange: (config: StrokeEffectConfig) => void
}

/**
 * Control component for text stroke (outline) effect
 * Provides toggle, color picker, and width slider
 */
export function StrokeControl({ config, onChange }: StrokeControlProps) {
  const [strokeWidth, setStrokeWidth] = React.useState(config.strokeWidth)

  // Debounce stroke width changes
  React.useEffect(() => {
    const timeout = setTimeout(() => {
      if (strokeWidth !== config.strokeWidth) {
        onChange({ ...config, strokeWidth })
      }
    }, 100)

    return () => clearTimeout(timeout)
  }, [strokeWidth, config, onChange])

  React.useEffect(() => {
    setStrokeWidth(config.strokeWidth)
  }, [config.strokeWidth])

  const handleToggle = React.useCallback((enabled: boolean) => {
    onChange({ ...config, enabled })
  }, [config, onChange])

  const handleColorChange = React.useCallback((strokeColor: string) => {
    onChange({ ...config, strokeColor })
  }, [config, onChange])

  const handleSliderChange = React.useCallback((values: number[]) => {
    setStrokeWidth(values[0])
  }, [])

  return (
    <div className="space-y-4 p-4 border rounded-lg">
      <div className="flex items-center justify-between">
        <Label className="text-sm font-medium">Text Stroke</Label>
        <Switch checked={config.enabled} onCheckedChange={handleToggle} />
      </div>

      {config.enabled && (
        <div className="space-y-4">
          <ColorPicker
            label="Stroke Color"
            value={config.strokeColor}
            onChange={handleColorChange}
          />

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-xs text-muted-foreground">Width</Label>
              <span className="text-xs font-mono text-muted-foreground">{strokeWidth.toFixed(1)}px</span>
            </div>
            <Slider
              value={[strokeWidth]}
              onValueChange={handleSliderChange}
              min={0}
              max={10}
              step={0.5}
              className="w-full"
            />
          </div>
        </div>
      )}
    </div>
  )
}
