import { useState } from 'react'
import { Sparkles, Loader2, Check, AlertCircle } from 'lucide-react'
import { cn } from '@/lib/utils'
import { PostType, CAPTION_TONES, CaptionTone } from '@/lib/constants'
import { api } from '@/lib/api-client'

interface CaptionEditorProps {
  value: string
  onChange: (value: string) => void
  maxLength: number
  projectId: number
  postType: PostType
}

interface GenerateCaptionResponse {
  caption: string
  hashtags?: string[]
  knowledgeUsed: boolean
  tone: string
}

export default function CaptionEditor({
  value,
  onChange,
  maxLength,
  projectId,
  postType,
}: CaptionEditorProps) {
  const [showAIModal, setShowAIModal] = useState(false)
  const [aiPrompt, setAiPrompt] = useState('')
  const [aiTone, setAiTone] = useState<CaptionTone>('casual')
  const [includeHashtags, setIncludeHashtags] = useState(postType !== 'STORY')
  const [isGenerating, setIsGenerating] = useState(false)
  const [generatedCaption, setGeneratedCaption] = useState('')
  const [generatedHashtags, setGeneratedHashtags] = useState<string[]>([])
  const [knowledgeUsed, setKnowledgeUsed] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleOpenModal = () => {
    setShowAIModal(true)
    setError(null)
    setIncludeHashtags(postType !== 'STORY')
  }

  const handleCloseModal = () => {
    setShowAIModal(false)
    setGeneratedCaption('')
    setGeneratedHashtags([])
    setError(null)
  }

  const handleGenerate = async () => {
    if (!aiPrompt.trim()) return

    setIsGenerating(true)
    setGeneratedCaption('')
    setGeneratedHashtags([])
    setKnowledgeUsed(false)
    setError(null)

    try {
      const response = await api.post<GenerateCaptionResponse>('/api/tools/generate-caption', {
        projectId,
        prompt: aiPrompt.trim(),
        postType,
        tone: aiTone,
        includeHashtags,
      })

      setGeneratedCaption(response.caption)
      setGeneratedHashtags(response.hashtags || [])
      setKnowledgeUsed(response.knowledgeUsed)
    } catch (err) {
      console.error('Error generating caption:', err)
      setError(err instanceof Error ? err.message : 'Erro ao gerar legenda. Tente novamente.')
    } finally {
      setIsGenerating(false)
    }
  }

  const handleUseCaption = () => {
    let finalCaption = generatedCaption
    if (generatedHashtags.length > 0) {
      finalCaption += '\n\n' + generatedHashtags.join(' ')
    }
    onChange(finalCaption)
    handleCloseModal()
    setAiPrompt('')
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
        onClick={handleOpenModal}
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
          <div className="w-full max-w-lg rounded-lg border border-border bg-[#0a0a0a] p-6">
            <h3 className="mb-4 text-lg font-semibold text-text">
              Gerar Legenda com IA
            </h3>

            {/* Prompt input */}
            <div className="mb-4 space-y-2">
              <label className="block text-sm font-medium text-text">
                O que você quer na legenda?
              </label>
              <textarea
                value={aiPrompt}
                onChange={(e) => setAiPrompt(e.target.value.slice(0, 500))}
                placeholder="Ex: Apresentar o menu da parrilla TERO e indicar o T-bone como sugestão"
                rows={3}
                className={cn(
                  'w-full resize-none rounded-lg border border-border bg-input p-3 text-text',
                  'placeholder:text-text-subtle',
                  'focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20'
                )}
              />
              <p className="text-xs text-text-subtle">{aiPrompt.length}/500</p>
            </div>

            {/* Tone selector */}
            <div className="mb-4 space-y-2">
              <label className="block text-sm font-medium text-text">Tom de voz</label>
              <div className="grid grid-cols-3 gap-2">
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

            {/* Hashtags toggle */}
            <div className="mb-4 flex items-center gap-2">
              <button
                type="button"
                onClick={() => setIncludeHashtags(!includeHashtags)}
                className={cn(
                  'flex h-5 w-9 items-center rounded-full p-0.5 transition-colors',
                  includeHashtags ? 'bg-primary' : 'bg-border'
                )}
              >
                <span
                  className={cn(
                    'h-4 w-4 rounded-full bg-white transition-transform',
                    includeHashtags ? 'translate-x-4' : 'translate-x-0'
                  )}
                />
              </button>
              <span className="text-sm text-text-muted">Incluir hashtags (máx. 3)</span>
            </div>

            {/* Error message */}
            {error && (
              <div className="mb-4 flex items-center gap-2 rounded-lg border border-error/30 bg-error/10 p-3">
                <AlertCircle size={16} className="text-error" />
                <p className="text-sm text-error">{error}</p>
              </div>
            )}

            {/* Generated caption */}
            {generatedCaption && (
              <div className="mb-4 space-y-2">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-text">Legenda gerada</span>
                  {knowledgeUsed && (
                    <span className="flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-xs text-primary">
                      <Check size={12} />
                      Contexto do projeto aplicado
                    </span>
                  )}
                </div>
                <div className="rounded-lg border border-border bg-input p-3">
                  <p className="whitespace-pre-wrap text-sm text-text">
                    {generatedCaption}
                  </p>
                  {generatedHashtags.length > 0 && (
                    <p className="mt-2 text-sm text-primary">
                      {generatedHashtags.join(' ')}
                    </p>
                  )}
                </div>
              </div>
            )}

            {/* Actions */}
            <div className="flex gap-2">
              <button
                type="button"
                onClick={handleCloseModal}
                className="flex-1 rounded-lg border border-border px-4 py-2 text-sm text-text-muted hover:bg-input"
              >
                Cancelar
              </button>

              {generatedCaption && !isGenerating ? (
                <>
                  <button
                    type="button"
                    onClick={handleGenerate}
                    disabled={!aiPrompt.trim()}
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
                  disabled={!aiPrompt.trim() || isGenerating}
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
