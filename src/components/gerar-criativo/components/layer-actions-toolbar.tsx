'use client'

import { useBackgroundRemoval } from '@/hooks/use-background-removal'
import { useCredits } from '@/hooks/use-credits'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Eraser, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import type { Layer } from '@/types/template'

interface LayerActionsToolbarProps {
  layer: Layer
  projectId: number
  onBackgroundRemoved: (newImageUrl: string) => void
}

export function LayerActionsToolbar({
  layer,
  projectId,
  onBackgroundRemoved,
}: LayerActionsToolbarProps) {
  const removeBackground = useBackgroundRemoval()
  const { credits, canPerformOperation } = useCredits()

  const isBackgroundRemoved = Boolean(layer.metadata?.isBackgroundRemoved)
  const imageUrl = layer.fileUrl

  const handleRemoveBackground = async () => {
    if (!imageUrl) {
      toast.error('Esta camada nao possui uma imagem')
      return
    }

    try {
      const result = await removeBackground.mutateAsync({
        imageUrl,
        projectId,
      })

      onBackgroundRemoved(result.url)
      toast.success('Fundo removido com sucesso!')
    } catch (error) {
      console.error('Error removing background:', error)
      toast.error('Erro ao remover fundo. Tente novamente.')
    }
  }

  if (layer.type !== 'image') {
    return null
  }

  return (
    <Card className="p-4">
      <h3 className="text-sm font-medium mb-3">Acoes da Camada</h3>
      <div className="space-y-2">
        <Button
          variant="outline"
          className="w-full justify-start"
          onClick={handleRemoveBackground}
          disabled={removeBackground.isPending || isBackgroundRemoved || !imageUrl}
        >
          {removeBackground.isPending ? (
            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
          ) : (
            <Eraser className="w-4 h-4 mr-2" />
          )}
          <span className="flex-1 text-left">
            {isBackgroundRemoved ? 'Fundo ja removido' : 'Remover Fundo'}
          </span>
          <span className="text-xs text-muted-foreground">3 creditos</span>
        </Button>
        {credits && credits.creditsRemaining < 3 && !isBackgroundRemoved && (
          <p className="text-xs text-destructive">Creditos insuficientes</p>
        )}
      </div>
    </Card>
  )
}
