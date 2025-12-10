'use client'

import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Label } from '@/components/ui/label'
import { Check, Pencil, X } from 'lucide-react'
import type { TrainingPreview } from '@/lib/knowledge/training-pipeline'
import { KnowledgeCategory } from '@prisma/client'

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
  CREATE: { emoji: '📝', label: 'Criar', color: 'bg-green-600 hover:bg-green-700' },
  UPDATE: { emoji: '✏️', label: 'Atualizar', color: 'bg-blue-600 hover:bg-blue-700' },
  REPLACE: { emoji: '🔄', label: 'Substituir', color: 'bg-orange-600 hover:bg-orange-700' },
  DELETE: { emoji: '🗑️', label: 'Deletar', color: 'bg-red-600 hover:bg-red-700' },
}

interface KnowledgePreviewCardProps {
  preview: TrainingPreview
  onConfirm: () => Promise<void> | void
  onEdit: () => void
  onCancel: () => void
  isLoading?: boolean
}

export function KnowledgePreviewCard({
  preview,
  onConfirm,
  onEdit,
  onCancel,
  isLoading = false,
}: KnowledgePreviewCardProps) {
  const config = OPERATION_CONFIG[preview.operation]

  return (
    <Card className="border-2 border-primary/30 bg-gradient-to-br from-primary/5 via-background to-background">
      <CardHeader>
        <div className="flex items-center gap-3">
          <span className="text-3xl">{config.emoji}</span>
          <CardTitle className="text-lg">{config.label} conhecimento</CardTitle>
        </div>
      </CardHeader>

      <CardContent className="space-y-4 max-h-[60vh] overflow-y-auto pr-1">
        <div>
          <Label className="text-xs uppercase tracking-wide text-muted-foreground">Categoria</Label>
          <div className="mt-1">
            <Badge variant="outline" className="text-xs">
              {CATEGORY_LABELS[preview.category]}
            </Badge>
          </div>
        </div>

        <div>
          <Label className="text-xs uppercase tracking-wide text-muted-foreground">Título</Label>
          <p className="mt-1 text-lg font-semibold">{preview.title}</p>
        </div>

        <div>
          <Label className="text-xs uppercase tracking-wide text-muted-foreground">Conteúdo</Label>
          <div className="mt-2 rounded-lg border bg-background p-4 shadow-sm">
            <p className="whitespace-pre-wrap text-sm leading-relaxed">{preview.content}</p>
          </div>
        </div>

        <div>
          <Label className="text-xs uppercase tracking-wide text-muted-foreground">Tags</Label>
          <div className="mt-2 flex flex-wrap gap-2">
            {preview.tags.map(tag => (
              <Badge key={tag} variant="secondary" className="text-[11px] font-mono">
                {tag}
              </Badge>
            ))}
          </div>
        </div>

        {preview.metadata && Object.keys(preview.metadata).length > 0 && (
          <div>
            <Label className="text-xs uppercase tracking-wide text-muted-foreground">
              Dados Estruturados
            </Label>
            <pre className="mt-2 overflow-x-auto rounded-lg bg-slate-950 p-3 text-xs text-green-400">
              {JSON.stringify(preview.metadata, null, 2)}
            </pre>
          </div>
        )}
      </CardContent>

      <CardFooter className="flex gap-2">
        <Button
          onClick={onConfirm}
          disabled={isLoading}
          className={`flex-1 gap-2 ${config.color}`}
        >
          <Check className="h-4 w-4" />
          {isLoading ? 'Salvando...' : 'Confirmar'}
        </Button>
        <Button onClick={onEdit} disabled={isLoading} variant="outline" className="gap-2">
          <Pencil className="h-4 w-4" />
          Editar
        </Button>
        <Button onClick={onCancel} disabled={isLoading} variant="ghost" className="gap-2">
          <X className="h-4 w-4" />
          Cancelar
        </Button>
      </CardFooter>
    </Card>
  )
}
