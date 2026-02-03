'use client'

import * as React from 'react'
import Image from 'next/image'
import { Loader2, AlertCircle, CheckCircle2, Sparkles } from 'lucide-react'
import { motion } from 'framer-motion'
import { cn } from '@/lib/utils'
import type { PendingGeneration } from './ai-edit-modal'

interface PendingGenerationCardProps {
  generation: PendingGeneration
  onRemove?: (id: string) => void
}

export function PendingGenerationCard({ generation, onRemove }: PendingGenerationCardProps) {
  const isProcessing = generation.status === 'pending' || generation.status === 'processing'
  const isCompleted = generation.status === 'completed'
  const isError = generation.status === 'error'

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.9 }}
      className={cn(
        'group relative flex flex-col rounded-xl overflow-hidden bg-card border transition-all w-full',
        isProcessing && 'border-primary/50 animate-pulse',
        isCompleted && 'border-green-500/50',
        isError && 'border-destructive/50'
      )}
    >
      <div className="relative w-full overflow-hidden bg-muted/40" style={{ aspectRatio: 0.8 }}>
        {/* Source image as background with blur */}
        {generation.sourceImage.thumbnailUrl && (
          <Image
            src={generation.sourceImage.thumbnailUrl}
            alt="Gerando..."
            fill
            className={cn(
              'object-cover transition-all duration-500',
              isProcessing && 'blur-sm scale-105'
            )}
            unoptimized
          />
        )}

        {/* Overlay */}
        <div
          className={cn(
            'absolute inset-0 flex flex-col items-center justify-center gap-3 p-4 text-center transition-colors',
            isProcessing && 'bg-black/60',
            isCompleted && 'bg-green-500/20',
            isError && 'bg-destructive/20'
          )}
        >
          {isProcessing && (
            <>
              <div className="relative">
                <Loader2 className="h-10 w-10 text-primary animate-spin" />
                <Sparkles className="absolute -top-1 -right-1 h-4 w-4 text-yellow-400 animate-pulse" />
              </div>
              <div className="space-y-1">
                <p className="text-sm font-medium text-white">Gerando com IA...</p>
                <p className="text-xs text-white/70 line-clamp-2">{generation.prompt}</p>
              </div>
            </>
          )}

          {isCompleted && (
            <>
              <CheckCircle2 className="h-10 w-10 text-green-500" />
              <p className="text-sm font-medium text-white">Imagem gerada!</p>
            </>
          )}

          {isError && (
            <>
              <AlertCircle className="h-10 w-10 text-destructive" />
              <div className="space-y-1">
                <p className="text-sm font-medium text-white">Erro na geração</p>
                <p className="text-xs text-white/70 line-clamp-2">{generation.error}</p>
              </div>
              {onRemove && (
                <button
                  onClick={() => onRemove(generation.id)}
                  className="mt-2 px-3 py-1 text-xs bg-white/20 hover:bg-white/30 rounded-full transition-colors"
                >
                  Remover
                </button>
              )}
            </>
          )}
        </div>

        {/* Progress indicator */}
        {isProcessing && (
          <div className="absolute bottom-0 left-0 right-0 h-1 bg-black/30">
            <motion.div
              className="h-full bg-primary"
              initial={{ width: '0%' }}
              animate={{ width: '100%' }}
              transition={{ duration: 30, ease: 'linear' }}
            />
          </div>
        )}
      </div>

      {/* Info bar */}
      <div className="absolute bottom-0 left-0 right-0 p-2 bg-black/60 backdrop-blur-md border-t border-white/10">
        <p className="text-xs text-white/80 truncate">
          {isProcessing && 'Processando...'}
          {isCompleted && generation.resultImage?.name}
          {isError && 'Falha na geração'}
        </p>
      </div>
    </motion.div>
  )
}
