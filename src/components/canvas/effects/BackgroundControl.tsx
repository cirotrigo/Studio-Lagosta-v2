"use client"

import * as React from 'react'
import { Label } from '@/components/ui/label'
import { Slider } from '@/components/ui/slider'
import { Switch } from '@/components/ui/switch'
import { ColorPicker } from './ColorPicker'
import type { BackgroundEffectConfig } from '@/lib/konva/effects'

interface BackgroundControlProps {
  config: BackgroundEffectConfig
  onChange: (config: BackgroundEffectConfig) => void
}

/**
 * Control component for background effect
 * Provides toggle, background color picker, and padding slider
 */
export function BackgroundControl({ config, onChange }: BackgroundControlProps) {
  const [padding, setPadding] = React.useState(config.padding)

  // Debounce padding changes
  React.useEffect(() => {
    const timeout = setTimeout(() => {
      if (padding !== config.padding) {
        onChange({ ...config, padding })
      }
    }, 100)

    return () => clearTimeout(timeout)
  }, [padding, config, onChange])

  React.useEffect(() => {
    setPadding(config.padding)
  }, [config.padding])

  const handleToggle = React.useCallback((enabled: boolean) => {
    onChange({ ...config, enabled })
  }, [config, onChange])

  const handleColorChange = React.useCallback((backgroundColor: string) => {
    onChange({ ...config, backgroundColor })
  }, [config, onChange])

  const handleSliderChange = React.useCallback((values: number[]) => {
    setPadding(values[0])
  }, [])

  return (
    <div className="space-y-4 p-4 border rounded-lg">
      <div className="flex items-center justify-between">
        <Label className="text-sm font-medium">Background</Label>
        <Switch checked={config.enabled} onCheckedChange={handleToggle} />
      </div>

      {config.enabled && (
        <div className="space-y-4">
          <ColorPicker
            label="Background Color"
            value={config.backgroundColor}
            onChange={handleColorChange}
          />

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-xs text-muted-foreground">Padding</Label>
              <span className="text-xs font-mono text-muted-foreground">{padding.toFixed(0)}px</span>
            </div>
            <Slider
              value={[padding]}
              onValueChange={handleSliderChange}
              min={0}
              max={20}
              step={1}
              className="w-full"
            />
          </div>
        </div>
      )}
    </div>
  )
}
