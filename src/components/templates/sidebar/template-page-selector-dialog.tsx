"use client"

import * as React from 'react'
import Image from 'next/image'
import { Loader2, ChevronLeft, ChevronRight } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
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
  const [currentIndex, setCurrentIndex] = React.useState(0)
  const [isApplying, setIsApplying] = React.useState(false)
  const [direction, setDirection] = React.useState(0)

  // Reset to first page when dialog opens
  React.useEffect(() => {
    if (open) {
      setCurrentIndex(0)
      setIsApplying(false)
      setDirection(0)
    }
  }, [open])

  const handlePrevious = React.useCallback(() => {
    if (!pages || pages.length === 0) return
    setDirection(-1)
    setCurrentIndex((prev) => (prev === 0 ? pages.length - 1 : prev - 1))
  }, [pages])

  const handleNext = React.useCallback(() => {
    if (!pages || pages.length === 0) return
    setDirection(1)
    setCurrentIndex((prev) => (prev === pages.length - 1 ? 0 : prev + 1))
  }, [pages])

  const handleConfirm = React.useCallback(() => {
    if (!pages || pages.length === 0) return

    const selectedPage = pages[currentIndex]
    if (!selectedPage) return

    setIsApplying(true)
    // Cast layers to the correct type
    const pageWithLayers = {
      ...selectedPage,
      layers: selectedPage.layers as unknown as Layer[],
    }
    onSelectPage(pageWithLayers)
    // O componente pai vai fechar o dialog e lidar com o loading
  }, [currentIndex, pages, onSelectPage])

  // Keyboard navigation
  React.useEffect(() => {
    if (!open) return

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft') {
        handlePrevious()
      } else if (e.key === 'ArrowRight') {
        handleNext()
      } else if (e.key === 'Enter' && !isApplying) {
        handleConfirm()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [open, handlePrevious, handleNext, handleConfirm, isApplying])

  const currentPage = pages?.[currentIndex]

  const slideVariants = {
    enter: (direction: number) => ({
      x: direction > 0 ? 1000 : -1000,
      opacity: 0,
    }),
    center: {
      zIndex: 1,
      x: 0,
      opacity: 1,
    },
    exit: (direction: number) => ({
      zIndex: 0,
      x: direction < 0 ? 1000 : -1000,
      opacity: 0,
    }),
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-6xl max-h-[95vh] p-0 gap-0 overflow-hidden">
        <DialogHeader className="px-6 pt-6 pb-4 border-b border-border/40">
          <DialogTitle>Selecione uma página do template</DialogTitle>
          <DialogDescription>
            Use as setas ou teclado (← →) para navegar. Template &quot;{templateName}&quot;
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-hidden">
          {isLoading && (
            <div className="flex h-[600px] items-center justify-center px-6">
              <div className="w-full max-w-4xl space-y-4">
                <Skeleton className="h-[500px] w-full" />
                <Skeleton className="h-6 w-1/3 mx-auto" />
                <Skeleton className="h-4 w-1/4 mx-auto" />
              </div>
            </div>
          )}

          {!isLoading && (!pages || pages.length === 0) && (
            <div className="flex h-[400px] items-center justify-center px-6">
              <div className="rounded-lg border border-dashed border-border/60 p-8 text-center text-sm text-muted-foreground">
                Este template não possui páginas cadastradas.
              </div>
            </div>
          )}

          {!isLoading && pages && pages.length > 0 && (
            <div className="relative flex h-full min-h-[600px] items-center justify-center px-6 py-8">
              {/* Navigation Buttons */}
              {pages.length > 1 && (
                <>
                  <Button
                    variant="outline"
                    size="icon"
                    className="absolute left-4 top-1/2 z-10 h-12 w-12 -translate-y-1/2 rounded-full shadow-lg"
                    onClick={handlePrevious}
                    disabled={isApplying}
                  >
                    <ChevronLeft className="h-6 w-6" />
                  </Button>
                  <Button
                    variant="outline"
                    size="icon"
                    className="absolute right-4 top-1/2 z-10 h-12 w-12 -translate-y-1/2 rounded-full shadow-lg"
                    onClick={handleNext}
                    disabled={isApplying}
                  >
                    <ChevronRight className="h-6 w-6" />
                  </Button>
                </>
              )}

              {/* Carousel Content */}
              <div className="relative w-full max-w-4xl overflow-hidden">
                <AnimatePresence initial={false} custom={direction} mode="wait">
                  <motion.div
                    key={currentIndex}
                    custom={direction}
                    variants={slideVariants}
                    initial="enter"
                    animate="center"
                    exit="exit"
                    transition={{
                      x: { type: 'spring', stiffness: 300, damping: 30 },
                      opacity: { duration: 0.2 },
                    }}
                    className="flex flex-col items-center gap-4"
                  >
                    {/* Page Preview */}
                    <div className="relative w-full rounded-lg border border-border/40 bg-muted/20 shadow-xl overflow-hidden">
                      <div
                        className="relative mx-auto"
                        style={{
                          aspectRatio: currentPage
                            ? `${currentPage.width} / ${currentPage.height}`
                            : '9 / 16',
                          maxHeight: '500px',
                          maxWidth: '100%',
                        }}
                      >
                        {currentPage?.thumbnail ? (
                          <Image
                            src={currentPage.thumbnail}
                            alt={currentPage.name}
                            fill
                            sizes="(max-width: 1280px) 100vw, 1200px"
                            unoptimized
                            className="object-contain"
                            priority
                          />
                        ) : (
                          <div className="flex h-full items-center justify-center text-muted-foreground">
                            Sem preview disponível
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Page Info */}
                    <div className="text-center space-y-1">
                      <h3 className="text-lg font-semibold">{currentPage?.name}</h3>
                      <p className="text-sm text-muted-foreground">
                        {currentPage?.width} × {currentPage?.height}px
                      </p>
                    </div>

                    {/* Page Indicators */}
                    {pages.length > 1 && (
                      <div className="flex items-center gap-2">
                        {pages.map((_, index) => (
                          <button
                            key={index}
                            onClick={() => {
                              setDirection(index > currentIndex ? 1 : -1)
                              setCurrentIndex(index)
                            }}
                            className={cn(
                              'h-2 rounded-full transition-all',
                              index === currentIndex
                                ? 'w-8 bg-primary'
                                : 'w-2 bg-muted-foreground/30 hover:bg-muted-foreground/50',
                            )}
                            aria-label={`Ir para página ${index + 1}`}
                          />
                        ))}
                      </div>
                    )}
                  </motion.div>
                </AnimatePresence>
              </div>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="flex items-center justify-between gap-4 border-t border-border/40 px-6 py-4">
          <div className="text-sm text-muted-foreground">
            {pages && pages.length > 0 && (
              <>
                Página {currentIndex + 1} de {pages.length}
              </>
            )}
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={isApplying}
            >
              Cancelar
            </Button>
            <Button
              onClick={handleConfirm}
              disabled={!currentPage || isApplying}
            >
              {isApplying && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Aplicar esta página
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
