'use client'

import { useState, useEffect } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Loader2, Palette, RotateCcw, Save, Wand2 } from 'lucide-react'
import { api } from '@/lib/api-client'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { DEFAULT_ART_DIRECTION } from '@/lib/ai/art-direction'
import { toast } from 'sonner'

interface ArtImprovementPromptConfigProps {
  projectId: number
  initialPrompt?: string | null
}

const MAX_CHARS = 10000

export function ArtImprovementPromptConfig({
  projectId,
  initialPrompt,
}: ArtImprovementPromptConfigProps) {
  const [prompt, setPrompt] = useState(initialPrompt || '')
  const [hasChanges, setHasChanges] = useState(false)
  const queryClient = useQueryClient()

  useEffect(() => {
    setPrompt(initialPrompt || '')
  }, [initialPrompt])

  useEffect(() => {
    setHasChanges(prompt !== (initialPrompt || ''))
  }, [prompt, initialPrompt])

  const saveMutation = useMutation({
    mutationFn: async (newPrompt: string) => {
      return api.patch(`/api/projects/${projectId}/settings`, {
        artImprovementPrompt: newPrompt || null,
      })
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['project', projectId] })
      toast.success('Direção de arte salva com sucesso!')
      setHasChanges(false)
    },
    onError: (error: any) => {
      toast.error(error?.message || 'Erro ao salvar direção de arte')
    },
  })

  const handleSave = () => {
    if (prompt.length > MAX_CHARS) {
      toast.error(`A direção de arte deve ter no máximo ${MAX_CHARS} caracteres`)
      return
    }
    saveMutation.mutate(prompt)
  }

  const handleReset = () => {
    setPrompt('')
    toast.info('Voltará a usar a direção padrão. Clique em Salvar para confirmar.')
  }

  const handleUseDefault = () => {
    setPrompt(DEFAULT_ART_DIRECTION)
    toast.info('Direção padrão carregada. Edite o que quiser e clique em Salvar.')
  }

  const charCount = prompt.length
  const charCountColor =
    charCount > MAX_CHARS
      ? 'text-red-500'
      : charCount > MAX_CHARS * 0.9
      ? 'text-yellow-500'
      : 'text-muted-foreground'

  return (
    <Card className="p-6">
      <div className="space-y-4">
        <div className="flex items-start justify-between">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <Palette className="h-5 w-5 text-primary" />
              <h3 className="text-lg font-semibold">Direção de arte da melhoria com IA</h3>
            </div>
            <p className="text-sm text-muted-foreground">
              Define como a IA redesenha a diagramação quando você melhora um criativo deste
              projeto. Deixe em branco para usar a direção padrão, em que a fotografia é a
              protagonista e o texto ocupa no máximo um quarto da arte. Preencha quando este
              cliente precisar de regras diferentes.
            </p>
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="art-direction">Direção de arte</Label>
          <Textarea
            id="art-direction"
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder="Em branco = direção padrão. Clique em “Carregar direção padrão” abaixo para partir dela e ajustar."
            className="min-h-[240px] max-h-[600px] resize-y font-mono text-sm"
            disabled={saveMutation.isPending}
          />

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

        {!prompt && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleUseDefault}
            className="w-full"
          >
            <Wand2 className="h-4 w-4 mr-2" />
            Carregar direção padrão como base
          </Button>
        )}

        <div className="rounded-md bg-blue-50 dark:bg-blue-950/30 p-3 text-xs text-blue-900 dark:text-blue-100">
          <p className="font-medium mb-1">💡 Como isso é usado</p>
          <ul className="list-disc list-inside space-y-0.5 ml-1">
            <li>
              Este texto substitui apenas a direção de arte. O mapa das imagens de referência, a
              paleta da marca e o pedido feito na hora continuam sendo montados pelo sistema.
            </li>
            <li>
              A recomendação é começar sem nada aqui e só escrever regras quando um resultado
              concreto pedir — por exemplo, travar o tamanho do título ou proibir marca-texto.
            </li>
            <li>Escreva em blocos curtos com rótulos entre colchetes, como no padrão.</li>
          </ul>
        </div>

        <div className="flex items-center gap-3 pt-2">
          <Button
            type="button"
            variant="outline"
            onClick={handleReset}
            disabled={!prompt || saveMutation.isPending}
          >
            <RotateCcw className="h-4 w-4 mr-2" />
            Voltar ao padrão
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
                Salvar direção de arte
              </>
            )}
          </Button>
        </div>
      </div>
    </Card>
  )
}
