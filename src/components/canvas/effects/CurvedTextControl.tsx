"use client"

import * as React from 'react'
import { Label } from '@/components/ui/label'
import { Slider } from '@/components/ui/slider'
import { Switch } from '@/components/ui/switch'
import type { CurvedTextEffectConfig } from '@/lib/konva/effects'

interface CurvedTextControlProps {
  config: CurvedTextEffectConfig
  onChange: (config: CurvedTextEffectConfig) => void
}

/**
 * Control component for curved text effect
 * Provides toggle and curvature slider
 */
export function CurvedTextControl({ config, onChange }: CurvedTextControlProps) {
  const [curvature, setCurvature] = React.useState(config.curvature)

  // Debounce curvature changes
  React.useEffect(() => {
    const timeout = setTimeout(() => {
      if (curvature !== config.curvature) {
        onChange({ ...config, curvature })
      }
    }, 100)

    return () => clearTimeout(timeout)
  }, [curvature])

  React.useEffect(() => {
    setCurvature(config.curvature)
  }, [config.curvature])

  const handleToggle = (enabled: boolean) => {
    onChange({ ...config, enabled })
  }

  const handleSliderChange = (values: number[]) => {
    setCurvature(values[0])
  }

  return (
    <div className="space-y-4 p-4 border rounded-lg">
      <div className="flex items-center justify-between">
        <Label className="text-sm font-medium">Curved Text</Label>
        <Switch checked={config.enabled} onCheckedChange={handleToggle} />
      </div>

      {config.enabled && (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label className="text-xs text-muted-foreground">Curvature</Label>
            <span className="text-xs font-mono text-muted-foreground">{curvature.toFixed(0)}°</span>
          </div>
          <Slider
            value={[curvature]}
            onValueChange={handleSliderChange}
            min={-180}
            max={180}
            step={5}
            className="w-full"
          />
          <p className="text-xs text-muted-foreground">
            Negative values curve downward, positive values curve upward
          </p>
        </div>
      )}
    </div>
  )
}
