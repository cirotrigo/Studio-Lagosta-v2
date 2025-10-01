"use client"

import * as React from 'react'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { Input } from '@/components/ui/input'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Type, Image as ImageIcon, Files, Trash2, Save, Minus, ZoomIn, Layers } from 'lucide-react'
import { useTemplateEditor, createDefaultLayer } from '@/contexts/template-editor-context'

interface EditorToolbarProps {
  onSave: () => void
  saving: boolean
}

export function EditorToolbar({ onSave, saving }: EditorToolbarProps) {
  const {
    addLayer,
    duplicateLayer,
    removeLayer,
    selectedLayerId,
    design,
    zoom,
    zoomIn,
    zoomOut,
    dirty,
  } = useTemplateEditor()

  const [addImageDialogOpen, setAddImageDialogOpen] = React.useState(false)
  const [imageUrl, setImageUrl] = React.useState('')

  const canvasDimensions = `${design.canvas.width} × ${design.canvas.height}`

  const handleAddText = React.useCallback(() => {
    const layer = createDefaultLayer('text')
    addLayer(layer)
  }, [addLayer])

  const handleAddGradient = React.useCallback(() => {
    const layer = createDefaultLayer('gradient')
    addLayer(layer)
  }, [addLayer])

  const handleAddImage = React.useCallback(() => {
    if (!imageUrl.trim()) return
    const layer = createDefaultLayer('image')
    layer.fileUrl = imageUrl.trim()
    layer.name = 'Imagem'
    addLayer(layer)
    setImageUrl('')
    setAddImageDialogOpen(false)
  }, [addLayer, imageUrl])

  const handleDuplicate = React.useCallback(() => {
    if (selectedLayerId) duplicateLayer(selectedLayerId)
  }, [duplicateLayer, selectedLayerId])

  const handleRemove = React.useCallback(() => {
    if (selectedLayerId) removeLayer(selectedLayerId)
  }, [removeLayer, selectedLayerId])

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border/40 bg-card/60 p-3 shadow-sm">
      <div className="flex flex-1 flex-wrap items-center gap-2">
        <Button size="sm" onClick={onSave} disabled={saving || !dirty}>
          <Save className="mr-2 h-4 w-4" />
          {saving ? 'Salvando…' : dirty ? 'Salvar alterações' : 'Salvo'}
        </Button>

        <div className="h-6 w-px bg-border/60" aria-hidden="true" />

        <Button size="sm" variant="outline" onClick={handleAddText}>
          <Type className="mr-2 h-4 w-4" /> Texto
        </Button>

        <Button size="sm" variant="outline" onClick={handleAddGradient}>
          <Layers className="mr-2 h-4 w-4" /> Gradiente
        </Button>

        <Dialog open={addImageDialogOpen} onOpenChange={setAddImageDialogOpen}>
          <DialogTrigger asChild>
            <Button size="sm" variant="outline">
              <ImageIcon className="mr-2 h-4 w-4" /> Imagem
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Adicionar imagem</DialogTitle>
            </DialogHeader>
            <div className="space-y-2">
              <Input
                value={imageUrl}
                onChange={(event) => setImageUrl(event.target.value)}
                placeholder="https://exemplo.com/imagem.png"
              />
              <p className="text-xs text-muted-foreground">
                Forneça a URL pública da imagem. Arquivos enviados podem ser gerenciados em /admin/storage.
              </p>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setAddImageDialogOpen(false)}>
                Cancelar
              </Button>
              <Button onClick={handleAddImage} disabled={!imageUrl.trim()}>
                Adicionar
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <div className="h-6 w-px bg-border/60" aria-hidden="true" />

        <TooltipProvider>
          <div className="flex items-center gap-1">
            <Tooltip>
              <TooltipTrigger asChild>
                <span>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={handleDuplicate}
                    disabled={!selectedLayerId}
                  >
                    <Files className="h-4 w-4" />
                  </Button>
                </span>
              </TooltipTrigger>
              <TooltipContent>Duplicar layer</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <span>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={handleRemove}
                    disabled={!selectedLayerId}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </span>
              </TooltipTrigger>
              <TooltipContent>Remover layer</TooltipContent>
            </Tooltip>
          </div>
        </TooltipProvider>
      </div>

      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <span>{canvasDimensions}</span>
        <div className="flex items-center gap-1">
          <Button size="sm" variant="ghost" onClick={zoomOut}>
            <Minus className="h-4 w-4" />
          </Button>
          <span className="w-12 text-center font-medium text-foreground">{Math.round(zoom * 100)}%</span>
          <Button size="sm" variant="ghost" onClick={zoomIn}>
            <ZoomIn className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  )
}
