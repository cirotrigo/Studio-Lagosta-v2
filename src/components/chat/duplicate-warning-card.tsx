'use client'

import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { AlertTriangle, Plus, Edit, X } from 'lucide-react'
import type { TrainingPreview } from '@/lib/knowledge/training-pipeline'

interface DuplicateWarningCardProps {
  preview: TrainingPreview
  onCreateNew: () => void
  onUpdateExisting: (targetId: string) => void
  onCancel: () => void
}

export function DuplicateWarningCard({
  preview,
  onCreateNew,
  onUpdateExisting,
  onCancel,
}: DuplicateWarningCardProps) {
  return (
    <Card className="border-2 border-amber-500/40 bg-amber-50 dark:bg-amber-950/20">
      <CardHeader>
        <div className="flex items-center gap-3">
          <AlertTriangle className="h-6 w-6 text-amber-600" />
          <CardTitle className="text-lg">Informação Similar Detectada</CardTitle>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        <div>
          <p className="text-sm font-semibold text-muted-foreground mb-1">Você está criando:</p>
          <div className="rounded border bg-white dark:bg-slate-950 p-3">
            <p className="font-medium">{preview.title}</p>
            <p className="mt-1 text-sm text-muted-foreground whitespace-pre-wrap">
              {preview.content}
            </p>
          </div>
        </div>

        {preview.matches && preview.matches.length > 0 && (
          <div>
            <p className="text-sm font-semibold text-muted-foreground mb-2">Já existe na base:</p>
            <div className="space-y-2">
              {preview.matches.map((match) => (
                <button
                  key={match.entryId}
                  type="button"
                  onClick={() => onUpdateExisting(match.entryId)}
                  className="w-full rounded border bg-white p-3 text-left transition hover:border-amber-500 dark:bg-slate-950"
                >
                  <div className="flex items-start justify-between gap-2">
                    <p className="font-medium">{match.title}</p>
                    <Badge variant="outline" className="text-[11px]">
                      {Math.round(match.score * 100)}% similar
                    </Badge>
                  </div>
                  <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{match.content}</p>
                  <p className="mt-1 text-[10px] uppercase text-muted-foreground">Clique para atualizar esta entrada</p>
                </button>
              ))}
            </div>
          </div>
        )}
      </CardContent>

      <CardFooter className="flex gap-2">
        <Button onClick={onCreateNew} variant="outline" className="flex-1 gap-2">
          <Plus className="h-4 w-4" />
          Criar Nova
        </Button>
        {preview.matches?.length === 1 && (
          <Button
            onClick={() => onUpdateExisting(preview.matches![0].entryId)}
            className="flex-1 gap-2"
          >
            <Edit className="h-4 w-4" />
            Atualizar Existente
          </Button>
        )}
        <Button onClick={onCancel} variant="ghost" className="gap-2">
          <X className="h-4 w-4" />
          Cancelar
        </Button>
      </CardFooter>
    </Card>
  )
}
