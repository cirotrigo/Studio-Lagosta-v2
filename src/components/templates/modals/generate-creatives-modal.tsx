"use client"

import * as React from 'react'
import Image from 'next/image'
import { Loader2, Save, AlertCircle, ImageIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Checkbox } from '@/components/ui/checkbox'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'
import {
  AI_INSTRUCTION_MAX_CHARS,
  AI_INSTRUCTION_PLACEHOLDER,
  AI_IMPROVEMENT_CREDIT_COST,
} from '@/lib/ai/instruction-field'
import type { Page } from '@/types/template'

interface GenerateCreativesModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  pages: Page[]
  currentPageId: string | null
  onGenerate: (selectedPageIds: string[], aiInstruction: string) => Promise<void>
  creditCost: number
  hasCredits: boolean
  isGenerating?: boolean
  generationProgress?: {
    current: number
    total: number
  }
}

export function GenerateCreativesModal({
  open,
  onOpenChange,
  pages,
  currentPageId,
  onGenerate,
  creditCost,
  hasCredits,
  isGenerating = false,
  generationProgress,
}: GenerateCreativesModalProps) {
  const [selectedPageIds, setSelectedPageIds] = React.useState<Set<string>>(new Set())
  const [aiInstruction, setAiInstruction] = React.useState('')

  // Ordenar páginas por order
  const sortedPages = React.useMemo(() => {
    return [...pages].sort((a, b) => a.order - b.order)
  }, [pages])

  // Com uma página só não há o que escolher — o modal existe pelo campo de
  // instrução, então a lista some e a página entra selecionada.
  const isSinglePage = sortedPages.length === 1

  // Inicializar com apenas a página atual selecionada
  React.useEffect(() => {
    if (!open) return
    setAiInstruction('')
    if (isSinglePage) {
      setSelectedPageIds(new Set([sortedPages[0].id]))
    } else if (currentPageId) {
      setSelectedPageIds(new Set([currentPageId]))
    }
  }, [open, currentPageId, isSinglePage, sortedPages])

  const allSelected = selectedPageIds.size === sortedPages.length
  const noneSelected = selectedPageIds.size === 0

  const handleTogglePage = React.useCallback((pageId: string) => {
    setSelectedPageIds((prev) => {
      const next = new Set(prev)
      if (next.has(pageId)) {
        next.delete(pageId)
      } else {
        next.add(pageId)
      }
      return next
    })
  }, [])

  const handleToggleAll = React.useCallback(() => {
    if (allSelected) {
      setSelectedPageIds(new Set())
    } else {
      setSelectedPageIds(new Set(sortedPages.map((p) => p.id)))
    }
  }, [allSelected, sortedPages])

  const handleGenerate = React.useCallback(async () => {
    if (noneSelected) return

    const selectedIds = Array.from(selectedPageIds)
    await onGenerate(selectedIds, aiInstruction.trim())
  }, [noneSelected, selectedPageIds, onGenerate, aiInstruction])

  const wantsImprovement = aiInstruction.trim().length > 0
  const improvementCost = wantsImprovement
    ? selectedPageIds.size * AI_IMPROVEMENT_CREDIT_COST
    : 0
  const totalCost = selectedPageIds.size * creditCost + improvementCost
  // 3s por página no export; a melhoria roda em fila e leva ~60s por arte.
  const estimatedTime = selectedPageIds.size * (wantsImprovement ? 60 : 3)

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[85vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle>
            {isSinglePage ? 'Gerar Criativo' : 'Gerar Criativos - Selecione as Páginas'}
          </DialogTitle>
          <DialogDescription>
            {isSinglePage
              ? 'Exporta a página atual como criativo JPEG em alta qualidade'
              : 'Escolha quais páginas deseja exportar como criativos JPEG em alta qualidade'}
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto space-y-4 py-4">
          {/* Checkbox Selecionar Todas */}
          {!isSinglePage && (
            <div className="flex items-center space-x-2 px-1">
              <Checkbox
                id="select-all"
                checked={allSelected}
                onCheckedChange={handleToggleAll}
                disabled={isGenerating}
              />
              <label
                htmlFor="select-all"
                className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 cursor-pointer"
              >
                Selecionar Todas as Páginas ({sortedPages.length})
              </label>
            </div>
          )}

          {/* Grid de Thumbnails */}
          <div
            className={cn(
              'grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4',
              isSinglePage && 'hidden',
            )}
          >
            {sortedPages.map((page, index) => {
              const isSelected = selectedPageIds.has(page.id)
              const isCurrentPage = page.id === currentPageId

              return (
                <div
                  key={page.id}
                  onClick={() => !isGenerating && handleTogglePage(page.id)}
                  className={cn(
                    'relative group cursor-pointer rounded-lg border-2 p-3 transition-all hover:shadow-md',
                    isSelected
                      ? 'border-primary bg-primary/5'
                      : 'border-border hover:border-primary/50',
                    isGenerating && 'cursor-not-allowed opacity-50'
                  )}
                >
                  {/* Checkbox */}
                  <div className="absolute top-2 left-2 z-10">
                    <Checkbox
                      checked={isSelected}
                      onCheckedChange={() => !isGenerating && handleTogglePage(page.id)}
                      disabled={isGenerating}
                      onClick={(e) => e.stopPropagation()}
                    />
                  </div>

                  {/* Badge página atual */}
                  {isCurrentPage && (
                    <div className="absolute top-2 right-2 z-10 bg-primary text-primary-foreground text-[10px] font-semibold px-2 py-0.5 rounded">
                      Atual
                    </div>
                  )}

                  {/* Thumbnail */}
                  <div className="aspect-[9/16] w-full overflow-hidden rounded bg-muted mb-2 relative">
                    {page.thumbnail ? (
                      <Image
                        src={page.thumbnail}
                        alt={page.name}
                        fill
                        className="object-cover"
                        unoptimized
                      />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center flex-col gap-2 text-muted-foreground">
                        <ImageIcon className="h-8 w-8" />
                        <span className="text-xs">Pág. {index + 1}</span>
                      </div>
                    )}
                  </div>

                  {/* Label */}
                  <div className="text-center">
                    <p className="text-sm font-medium truncate">{page.name}</p>
                    <p className="text-xs text-muted-foreground">Página {index + 1}</p>
                  </div>
                </div>
              )
            })}
          </div>

          {/* Instrução opcional para a IA */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label htmlFor="ai-instruction">Instrução para a IA (opcional)</Label>
              <span className="text-xs text-muted-foreground">
                {aiInstruction.length}/{AI_INSTRUCTION_MAX_CHARS}
              </span>
            </div>
            <Textarea
              id="ai-instruction"
              placeholder={AI_INSTRUCTION_PLACEHOLDER}
              value={aiInstruction}
              onChange={(e) =>
                setAiInstruction(e.target.value.slice(0, AI_INSTRUCTION_MAX_CHARS))
              }
              rows={3}
              className="resize-none"
              disabled={isGenerating}
            />
            <p className="text-xs text-muted-foreground">
              {wantsImprovement
                ? `A arte gerada entra na fila de melhoria com IA (+${AI_IMPROVEMENT_CREDIT_COST} créditos por página). O criativo original continua salvo.`
                : 'Deixe em branco para gerar a arte exatamente como está no editor.'}
            </p>
          </div>

          {/* Resumo de Custos */}
          <div className="bg-muted/50 rounded-lg p-4 space-y-2">
            <h4 className="font-semibold text-sm">📊 Resumo:</h4>
            <div className="space-y-1 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Páginas selecionadas:</span>
                <span className="font-medium">
                  {selectedPageIds.size} de {sortedPages.length}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Custo total:</span>
                <span className="font-medium">
                  {totalCost} créditos
                  {wantsImprovement
                    ? ` (${creditCost} de geração + ${AI_IMPROVEMENT_CREDIT_COST} de melhoria, por página)`
                    : ` (${creditCost} créditos/página)`}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Tempo estimado:</span>
                <span className="font-medium">~{estimatedTime} segundos</span>
              </div>
            </div>
          </div>

          {/* Warning créditos insuficientes */}
          {!hasCredits && selectedPageIds.size > 0 && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                Créditos insuficientes! Você precisa de {totalCost} créditos para gerar{' '}
                {selectedPageIds.size} página{selectedPageIds.size > 1 ? 's' : ''}.
              </AlertDescription>
            </Alert>
          )}

          {/* Progresso de geração */}
          {isGenerating && generationProgress && (
            <Alert>
              <Loader2 className="h-4 w-4 animate-spin" />
              <AlertDescription>
                Gerando página {generationProgress.current} de {generationProgress.total}...
                <div className="mt-2 w-full bg-muted rounded-full h-2">
                  <div
                    className="bg-primary h-2 rounded-full transition-all"
                    style={{
                      width: `${(generationProgress.current / generationProgress.total) * 100}%`,
                    }}
                  />
                </div>
              </AlertDescription>
            </Alert>
          )}
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isGenerating}
          >
            Cancelar
          </Button>
          <Button
            onClick={handleGenerate}
            disabled={noneSelected || !hasCredits || isGenerating}
          >
            {isGenerating ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Gerando...
              </>
            ) : (
              <>
                <Save className="mr-2 h-4 w-4" />
                Gerar Criativos Selecionados
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
