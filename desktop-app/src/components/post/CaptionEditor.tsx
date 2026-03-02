import { useState } from 'react'
import { Sparkles, Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { PostType, CAPTION_TONES, CaptionTone } from '@/lib/constants'
import { api } from '@/lib/api-client'

interface CaptionEditorProps {
  value: string
  onChange: (value: string) => void
  maxLength: number
  projectName: string
  postType: PostType
}

export default function CaptionEditor({
  value,
  onChange,
  maxLength,
  projectName,
  postType,
}: CaptionEditorProps) {
  const [showAIModal, setShowAIModal] = useState(false)
  const [aiContext, setAiContext] = useState('')
  const [aiTone, setAiTone] = useState<CaptionTone>('casual')
  const [isGenerating, setIsGenerating] = useState(false)
  const [generatedCaption, setGeneratedCaption] = useState('')

  const handleGenerate = async () => {
    if (!aiContext.trim()) return

    setIsGenerating(true)
    setGeneratedCaption('')

    try {
      // Use streaming API
      const stream = api.stream('/api/tools/generate-caption', {
        context: aiContext.trim(),
        postType,
        tone: aiTone,
        projectName,
      })

      let fullText = ''
      for await (const chunk of stream) {
        fullText += chunk
        setGeneratedCaption(fullText)
      }
    } catch (error) {
      console.error('Error generating caption:', error)
      setGeneratedCaption('Erro ao gerar legenda. Tente novamente.')
    } finally {
      setIsGenerating(false)
    }
  }

  const handleUseCaption = () => {
    onChange(generatedCaption)
    setShowAIModal(false)
    setGeneratedCaption('')
    setAiContext('')
  }

  return (
    <div className="space-y-2">
      {/* Textarea */}
      <div className="relative">
        <textarea
          value={value}
          onChange={(e) => onChange(e.target.value.slice(0, maxLength))}
          placeholder="Escreva sua legenda..."
          rows={5}
          className={cn(
            'w-full resize-none rounded-lg border border-border bg-input p-3 text-text',
            'placeholder:text-text-subtle',
            'focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20'
          )}
        />

        {/* Character count */}
        <div className="absolute bottom-2 right-2 text-xs text-text-subtle">
          {value.length}/{maxLength}
        </div>
      </div>

      {/* AI button */}
      <button
        type="button"
        onClick={() => setShowAIModal(true)}
        className={cn(
          'flex items-center gap-2 rounded-lg border border-border bg-input px-3 py-2 text-sm',
          'text-text-muted hover:border-primary/50 hover:text-primary',
          'transition-all duration-200'
        )}
      >
        <Sparkles size={16} />
        Gerar com IA
      </button>

      {/* AI Modal */}
      {showAIModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-lg rounded-lg border border-border bg-card p-6">
            <h3 className="mb-4 text-lg font-semibold text-text">
              Gerar Legenda com IA
            </h3>

            {/* Context input */}
            <div className="mb-4 space-y-2">
              <label className="block text-sm font-medium text-text">
                Contexto do post
              </label>
              <textarea
                value={aiContext}
                onChange={(e) => setAiContext(e.target.value.slice(0, 500))}
                placeholder="Ex: Novo prato do cardápio, promoção de fim de semana..."
                rows={3}
                className={cn(
                  'w-full resize-none rounded-lg border border-border bg-input p-3 text-text',
                  'placeholder:text-text-subtle',
                  'focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20'
                )}
              />
              <p className="text-xs text-text-subtle">{aiContext.length}/500</p>
            </div>

            {/* Tone selector */}
            <div className="mb-4 space-y-2">
              <label className="block text-sm font-medium text-text">Tom</label>
              <div className="grid grid-cols-2 gap-2">
                {(Object.keys(CAPTION_TONES) as CaptionTone[]).map((tone) => (
                  <button
                    key={tone}
                    type="button"
                    onClick={() => setAiTone(tone)}
                    className={cn(
                      'rounded-lg border px-3 py-2 text-sm',
                      'transition-all duration-200',
                      aiTone === tone
                        ? 'border-primary bg-primary/10 text-primary'
                        : 'border-border text-text-muted hover:border-primary/50'
                    )}
                  >
                    {CAPTION_TONES[tone]}
                  </button>
                ))}
              </div>
            </div>

            {/* Generated caption */}
            {generatedCaption && (
              <div className="mb-4 rounded-lg border border-border bg-input p-3">
                <p className="whitespace-pre-wrap text-sm text-text">
                  {generatedCaption}
                </p>
              </div>
            )}

            {/* Actions */}
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => {
                  setShowAIModal(false)
                  setGeneratedCaption('')
                }}
                className="flex-1 rounded-lg border border-border px-4 py-2 text-sm text-text-muted hover:bg-input"
              >
                Cancelar
              </button>

              {generatedCaption && !isGenerating ? (
                <>
                  <button
                    type="button"
                    onClick={handleGenerate}
                    disabled={!aiContext.trim()}
                    className="flex-1 rounded-lg border border-border px-4 py-2 text-sm text-text-muted hover:bg-input disabled:opacity-50"
                  >
                    Regenerar
                  </button>
                  <button
                    type="button"
                    onClick={handleUseCaption}
                    className="flex-1 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary-hover"
                  >
                    Usar legenda
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  onClick={handleGenerate}
                  disabled={!aiContext.trim() || isGenerating}
                  className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary-hover disabled:opacity-50"
                >
                  {isGenerating ? (
                    <>
                      <Loader2 size={16} className="animate-spin" />
                      Gerando...
                    </>
                  ) : (
                    <>
                      <Sparkles size={16} />
                      Gerar
                    </>
                  )}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
