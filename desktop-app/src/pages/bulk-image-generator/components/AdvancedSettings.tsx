import { useState } from 'react'
import { ChevronDown, AlertTriangle } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { cn } from '@/lib/utils'
import type { AIImageModel, AspectRatio, ImageResolution } from '@/lib/queue/types'
import { AI_IMAGE_MODEL_CONFIGS } from '@/lib/queue/types'

interface AdvancedSettingsProps {
  model: AIImageModel
  onModelChange: (model: AIImageModel) => void
  aspectRatio: AspectRatio
  onAspectRatioChange: (ratio: AspectRatio) => void
  resolution: ImageResolution
  onResolutionChange: (resolution: ImageResolution) => void
}

const aspectRatios: { value: AspectRatio; label: string }[] = [
  { value: '1:1', label: '1:1' },
  { value: '16:9', label: '16:9' },
  { value: '9:16', label: '9:16' },
  { value: '4:5', label: '4:5' },
]

const resolutions: { value: ImageResolution; label: string; warning?: string }[] = [
  { value: '1K', label: '1K' },
  { value: '2K', label: '2K' },
  { value: '4K', label: '4K', warning: '3x mais creditos' },
]

const models = Object.values(AI_IMAGE_MODEL_CONFIGS)

export default function AdvancedSettings({
  model,
  onModelChange,
  aspectRatio,
  onAspectRatioChange,
  resolution,
  onResolutionChange,
}: AdvancedSettingsProps) {
  const [isOpen, setIsOpen] = useState(false)

  const currentModel = AI_IMAGE_MODEL_CONFIGS[model]

  return (
    <div className="rounded-xl border border-white/[0.08] overflow-hidden">
      {/* Header */}
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center justify-between p-4 hover:bg-white/[0.02] transition-colors"
      >
        <span className="text-sm font-medium text-white">
          Configuracoes Avancadas
        </span>
        <ChevronDown
          size={18}
          className={cn(
            'text-white/50 transition-transform duration-200',
            isOpen && 'rotate-180'
          )}
        />
      </button>

      {/* Content */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ height: 0 }}
            animate={{ height: 'auto' }}
            exit={{ height: 0 }}
            className="overflow-hidden"
          >
            <div className="p-4 pt-0 space-y-6 border-t border-white/[0.06]">
              {/* Model Selection */}
              <div className="space-y-3">
                <label className="text-sm text-white/70">Modelo</label>
                <div className="grid grid-cols-2 gap-2">
                  {models.map((m) => (
                    <button
                      key={m.id}
                      type="button"
                      onClick={() => onModelChange(m.id)}
                      className={cn(
                        'p-3 rounded-xl border text-left transition-all',
                        model === m.id
                          ? 'border-primary bg-primary/10'
                          : 'border-white/[0.08] hover:border-white/20'
                      )}
                    >
                      <div className="text-sm font-medium text-white">
                        {m.displayName}
                      </div>
                      <div className="text-xs text-white/50 mt-1">
                        {m.description}
                      </div>
                    </button>
                  ))}
                </div>
              </div>

              {/* Aspect Ratio */}
              <div className="space-y-3">
                <label className="text-sm text-white/70">Proporcao</label>
                <div className="flex gap-2">
                  {aspectRatios.map((ratio) => (
                    <button
                      key={ratio.value}
                      type="button"
                      onClick={() => onAspectRatioChange(ratio.value)}
                      className={cn(
                        'flex-1 py-2 px-3 rounded-xl text-sm font-medium transition-all',
                        aspectRatio === ratio.value
                          ? 'bg-primary text-white'
                          : 'bg-white/[0.03] text-white/70 hover:bg-white/[0.06]'
                      )}
                    >
                      {ratio.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Resolution */}
              <div className="space-y-3">
                <label className="text-sm text-white/70">Resolucao</label>
                <div className="flex gap-2">
                  {resolutions.map((res) => {
                    const isDisabled =
                      !currentModel.supportsResolution && res.value !== '1K'

                    return (
                      <button
                        key={res.value}
                        type="button"
                        onClick={() => !isDisabled && onResolutionChange(res.value)}
                        disabled={isDisabled}
                        className={cn(
                          'flex-1 py-2 px-3 rounded-xl text-sm font-medium transition-all',
                          resolution === res.value && !isDisabled
                            ? 'bg-primary text-white'
                            : 'bg-white/[0.03] text-white/70 hover:bg-white/[0.06]',
                          isDisabled && 'opacity-30 cursor-not-allowed'
                        )}
                      >
                        {res.label}
                      </button>
                    )
                  })}
                </div>

                {/* Resolution Warning */}
                {resolution === '4K' && currentModel.supportsResolution && (
                  <div className="flex items-center gap-2 text-xs text-yellow-400">
                    <AlertTriangle size={14} />
                    <span>4K consome 3x mais creditos</span>
                  </div>
                )}

                {!currentModel.supportsResolution && (
                  <p className="text-xs text-white/40">
                    Este modelo so suporta resolucao 1K
                  </p>
                )}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
