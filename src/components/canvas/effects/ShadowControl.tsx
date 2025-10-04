"use client"

import * as React from 'react'
import { Label } from '@/components/ui/label'
import { Slider } from '@/components/ui/slider'
import { Switch } from '@/components/ui/switch'
import { ColorPicker } from './ColorPicker'
import type { ShadowEffectConfig } from '@/lib/konva/effects'

interface ShadowControlProps {
  config: ShadowEffectConfig
  onChange: (config: ShadowEffectConfig) => void
}

/**
 * Control component for shadow effect
 * Provides toggle, color, blur, offset, and opacity controls
 */
export function ShadowControl({ config, onChange }: ShadowControlProps) {
  const [shadowBlur, setShadowBlur] = React.useState(config.shadowBlur)
  const [shadowOffsetX, setShadowOffsetX] = React.useState(config.shadowOffsetX)
  const [shadowOffsetY, setShadowOffsetY] = React.useState(config.shadowOffsetY)
  const [shadowOpacity, setShadowOpacity] = React.useState(config.shadowOpacity)

  // Debounce shadow changes
  React.useEffect(() => {
    const timeout = setTimeout(() => {
      if (
        shadowBlur !== config.shadowBlur ||
        shadowOffsetX !== config.shadowOffsetX ||
        shadowOffsetY !== config.shadowOffsetY ||
        shadowOpacity !== config.shadowOpacity
      ) {
        onChange({
          ...config,
          shadowBlur,
          shadowOffsetX,
          shadowOffsetY,
          shadowOpacity,
        })
      }
    }, 100)

    return () => clearTimeout(timeout)
  }, [shadowBlur, shadowOffsetX, shadowOffsetY, shadowOpacity])

  React.useEffect(() => {
    setShadowBlur(config.shadowBlur)
    setShadowOffsetX(config.shadowOffsetX)
    setShadowOffsetY(config.shadowOffsetY)
    setShadowOpacity(config.shadowOpacity)
  }, [config.shadowBlur, config.shadowOffsetX, config.shadowOffsetY, config.shadowOpacity])

  const handleToggle = (enabled: boolean) => {
    onChange({ ...config, enabled })
  }

  const handleColorChange = (shadowColor: string) => {
    onChange({ ...config, shadowColor })
  }

  return (
    <div className="space-y-4 p-4 border rounded-lg">
      <div className="flex items-center justify-between">
        <Label className="text-sm font-medium">Shadow</Label>
        <Switch checked={config.enabled} onCheckedChange={handleToggle} />
      </div>

      {config.enabled && (
        <div className="space-y-4">
          <ColorPicker
            label="Shadow Color"
            value={config.shadowColor}
            onChange={handleColorChange}
          />

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-xs text-muted-foreground">Blur</Label>
              <span className="text-xs font-mono text-muted-foreground">{shadowBlur.toFixed(0)}</span>
            </div>
            <Slider
              value={[shadowBlur]}
              onValueChange={(values) => setShadowBlur(values[0])}
              min={0}
              max={20}
              step={0.5}
              className="w-full"
            />
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-xs text-muted-foreground">Offset X</Label>
              <span className="text-xs font-mono text-muted-foreground">{shadowOffsetX.toFixed(0)}px</span>
            </div>
            <Slider
              value={[shadowOffsetX]}
              onValueChange={(values) => setShadowOffsetX(values[0])}
              min={-50}
              max={50}
              step={1}
              className="w-full"
            />
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-xs text-muted-foreground">Offset Y</Label>
              <span className="text-xs font-mono text-muted-foreground">{shadowOffsetY.toFixed(0)}px</span>
            </div>
            <Slider
              value={[shadowOffsetY]}
              onValueChange={(values) => setShadowOffsetY(values[0])}
              min={-50}
              max={50}
              step={1}
              className="w-full"
            />
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-xs text-muted-foreground">Opacity</Label>
              <span className="text-xs font-mono text-muted-foreground">{shadowOpacity.toFixed(2)}</span>
            </div>
            <Slider
              value={[shadowOpacity]}
              onValueChange={(values) => setShadowOpacity(values[0])}
              min={0}
              max={1}
              step={0.05}
              className="w-full"
            />
          </div>
        </div>
      )}
    </div>
  )
}
