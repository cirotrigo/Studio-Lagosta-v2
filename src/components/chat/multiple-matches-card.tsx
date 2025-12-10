'use client'

import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Info, X } from 'lucide-react'
import type { TrainingPreview } from '@/lib/knowledge/training-pipeline'
import type { KnowledgeCategory } from '@prisma/client'

const CATEGORY_LABELS: Record<KnowledgeCategory, string> = {
  ESTABELECIMENTO_INFO: 'Informações Gerais',
  HORARIOS: 'Horários',
  CARDAPIO: 'Cardápio',
  DELIVERY: 'Delivery',
  POLITICAS: 'Políticas',
  TOM_DE_VOZ: 'Tom de Voz',
  CAMPANHAS: 'Campanhas',
  DIFERENCIAIS: 'Diferenciais',
  FAQ: 'FAQ',
}

const OPERATION_CONFIG = {
  CREATE: { emoji: '📝', label: 'Criar' },
  UPDATE: { emoji: '✏️', label: 'Atualizar' },
  REPLACE: { emoji: '🔄', label: 'Substituir' },
  DELETE: { emoji: '🗑️', label: 'Deletar' },
}

interface MultipleMatchesCardProps {
  preview: TrainingPreview
  onSelectMatch: (targetId: string) => void
  onCancel: () => void
}

export function MultipleMatchesCard({ preview, onSelectMatch, onCancel }: MultipleMatchesCardProps) {
  const config = OPERATION_CONFIG[preview.operation]

  if (!preview.matches || preview.matches.length === 0) {
    return null
  }

  return (
    <Card className="border-2 border-blue-500/40 bg-blue-50 dark:bg-blue-950/20">
      <CardHeader>
        <div className="flex items-center gap-3">
          <Info className="h-6 w-6 text-blue-600" />
          <CardTitle className="text-lg">Múltiplas Entradas Encontradas</CardTitle>
        </div>
        <p className="text-sm text-muted-foreground mt-2">
          Para qual delas você quer aplicar a operação{' '}
          <span className="font-semibold">
            {config.emoji} {config.label}
          </span>
          ?
        </p>
      </CardHeader>

      <CardContent className="space-y-3 max-h-[50vh] overflow-y-auto">
        {preview.matches.map((match, index) => {
          const scorePercent = Math.round(match.score * 100)

          return (
            <button
              key={match.entryId}
              type="button"
              onClick={() => onSelectMatch(match.entryId)}
              className="w-full rounded-lg border bg-white p-4 text-left transition hover:border-blue-500 hover:shadow-md dark:bg-slate-950"
            >
              <div className="flex items-start justify-between gap-2 mb-2">
                <div className="flex items-center gap-2">
                  <span className="text-lg font-bold text-blue-600 dark:text-blue-400">
                    {index + 1}
                  </span>
                  <p className="font-semibold">{match.title}</p>
                </div>
                <div className="flex flex-col items-end gap-1">
                  <Badge variant="outline" className="text-[11px] font-mono">
                    {scorePercent}% similar
                  </Badge>
                  <Badge variant="secondary" className="text-[10px]">
                    {CATEGORY_LABELS[match.category]}
                  </Badge>
                </div>
              </div>

              <p className="text-sm text-muted-foreground line-clamp-3 mb-2">{match.content}</p>

              <p className="text-[10px] uppercase text-blue-600 dark:text-blue-400 font-medium">
                Clique para selecionar esta entrada
              </p>
            </button>
          )
        })}
      </CardContent>

      <CardFooter className="flex flex-col gap-2">
        <p className="text-xs text-muted-foreground w-full text-center">
          💬 Ou digite o <strong>número da opção</strong> (1-{preview.matches.length}) na mensagem
        </p>
        <div className="flex gap-2 w-full">
          <Button onClick={onCancel} variant="outline" className="flex-1 gap-2">
            <X className="h-4 w-4" />
            Cancelar
          </Button>
        </div>
      </CardFooter>
    </Card>
  )
}
