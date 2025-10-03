"use client"

import * as React from 'react'
import dynamic from 'next/dynamic'
import 'cropperjs/dist/cropper.css'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import type { Layer } from '@/types/template'
import { Loader2, RotateCcw, RotateCw, FlipHorizontal, FlipVertical } from 'lucide-react'
import type { ReactCropperElement } from 'react-cropper'

const Cropper = dynamic(() => import('react-cropper').then((mod) => mod.Cropper), {
  ssr: false,
})

interface ImageEditorModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  layer: Layer | null
  onApply: (payload: { fileUrl: string; width: number; height: number }) => void
}

export function ImageEditorModal({ open, onOpenChange, layer, onApply }: ImageEditorModalProps) {
  const cropperRef = React.useRef<ReactCropperElement>(null)
  const [loading, setLoading] = React.useState(false)

  const handleRotate = React.useCallback((angle: number) => {
    const cropper = cropperRef.current?.cropper
    if (!cropper) return
    cropper.rotate(angle)
  }, [])

  const handleFlip = React.useCallback((axis: 'horizontal' | 'vertical') => {
    const cropper = cropperRef.current?.cropper
    if (!cropper) return
    if (axis === 'horizontal') {
      const current = cropper.getData().scaleX ?? 1
      cropper.scaleX(current * -1)
    } else {
      const current = cropper.getData().scaleY ?? 1
      cropper.scaleY(current * -1)
    }
  }, [])

  const handleApply = React.useCallback(async () => {
    const cropper = cropperRef.current?.cropper
    if (!cropper || !layer) return
    try {
      setLoading(true)
      const canvas = cropper.getCroppedCanvas()
      const fileUrl = canvas.toDataURL('image/png')
      onApply({ fileUrl, width: canvas.width, height: canvas.height })
      onOpenChange(false)
    } finally {
      setLoading(false)
    }
  }, [layer, onApply, onOpenChange])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl">
        <DialogHeader>
          <DialogTitle>Editar imagem</DialogTitle>
          <DialogDescription>
            Ajuste o enquadramento, gire ou inverta a imagem selecionada. As alterações são aplicadas diretamente ao layer.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_180px]">
          <div className="relative h-[400px] w-full overflow-hidden rounded-md bg-muted">
            {layer?.fileUrl ? (
              <Cropper
                ref={cropperRef}
                src={layer.fileUrl}
                style={{ height: '100%', width: '100%' }}
                viewMode={1}
                background={false}
                guides
                autoCropArea={1}
              />
            ) : (
              <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
                Nenhuma imagem selecionada
              </div>
            )}
          </div>
          <ScrollArea className="h-[400px]">
            <div className="space-y-3 pr-2 text-sm">
              <div className="rounded-md border border-border/40 bg-muted/40 p-3">
                <p className="text-xs font-semibold uppercase text-muted-foreground">Rotação</p>
                <div className="mt-2 flex gap-2">
                  <Button variant="outline" size="icon" onClick={() => handleRotate(-90)}>
                    <RotateCcw className="h-4 w-4" />
                  </Button>
                  <Button variant="outline" size="icon" onClick={() => handleRotate(90)}>
                    <RotateCw className="h-4 w-4" />
                  </Button>
                </div>
              </div>
              <div className="rounded-md border border-border/40 bg-muted/40 p-3">
                <p className="text-xs font-semibold uppercase text-muted-foreground">Espelhar</p>
                <div className="mt-2 flex gap-2">
                  <Button variant="outline" size="icon" onClick={() => handleFlip('horizontal')}>
                    <FlipHorizontal className="h-4 w-4" />
                  </Button>
                  <Button variant="outline" size="icon" onClick={() => handleFlip('vertical')}>
                    <FlipVertical className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </div>
          </ScrollArea>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={loading}>
            Cancelar
          </Button>
          <Button onClick={handleApply} disabled={loading || !layer?.fileUrl}>
            {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Aplicar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
