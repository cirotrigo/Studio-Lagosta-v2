import { useState, useMemo } from 'react'
import { Sparkles, AlertCircle, ChevronDown, ChevronUp } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { cn } from '@/lib/utils'
import {
  parsePromptVariables,
  validatePromptVariables,
} from '../utils/prompt-parser'
import { calculateCredits, type AIImageModel, type ImageResolution } from '@/lib/queue/types'

interface PromptInputProps {
  value: string
  onChange: (value: string) => void
  model: AIImageModel
  resolution: ImageResolution
  disabled?: boolean
  onImprovePrompt?: () => void
  isImproving?: boolean
}

export default function PromptInput({
  value,
  onChange,
  model,
  resolution,
  disabled = false,
  onImprovePrompt,
  isImproving = false,
}: PromptInputProps) {
  const [showPreview, setShowPreview] = useState(false)

  const parsed = useMemo(() => parsePromptVariables(value), [value])
  const validation = useMemo(() => validatePromptVariables(value), [value])
  const creditsPerImage = useMemo(
    () => calculateCredits(model, resolution),
    [model, resolution]
  )
  const totalCredits = creditsPerImage * parsed.combinations

  const hasVariables = parsed.hasVariables && parsed.combinations > 1

  return (
    <div className="space-y-3">
      {/* Main Input */}
      <div className="relative">
        <textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          disabled={disabled}
          placeholder="Descreva a imagem que voce quer criar... Use {opcao1, opcao2} para variacoes"
          className={cn(
            'w-full min-h-[120px] p-4 pr-12 rounded-2xl resize-none',
            'bg-white/[0.03] border border-white/[0.08]',
            'text-white placeholder:text-white/30',
            'focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary/50',
            'transition-all duration-200',
            disabled && 'opacity-50 cursor-not-allowed'
          )}
        />

        {/* Improve Prompt Button */}
        {onImprovePrompt && value.length > 10 && (
          <button
            type="button"
            onClick={onImprovePrompt}
            disabled={disabled || isImproving}
            className={cn(
              'absolute right-3 bottom-3 p-2 rounded-xl',
              'bg-primary/20 hover:bg-primary/30 text-primary',
              'transition-all duration-200',
              'disabled:opacity-50 disabled:cursor-not-allowed'
            )}
            title="Melhorar prompt com IA"
          >
            <Sparkles size={18} className={isImproving ? 'animate-pulse' : ''} />
          </button>
        )}
      </div>

      {/* Validation Error */}
      <AnimatePresence>
        {!validation.isValid && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="flex items-center gap-2 text-sm text-red-400"
          >
            <AlertCircle size={14} />
            <span>{validation.error}</span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Variables Preview */}
      <AnimatePresence>
        {hasVariables && validation.isValid && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="rounded-xl border border-white/[0.08] bg-white/[0.02] overflow-hidden"
          >
            {/* Header */}
            <button
              type="button"
              onClick={() => setShowPreview(!showPreview)}
              className="w-full flex items-center justify-between p-3 hover:bg-white/[0.02] transition-colors"
            >
              <div className="flex items-center gap-2 text-sm">
                <span className="text-white/70">
                  {parsed.combinations} variacoes serao geradas
                </span>
                {parsed.exceedsLimit && (
                  <span className="px-1.5 py-0.5 rounded bg-yellow-500/20 text-yellow-400 text-xs">
                    Limite: 20
                  </span>
                )}
              </div>
              <div className="flex items-center gap-3">
                <span className="text-sm text-white/50">
                  ~{totalCredits} creditos
                </span>
                {showPreview ? (
                  <ChevronUp size={16} className="text-white/50" />
                ) : (
                  <ChevronDown size={16} className="text-white/50" />
                )}
              </div>
            </button>

            {/* Preview List */}
            <AnimatePresence>
              {showPreview && (
                <motion.div
                  initial={{ height: 0 }}
                  animate={{ height: 'auto' }}
                  exit={{ height: 0 }}
                  className="overflow-hidden"
                >
                  <div className="border-t border-white/[0.06] p-3 space-y-2 max-h-[200px] overflow-y-auto">
                    {parsed.expandedPrompts.slice(0, 20).map((prompt, index) => (
                      <div
                        key={index}
                        className="flex items-start gap-2 text-sm"
                      >
                        <span className="shrink-0 w-5 h-5 flex items-center justify-center rounded-full bg-white/[0.06] text-white/50 text-xs">
                          {index + 1}
                        </span>
                        <span className="text-white/70 line-clamp-2">
                          {prompt}
                        </span>
                      </div>
                    ))}
                    {parsed.combinations > 20 && (
                      <div className="text-xs text-white/40 text-center pt-2">
                        ... e mais {parsed.combinations - 20} variacoes
                      </div>
                    )}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Credits Info (single image) */}
      {!hasVariables && value.length > 0 && (
        <div className="text-sm text-white/50">
          ~{creditsPerImage} creditos por imagem
        </div>
      )}
    </div>
  )
}
