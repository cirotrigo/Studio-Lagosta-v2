"use client"

import * as React from 'react'
import { Label } from '@/components/ui/label'
import { Slider } from '@/components/ui/slider'
import { Switch } from '@/components/ui/switch'
import type { BlurEffectConfig } from '@/lib/konva/effects'

interface BlurControlProps {
  config: BlurEffectConfig
  onChange: (config: BlurEffectConfig) => void
}

/**
 * Control component for blur effect
 * Provides toggle and intensity slider
 */
export function BlurControl({ config, onChange }: BlurControlProps) {
  const [blurRadius, setBlurRadius] = React.useState(config.blurRadius)

  // Debounce blur radius changes
  React.useEffect(() => {
    const timeout = setTimeout(() => {
      if (blurRadius !== config.blurRadius) {
        onChange({ ...config, blurRadius })
      }
    }, 100)

    return () => clearTimeout(timeout)
  }, [blurRadius, config, onChange])

  React.useEffect(() => {
    setBlurRadius(config.blurRadius)
  }, [config.blurRadius])

  const handleToggle = React.useCallback((enabled: boolean) => {
    onChange({ ...config, enabled })
  }, [config, onChange])

  const handleSliderChange = React.useCallback((values: number[]) => {
    setBlurRadius(values[0])
  }, [])

  return (
    <div className="space-y-4 p-4 border rounded-lg">
      <div className="flex items-center justify-between">
        <Label className="text-sm font-medium">Blur</Label>
        <Switch checked={config.enabled} onCheckedChange={handleToggle} />
      </div>

      {config.enabled && (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label className="text-xs text-muted-foreground">Intensity</Label>
            <span className="text-xs font-mono text-muted-foreground">{blurRadius.toFixed(0)}</span>
          </div>
          <Slider
            value={[blurRadius]}
            onValueChange={handleSliderChange}
            min={0}
            max={20}
            step={0.5}
            className="w-full"
          />
        </div>
      )}
    </div>
  )
}
