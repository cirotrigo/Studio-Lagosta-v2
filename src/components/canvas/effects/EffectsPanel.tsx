"use client"

import * as React from 'react'
import Konva from 'konva'
import { X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { BlurControl } from './BlurControl'
import { StrokeControl } from './StrokeControl'
import { ShadowControl } from './ShadowControl'
import { BackgroundControl } from './BackgroundControl'
import { CurvedTextControl } from './CurvedTextControl'
import {
  EffectsManager,
  DEFAULT_EFFECTS_CONFIG,
  type TextEffectsConfig,
  type BlurEffectConfig,
  type StrokeEffectConfig,
  type ShadowEffectConfig,
  type BackgroundEffectConfig,
  type CurvedTextEffectConfig,
} from '@/lib/konva/effects'

interface EffectsPanelProps {
  selectedNode: Konva.Text | Konva.TextPath | null
  layer: Konva.Layer | null
  onClose: () => void
  onEffectChange?: (node: Konva.Text | Konva.TextPath) => void
}

/**
 * Effects Panel - Main panel for managing text effects
 *
 * Features:
 * - Blur effect with intensity control
 * - Curved text with curvature slider
 * - Text stroke (outline) with color and width
 * - Background with color and padding
 * - Shadow with color, blur, offset, and opacity
 */
export function EffectsPanel({
  selectedNode,
  layer,
  onClose,
  onEffectChange
}: EffectsPanelProps) {
  console.log('[EffectsPanel] Component rendered')

  const [effectsConfig, setEffectsConfig] = React.useState<TextEffectsConfig>(
    DEFAULT_EFFECTS_CONFIG
  )

  // Load effects from selected node
  React.useEffect(() => {
    console.log('[EffectsPanel] Selected node changed:', selectedNode?.getClassName())
    if (selectedNode) {
      const config = EffectsManager.getEffects(selectedNode)
      console.log('[EffectsPanel] Loaded config:', config)
      setEffectsConfig(config)
    }
  }, [selectedNode])

  // Debug: Log props recebidas
  React.useEffect(() => {
    console.log('[EffectsPanel] Props:', {
      hasSelectedNode: !!selectedNode,
      hasLayer: !!layer,
      nodeType: selectedNode?.getClassName(),
    })
  }, [selectedNode, layer])

  // Apply effect changes to the node
  const applyEffect = React.useCallback(
    (newConfig: TextEffectsConfig) => {
      if (!selectedNode || !layer) return

      const updatedNode = EffectsManager.applyEffects(selectedNode, newConfig, layer)

      if (onEffectChange && updatedNode) {
        onEffectChange(updatedNode)
      }
    },
    [selectedNode, layer, onEffectChange]
  )

  // Handler for blur effect changes
  const handleBlurChange = (blurConfig: BlurEffectConfig) => {
    const newConfig = { ...effectsConfig, blur: blurConfig }
    setEffectsConfig(newConfig)
    applyEffect(newConfig)
  }

  // Handler for stroke effect changes
  const handleStrokeChange = (strokeConfig: StrokeEffectConfig) => {
    const newConfig = { ...effectsConfig, stroke: strokeConfig }
    setEffectsConfig(newConfig)
    applyEffect(newConfig)
  }

  // Handler for shadow effect changes
  const handleShadowChange = (shadowConfig: ShadowEffectConfig) => {
    const newConfig = { ...effectsConfig, shadow: shadowConfig }
    setEffectsConfig(newConfig)
    applyEffect(newConfig)
  }

  // Handler for background effect changes
  const handleBackgroundChange = (backgroundConfig: BackgroundEffectConfig) => {
    const newConfig = { ...effectsConfig, background: backgroundConfig }
    setEffectsConfig(newConfig)
    applyEffect(newConfig)
  }

  // Handler for curved text effect changes
  const handleCurvedChange = (curvedConfig: CurvedTextEffectConfig) => {
    const newConfig = { ...effectsConfig, curved: curvedConfig }
    setEffectsConfig(newConfig)
    applyEffect(newConfig)
  }

  if (!selectedNode) {
    return (
      <div className="w-80 h-full bg-background border-l flex flex-col">
        <div className="flex items-center justify-between p-4 border-b">
          <h2 className="text-lg font-semibold">Effects</h2>
          <Button variant="ghost" size="icon" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        </div>
        <div className="flex-1 flex items-center justify-center p-4">
          <p className="text-sm text-muted-foreground text-center">
            Select a text layer to apply effects
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="w-80 h-full bg-background border-l flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b">
        <h2 className="text-lg font-semibold">Effects</h2>
        <Button variant="ghost" size="icon" onClick={onClose}>
          <X className="h-4 w-4" />
        </Button>
      </div>

      {/* Effects Controls */}
      <ScrollArea className="flex-1">
        <div className="p-4 space-y-4">
          {/* Blur Effect */}
          <BlurControl
            config={effectsConfig.blur || DEFAULT_EFFECTS_CONFIG.blur!}
            onChange={handleBlurChange}
          />

          {/* Curved Text Effect */}
          <CurvedTextControl
            config={effectsConfig.curved || DEFAULT_EFFECTS_CONFIG.curved!}
            onChange={handleCurvedChange}
          />

          {/* Text Stroke Effect */}
          <StrokeControl
            config={effectsConfig.stroke || DEFAULT_EFFECTS_CONFIG.stroke!}
            onChange={handleStrokeChange}
          />

          {/* Background Effect */}
          <BackgroundControl
            config={effectsConfig.background || DEFAULT_EFFECTS_CONFIG.background!}
            onChange={handleBackgroundChange}
          />

          {/* Shadow Effect */}
          <ShadowControl
            config={effectsConfig.shadow || DEFAULT_EFFECTS_CONFIG.shadow!}
            onChange={handleShadowChange}
          />
        </div>
      </ScrollArea>
    </div>
  )
}
