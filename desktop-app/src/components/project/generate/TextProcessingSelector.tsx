import { cn } from '@/lib/utils'
import { TextProcessingMode } from '@/stores/generation.store'

interface TextProcessingSelectorProps {
  mode: TextProcessingMode
  onModeChange: (mode: TextProcessingMode) => void
  customPrompt: string
  onCustomPromptChange: (prompt: string) => void
}

interface ModeOption {
  value: TextProcessingMode
  label: string
  description: string
}

const MODE_OPTIONS: ModeOption[] = [
  {
    value: 'faithful',
    label: 'Texto fiel',
    description: 'Usa o texto exatamente como digitado',
  },
  {
    value: 'grammar_correct',
    label: 'Corrigir gramatica',
    description: 'Corrige ortografia e gramatica sem alterar significado',
  },
  {
    value: 'headline_detection',
    label: 'Detectar estrutura',
    description: 'IA identifica titulo, descricao, CTA no texto',
  },
  {
    value: 'generate_copy',
    label: 'Gerar copy',
    description: 'IA cria textos a partir do seu prompt',
  },
]

export default function TextProcessingSelector({
  mode,
  onModeChange,
  customPrompt,
  onCustomPromptChange,
}: TextProcessingSelectorProps) {
  return (
    <div className="space-y-3 rounded-xl border border-border bg-card/50 p-4">
      <h4 className="text-sm font-medium text-text">Processamento de texto</h4>
      <div className="grid grid-cols-2 gap-2">
        {MODE_OPTIONS.map((option) => (
          <button
            key={option.value}
            type="button"
            onClick={() => onModeChange(option.value)}
            className={cn(
              'flex flex-col items-start gap-0.5 rounded-lg border-2 px-3 py-2 text-left transition-all duration-200',
              mode === option.value
                ? 'border-primary bg-primary/10'
                : 'border-border bg-card hover:border-primary/30'
            )}
          >
            <span
              className={cn(
                'text-xs font-medium',
                mode === option.value ? 'text-primary' : 'text-text'
              )}
            >
              {option.label}
            </span>
            <span className="text-[10px] leading-tight text-text-subtle">
              {option.description}
            </span>
          </button>
        ))}
      </div>

      {mode === 'generate_copy' && (
        <div className="animate-in fade-in slide-in-from-top-2 duration-200">
          <label className="mb-1 block text-xs text-text-muted">
            Prompt para geracao de copy
          </label>
          <textarea
            value={customPrompt}
            onChange={(e) => onCustomPromptChange(e.target.value)}
            placeholder="Ex: Promocao de vinhos importados com desconto de 30%, tom sofisticado"
            rows={2}
            maxLength={500}
            className="w-full resize-none rounded-lg border border-border bg-input px-3 py-2 text-sm text-text placeholder:text-text-subtle focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
          />
          <span className="text-[10px] text-text-subtle">
            {customPrompt.length}/500
          </span>
        </div>
      )}
    </div>
  )
}
