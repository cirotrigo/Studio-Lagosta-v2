'use client'

import { useState, useEffect } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Loader2, RotateCcw, Save, Sparkles } from 'lucide-react'
import { api } from '@/lib/api-client'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { toast } from 'sonner'

interface AIChatBehaviorConfigProps {
  projectId: number
  initialBehavior?: string | null
}

const MAX_CHARS = 10000

const EXAMPLE_BEHAVIOR = `Você é um profissional de marketing gaúcho, tchê!

Suas características:
- Tom de voz: Amigável e descontraído, com sotaque gaúcho
- Use expressões como "bah", "tri legal", "guri/guria", "tchê"
- Sempre inclua uma headline criativa e um CTA (call-to-action) claro
- Foco em engajamento e conversão

Ao criar conteúdo ou responder perguntas:
- Use linguagem adequada ao público gaúcho
- Aplique gatilhos mentais quando apropriado
- Seja direto e objetivo, mas mantenha o tom amigável
- Personalize com informações específicas do projeto

Evite:
- Linguagem muito formal ou corporativa
- Promessas exageradas ou sensacionalistas
- Conteúdo genérico sem personalidade`

export function AIChatBehaviorConfig({
  projectId,
  initialBehavior,
}: AIChatBehaviorConfigProps) {
  const [behavior, setBehavior] = useState(initialBehavior || '')
  const [hasChanges, setHasChanges] = useState(false)
  const queryClient = useQueryClient()

  useEffect(() => {
    setBehavior(initialBehavior || '')
  }, [initialBehavior])

  useEffect(() => {
    setHasChanges(behavior !== (initialBehavior || ''))
  }, [behavior, initialBehavior])

  const saveMutation = useMutation({
    mutationFn: async (newBehavior: string) => {
      return api.patch(`/api/projects/${projectId}/settings`, {
        aiChatBehavior: newBehavior || null,
      })
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['project', projectId] })
      toast.success('Comportamento do chat salvo com sucesso!')
      setHasChanges(false)
    },
    onError: (error: any) => {
      toast.error(error?.message || 'Erro ao salvar comportamento do chat')
    },
  })

  const handleSave = () => {
    if (behavior.length > MAX_CHARS) {
      toast.error(`O comportamento deve ter no máximo ${MAX_CHARS} caracteres`)
      return
    }
    saveMutation.mutate(behavior)
  }

  const handleReset = () => {
    setBehavior('')
    toast.info('Comportamento resetado. Clique em Salvar para confirmar.')
  }

  const handleUseExample = () => {
    setBehavior(EXAMPLE_BEHAVIOR)
    toast.info('Exemplo carregado. Edite conforme necessário e clique em Salvar.')
  }

  const charCount = behavior.length
  const charCountColor = charCount > MAX_CHARS
    ? 'text-red-500'
    : charCount > MAX_CHARS * 0.9
    ? 'text-yellow-500'
    : 'text-muted-foreground'

  return (
    <Card className="p-6">
      <div className="space-y-4">
        {/* Header */}
        <div className="flex items-start justify-between">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-primary" />
              <h3 className="text-lg font-semibold">Comportamento do Chat IA</h3>
            </div>
            <p className="text-sm text-muted-foreground">
              Defina como o assistente de IA deve se comportar ao responder perguntas sobre este projeto.
              O comportamento será aplicado em todas as conversas do chat.
            </p>
          </div>
        </div>

        {/* Textarea */}
        <div className="space-y-2">
          <Label htmlFor="ai-behavior">
            Instruções de Comportamento
          </Label>
          <Textarea
            id="ai-behavior"
            value={behavior}
            onChange={(e) => setBehavior(e.target.value)}
            placeholder="Ex: Você é um assistente de marketing especializado em criar conteúdo para redes sociais. Sempre inclua hashtags relevantes e CTAs claros..."
            className="min-h-[200px] max-h-[600px] resize-y font-mono text-sm"
            disabled={saveMutation.isPending}
          />

          {/* Character Counter */}
          <div className="flex items-center justify-between text-xs">
            <span className={charCountColor}>
              {charCount.toLocaleString()} / {MAX_CHARS.toLocaleString()} caracteres
            </span>
            {charCount > MAX_CHARS && (
              <span className="text-red-500 font-medium">
                Excedeu o limite em {(charCount - MAX_CHARS).toLocaleString()} caracteres
              </span>
            )}
          </div>
        </div>

        {/* Example Button */}
        {!behavior && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleUseExample}
            className="w-full"
          >
            <Sparkles className="h-4 w-4 mr-2" />
            Usar Exemplo (Marketing Gaúcho)
          </Button>
        )}

        {/* Info Box */}
        <div className="rounded-md bg-blue-50 dark:bg-blue-950/30 p-3 text-xs text-blue-900 dark:text-blue-100">
          <p className="font-medium mb-1">💡 Dicas para um bom comportamento:</p>
          <ul className="list-disc list-inside space-y-0.5 ml-1">
            <li>Seja específico sobre o tom de voz (formal, casual, técnico, etc.)</li>
            <li>Defina o público-alvo e contexto do negócio</li>
            <li>Liste o que fazer e o que evitar</li>
            <li>Inclua exemplos de expressões ou formatos desejados</li>
          </ul>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-3 pt-2">
          <Button
            type="button"
            variant="outline"
            onClick={handleReset}
            disabled={!behavior || saveMutation.isPending}
          >
            <RotateCcw className="h-4 w-4 mr-2" />
            Restaurar Padrão
          </Button>

          <Button
            type="button"
            onClick={handleSave}
            disabled={!hasChanges || saveMutation.isPending || charCount > MAX_CHARS}
            className="ml-auto"
          >
            {saveMutation.isPending ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Salvando...
              </>
            ) : (
              <>
                <Save className="h-4 w-4 mr-2" />
                Salvar Comportamento
              </>
            )}
          </Button>
        </div>
      </div>
    </Card>
  )
}
