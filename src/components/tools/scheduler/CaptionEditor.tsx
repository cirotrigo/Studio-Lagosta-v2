"use client"

import * as React from 'react'
import { cn } from '@/lib/utils'
import { Sparkles, Loader2, X, Copy } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Textarea } from '@/components/ui/textarea'

interface CaptionEditorProps {
  value: string
  onChange: (v: string) => void
  projectName?: string
}

const TONES = [
  { key: 'professional', label: 'Profissional' },
  { key: 'casual', label: 'Casual' },
  { key: 'fun', label: 'Divertido' },
  { key: 'inspirational', label: 'Inspiracional' },
]

export function CaptionEditor({ value, onChange, projectName }: CaptionEditorProps) {
  const [aiOpen, setAiOpen] = React.useState(false)
  const charCount = value.length
  const isNearLimit = charCount > 2000
  const isOverLimit = charCount > 2200

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <label className="text-xs font-medium text-[#A1A1AA]">Legenda</label>
        <span
          className={cn(
            'text-[10px] font-medium',
            isOverLimit ? 'text-red-400' : isNearLimit ? 'text-amber-400' : 'text-[#71717A]'
          )}
        >
          {charCount}/2200
        </span>
      </div>

      <Textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Escreva a legenda do post..."
        className="min-h-[140px] bg-[#1a1a1a] border-[#27272A] text-[#FAFAFA] placeholder:text-[#3f3f46] text-sm resize-y focus:border-amber-500/50 focus:ring-0"
        maxLength={2200}
      />

      <Dialog open={aiOpen} onOpenChange={setAiOpen}>
        <DialogTrigger asChild>
          <button className="flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium text-amber-400 bg-amber-500/10 hover:bg-amber-500/20 transition-colors duration-200">
            <Sparkles className="h-3.5 w-3.5" />
            Gerar com IA
          </button>
        </DialogTrigger>
        <DialogContent className="bg-[#161616] border-[#27272A] max-w-lg">
          <DialogHeader>
            <DialogTitle className="text-[#FAFAFA] flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-amber-500" />
              Gerar legenda com IA
            </DialogTitle>
          </DialogHeader>
          <AICaptionForm
            projectName={projectName}
            onUse={(caption) => {
              onChange(caption)
              setAiOpen(false)
            }}
          />
        </DialogContent>
      </Dialog>
    </div>
  )
}

function AICaptionForm({
  projectName,
  onUse,
}: {
  projectName?: string
  onUse: (caption: string) => void
}) {
  const [context, setContext] = React.useState('')
  const [tone, setTone] = React.useState('casual')
  const [isGenerating, setIsGenerating] = React.useState(false)
  const [generatedText, setGeneratedText] = React.useState('')
  const [error, setError] = React.useState<string | null>(null)

  const handleGenerate = async () => {
    if (!context.trim()) return
    setIsGenerating(true)
    setGeneratedText('')
    setError(null)

    try {
      const response = await fetch('/api/tools/generate-caption', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          context: context.trim(),
          postType: 'POST',
          tone,
          projectName,
        }),
      })

      if (!response.ok) {
        throw new Error('Erro ao gerar legenda')
      }

      const reader = response.body?.getReader()
      if (!reader) throw new Error('No stream available')

      const decoder = new TextDecoder()
      let accumulated = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        const chunk = decoder.decode(value, { stream: true })
        accumulated += chunk
        setGeneratedText(accumulated)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao gerar legenda')
    } finally {
      setIsGenerating(false)
    }
  }

  return (
    <div className="space-y-4">
      {/* Context input */}
      <div className="space-y-1.5">
        <label className="text-xs font-medium text-[#A1A1AA]">
          Descreva o contexto do post
        </label>
        <Textarea
          value={context}
          onChange={(e) => setContext(e.target.value)}
          placeholder="Ex: promoção de rodízio no sábado, novo prato do menu..."
          className="min-h-[80px] bg-[#1a1a1a] border-[#27272A] text-[#FAFAFA] placeholder:text-[#3f3f46] text-sm resize-none focus:border-amber-500/50 focus:ring-0"
          maxLength={500}
        />
      </div>

      {/* Tone selector */}
      <div className="space-y-1.5">
        <label className="text-xs font-medium text-[#A1A1AA]">Tom da legenda</label>
        <div className="flex gap-1.5 flex-wrap">
          {TONES.map((t) => (
            <button
              key={t.key}
              onClick={() => setTone(t.key)}
              className={cn(
                'rounded-full px-3 py-1 text-xs font-medium transition-colors duration-200',
                tone === t.key
                  ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
                  : 'bg-[#1a1a1a] text-[#71717A] border border-[#27272A] hover:text-[#A1A1AA]'
              )}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* Generate button */}
      <button
        onClick={handleGenerate}
        disabled={!context.trim() || isGenerating}
        className="w-full flex items-center justify-center gap-2 rounded-lg bg-amber-500 px-4 py-2.5 text-sm font-semibold text-black hover:bg-amber-400 disabled:opacity-50 disabled:cursor-not-allowed transition-colors duration-200"
      >
        {isGenerating ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <Sparkles className="h-4 w-4" />
        )}
        {isGenerating ? 'Gerando...' : 'Gerar legenda'}
      </button>

      {/* Error */}
      {error && (
        <p className="text-xs text-red-400">{error}</p>
      )}

      {/* Generated text */}
      {generatedText && (
        <div className="space-y-2">
          <div className="rounded-lg border border-[#27272A] bg-[#1a1a1a] p-3 max-h-[200px] overflow-y-auto">
            <p className="text-sm text-[#FAFAFA] whitespace-pre-wrap leading-relaxed">
              {generatedText}
            </p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => onUse(generatedText)}
              className="flex-1 flex items-center justify-center gap-1.5 rounded-lg bg-amber-500/20 px-3 py-2 text-xs font-semibold text-amber-400 hover:bg-amber-500/30 transition-colors duration-200"
            >
              <Copy className="h-3 w-3" />
              Usar esta legenda
            </button>
            <button
              onClick={handleGenerate}
              disabled={isGenerating}
              className="flex items-center justify-center gap-1.5 rounded-lg bg-[#1a1a1a] border border-[#27272A] px-3 py-2 text-xs font-medium text-[#A1A1AA] hover:text-[#FAFAFA] hover:border-[#3f3f46] disabled:opacity-50 transition-colors duration-200"
            >
              <Sparkles className="h-3 w-3" />
              Regenerar
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
