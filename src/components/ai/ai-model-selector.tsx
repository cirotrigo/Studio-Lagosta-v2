'use client'

import { useState } from 'react'
import {
  type AIImageModel,
  type AIImageModelConfig,
  getAvailableModels,
  AI_IMAGE_MODELS,
} from '@/lib/ai/image-models-config'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Info, Sparkles, Zap, Crown, Table } from 'lucide-react'
import { AIModelsComparisonModal } from './ai-models-comparison-modal'

interface AIModelSelectorProps {
  value: AIImageModel
  onValueChange: (value: AIImageModel) => void
  disabled?: boolean
  filterByEditing?: boolean
}

export function AIModelSelector({ value, onValueChange, disabled, filterByEditing = false }: AIModelSelectorProps) {
  const availableModels = getAvailableModels().filter(model => {
    // Filtrar apenas modelos com capacidade de edição se solicitado
    if (filterByEditing) {
      return model.capabilities.supportsImageEditing === true
    }
    return true
  })
  const selectedModel = AI_IMAGE_MODELS[value]
  const [showComparison, setShowComparison] = useState(false)

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <label className="text-sm font-medium">Modelo de IA</label>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setShowComparison(true)}
          className="h-7 gap-1.5 text-xs"
        >
          <Table className="h-3.5 w-3.5" />
          Comparar
        </Button>
      </div>

      <Select value={value} onValueChange={onValueChange} disabled={disabled}>
        <SelectTrigger className="w-full">
          <SelectValue>
            <div className="flex items-center gap-1.5 overflow-hidden">
              {selectedModel.isRecommended && <Zap className="h-3.5 w-3.5 text-yellow-500 flex-shrink-0" />}
              {selectedModel.isNew && <Sparkles className="h-3.5 w-3.5 text-blue-500 flex-shrink-0" />}
              <span className="truncate">{selectedModel.displayName}</span>
              <span className="text-xs text-muted-foreground flex-shrink-0">
                ({selectedModel.pricing.baseCredits}c)
              </span>
            </div>
          </SelectValue>
        </SelectTrigger>
        <SelectContent>
          {availableModels.map((model) => (
            <SelectItem key={model.id} value={model.id}>
              <div className="flex items-center gap-2 min-w-0">
                {model.isRecommended && <Zap className="h-3.5 w-3.5 text-yellow-500 flex-shrink-0" />}
                {model.isNew && <Sparkles className="h-3.5 w-3.5 text-blue-500 flex-shrink-0" />}
                <span className="font-medium truncate">{model.displayName}</span>
                <span className="text-xs text-muted-foreground flex-shrink-0">
                  {model.pricing.baseCredits}c • ~{model.capabilities.averageSpeed}s
                </span>
              </div>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {/* Resumo compacto */}
      <div className="flex items-center justify-between text-xs text-muted-foreground px-1">
        <span className="truncate">{selectedModel.provider}</span>
        <span className="flex-shrink-0">
          Até {selectedModel.capabilities.maxReferenceImages || 0} refs
        </span>
      </div>

      <AIModelsComparisonModal open={showComparison} onOpenChange={setShowComparison} />
    </div>
  )
}

// Seletor de resolução (apenas para modelos que suportam)
interface ResolutionSelectorProps {
  model: AIImageModel
  value?: '1K' | '2K' | '4K'
  onValueChange: (value: '1K' | '2K' | '4K' | undefined) => void
  disabled?: boolean
}

export function ResolutionSelector({
  model,
  value,
  onValueChange,
  disabled,
}: ResolutionSelectorProps) {
  const modelConfig = AI_IMAGE_MODELS[model]

  // Apenas mostrar para modelos que suportam seleção de resolução
  if (!modelConfig.resolutions || modelConfig.resolutions.length === 0) {
    return null
  }

  const getCredits = (resolution: '1K' | '2K' | '4K') => {
    return modelConfig.pricing[`resolution${resolution}`] ?? modelConfig.pricing.baseCredits
  }

  return (
    <div className="space-y-2">
      <label className="text-sm font-medium">Resolução</label>
      <Select value={value ?? '2K'} onValueChange={onValueChange} disabled={disabled}>
        <SelectTrigger className="w-full">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {modelConfig.resolutions.map((resolution) => (
            <SelectItem key={resolution} value={resolution}>
              <div className="flex items-center justify-between gap-4">
                <span>{resolution}</span>
                {resolution === '4K' && <Crown className="h-3 w-3 text-yellow-500" />}
                <span className="text-xs text-muted-foreground">
                  ({getCredits(resolution)} créditos)
                </span>
              </div>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  )
}
