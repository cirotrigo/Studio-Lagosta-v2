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
import { cn } from '@/lib/utils'
import type { Page } from '@/types/template'

interface GenerateCreativesModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  pages: Page[]
  currentPageId: string | null
  onGenerate: (selectedPageIds: string[]) => Promise<void>
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

  // Ordenar páginas por order
  const sortedPages = React.useMemo(() => {
    return [...pages].sort((a, b) => a.order - b.order)
  }, [pages])

  // Inicializar com todas as páginas selecionadas
  React.useEffect(() => {
    if (open && sortedPages.length > 0) {
      setSelectedPageIds(new Set(sortedPages.map((p) => p.id)))
    }
  }, [open, sortedPages])

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
    await onGenerate(selectedIds)
  }, [noneSelected, selectedPageIds, onGenerate])

  const totalCost = selectedPageIds.size * creditCost
  const estimatedTime = selectedPageIds.size * 3 // 3 segundos por página

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[85vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle>Gerar Criativos - Selecione as Páginas</DialogTitle>
          <DialogDescription>
            Escolha quais páginas deseja exportar como criativos JPEG em alta qualidade
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto space-y-4 py-4">
          {/* Checkbox Selecionar Todas */}
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

          {/* Grid de Thumbnails */}
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
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
                  {totalCost} créditos ({creditCost} créditos/página)
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
