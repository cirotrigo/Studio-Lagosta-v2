"use client"

import * as React from 'react'
import Image from 'next/image'
import { Loader2 } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'
import { usePages } from '@/hooks/use-pages'
import type { Layer } from '@/types/template'

interface PageResponse {
  id: string
  name: string
  width: number
  height: number
  layers: Layer[]
  background: string | null
  order: number
  thumbnail: string | null
  templateId: number
  createdAt: string
  updatedAt: string
}

interface TemplatePageSelectorDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  templateId: number
  templateName: string
  onSelectPage: (page: PageResponse) => void
}

export function TemplatePageSelectorDialog({
  open,
  onOpenChange,
  templateId,
  templateName,
  onSelectPage,
}: TemplatePageSelectorDialogProps) {
  const { data: pages, isLoading } = usePages(templateId)
  const [selectedPageId, setSelectedPageId] = React.useState<string | null>(null)
  const [isApplying, setIsApplying] = React.useState(false)

  // Reset selection when dialog opens
  React.useEffect(() => {
    if (open) {
      setSelectedPageId(null)
      setIsApplying(false)
    }
  }, [open])

  const handleConfirm = React.useCallback(() => {
    if (!selectedPageId || !pages) return

    const selectedPage = pages.find((p) => p.id === selectedPageId)
    if (!selectedPage) return

    setIsApplying(true)
    // Cast layers to the correct type
    const pageWithLayers = {
      ...selectedPage,
      layers: selectedPage.layers as unknown as Layer[],
    }
    onSelectPage(pageWithLayers)
    // O componente pai vai fechar o dialog e lidar com o loading
  }, [selectedPageId, pages, onSelectPage])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Selecione uma página do template</DialogTitle>
          <DialogDescription>
            Escolha qual página do template &quot;{templateName}&quot; você deseja aplicar ao design atual.
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="max-h-[60vh] pr-4">
          {isLoading && (
            <div className="grid gap-3 md:grid-cols-2">
              {Array.from({ length: 4 }).map((_, index) => (
                <div
                  key={`skeleton-${index}`}
                  className="rounded-lg border border-border/30 bg-muted/40 p-3"
                >
                  <Skeleton className="mb-2 h-32 w-full" />
                  <Skeleton className="mb-1.5 h-4 w-2/3" />
                  <Skeleton className="h-3 w-1/3" />
                </div>
              ))}
            </div>
          )}

          {!isLoading && (!pages || pages.length === 0) && (
            <div className="rounded-lg border border-dashed border-border/60 p-8 text-center text-sm text-muted-foreground">
              Este template não possui páginas cadastradas.
            </div>
          )}

          {!isLoading && pages && pages.length > 0 && (
            <div className="grid gap-3 md:grid-cols-2">
              {pages.map((page) => {
                const isSelected = selectedPageId === page.id

                return (
                  <button
                    key={page.id}
                    type="button"
                    onClick={() => setSelectedPageId(page.id)}
                    className={cn(
                      'flex flex-col overflow-hidden rounded-lg border border-border/40 bg-card/70 text-left shadow-sm transition hover:border-primary/40 hover:shadow-md',
                      isSelected && 'border-primary ring-2 ring-primary/20',
                    )}
                  >
                    <div className="relative aspect-[4/3] w-full bg-muted">
                      {page.thumbnail ? (
                        <Image
                          src={page.thumbnail}
                          alt={page.name}
                          fill
                          sizes="(max-width: 768px) 100vw, 300px"
                          unoptimized
                          className="object-cover"
                        />
                      ) : (
                        <div className="flex h-full items-center justify-center text-xs text-muted-foreground opacity-60">
                          Sem preview
                        </div>
                      )}
                    </div>
                    <div className="flex flex-col gap-1 p-3">
                      <h3 className="line-clamp-1 text-sm font-semibold leading-tight">
                        {page.name}
                      </h3>
                      <p className="text-xs text-muted-foreground">
                        {page.width} × {page.height}px
                      </p>
                    </div>
                  </button>
                )
              })}
            </div>
          )}
        </ScrollArea>

        <div className="flex justify-end gap-2 border-t border-border/40 pt-4">
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isApplying}
          >
            Cancelar
          </Button>
          <Button
            onClick={handleConfirm}
            disabled={!selectedPageId || isApplying}
          >
            {isApplying && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Aplicar página
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
