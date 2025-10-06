"use client"

import * as React from 'react'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Upload, Loader2, X } from 'lucide-react'
import { useTemplateEditor, createDefaultLayer } from '@/contexts/template-editor-context'
import { useToast } from '@/hooks/use-toast'

interface Element {
  id: number
  name: string
  fileUrl: string
  category: string | null
  projectId: number
  uploadedBy: string
  createdAt: string
}

export function ElementsPanelContent() {
  const { addLayer, design, projectId } = useTemplateEditor()
  const { toast } = useToast()

  const [elements, setElements] = React.useState<Element[]>([])
  const [isLoading, setIsLoading] = React.useState(true)
  const [isUploading, setIsUploading] = React.useState(false)
  const [isDragging, setIsDragging] = React.useState(false)
  const fileInputRef = React.useRef<HTMLInputElement>(null)

  const canvasWidth = design.canvas.width
  const canvasHeight = design.canvas.height

  // Load image to get original dimensions
  const loadImageDimensions = (url: string): Promise<{ width: number; height: number }> => {
    return new Promise((resolve, reject) => {
      const img = new Image()
      img.onload = () => {
        resolve({ width: img.width, height: img.height })
      }
      img.onerror = reject
      img.src = url
    })
  }

  // Insert element layer in reduced size (max 200px width) maintaining aspect ratio
  const insertElementLayer = React.useCallback(
    async (element: Element) => {
      try {
        // Get original dimensions
        const originalDimensions = await loadImageDimensions(element.fileUrl)

        // Calculate size maintaining aspect ratio (max 200px width)
        const maxWidth = 200
        let width = originalDimensions.width
        let height = originalDimensions.height

        if (width > maxWidth) {
          const ratio = maxWidth / width
          width = maxWidth
          height = height * ratio
        }

        const base = createDefaultLayer('image')

        // Position: centered on canvas
        const x = (canvasWidth - width) / 2
        const y = (canvasHeight - height) / 2

        const layer = {
          ...base,
          name: `Elemento - ${element.name}`,
          fileUrl: element.fileUrl,
          position: { x, y },
          size: { width, height },
          style: {
            ...base.style,
            objectFit: 'cover' as const,
          },
        }

        addLayer(layer)
        toast({
          title: 'Elemento adicionado',
          description: 'Redimensione conforme necessário.'
        })
      } catch (error) {
        console.error('[ElementsPanel] Failed to load image dimensions', error)
        toast({
          title: 'Erro ao adicionar elemento',
          description: 'Não foi possível carregar as dimensões da imagem.',
          variant: 'destructive',
        })
      }
    },
    [addLayer, canvasWidth, canvasHeight, toast],
  )

  // Load elements from project
  const loadElements = React.useCallback(async () => {
    if (!projectId) return

    setIsLoading(true)
    try {
      const response = await fetch(`/api/projects/${projectId}/elements`)
      if (!response.ok) {
        throw new Error('Falha ao carregar elementos')
      }
      const data = await response.json()
      setElements(data)
    } catch (error) {
      console.error('[ElementsPanel] Failed to load elements', error)
      toast({
        title: 'Erro ao carregar elementos',
        description: 'Não foi possível carregar os elementos do projeto.',
        variant: 'destructive',
      })
    } finally {
      setIsLoading(false)
    }
  }, [projectId, toast])

  // Load elements on mount
  React.useEffect(() => {
    loadElements()
  }, [loadElements])

  // File upload
  const uploadFile = React.useCallback(
    async (file: File) => {
      if (!projectId) {
        toast({
          title: 'Erro',
          description: 'ID do projeto não encontrado.',
          variant: 'destructive',
        })
        return
      }

      // Validate file type
      const validTypes = ['image/png', 'image/jpeg', 'image/jpg']
      if (!validTypes.includes(file.type)) {
        toast({
          title: 'Formato inválido',
          description: 'Apenas arquivos PNG e JPEG são aceitos.',
          variant: 'destructive',
        })
        return
      }

      setIsUploading(true)
      try {
        const formData = new FormData()
        formData.append('file', file)
        formData.append('name', file.name)

        const response = await fetch(`/api/projects/${projectId}/elements`, {
          method: 'POST',
          body: formData,
        })

        if (!response.ok) {
          const message = await response.text()
          throw new Error(message || 'Falha ao enviar o elemento')
        }

        const newElement = await response.json()
        setElements((prev) => [newElement, ...prev])

        toast({
          title: 'Elemento salvo',
          description: 'O elemento foi salvo no projeto e está disponível para todos os templates.'
        })
      } catch (error) {
        console.error('[ElementsPanel] Upload failed', error)
        toast({
          title: 'Erro ao enviar elemento',
          description: error instanceof Error ? error.message : 'Não foi possível enviar o elemento.',
          variant: 'destructive',
        })
      } finally {
        setIsUploading(false)
      }
    },
    [projectId, toast],
  )

  const handleFileChange = React.useCallback(
    async (event: React.ChangeEvent<HTMLInputElement>) => {
      const files = event.target.files
      if (files && files.length > 0) {
        // Process multiple files
        for (let i = 0; i < files.length; i++) {
          await uploadFile(files[i])
        }
        if (event.target) event.target.value = ''
      }
    },
    [uploadFile],
  )

  // Drag and drop handlers
  const handleDragEnter = React.useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(true)
  }, [])

  const handleDragLeave = React.useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(false)
  }, [])

  const handleDragOver = React.useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
  }, [])

  const handleDrop = React.useCallback(
    async (e: React.DragEvent) => {
      e.preventDefault()
      e.stopPropagation()
      setIsDragging(false)

      const files = Array.from(e.dataTransfer.files)
      const imageFiles = files.filter((file) =>
        file.type === 'image/png' || file.type === 'image/jpeg' || file.type === 'image/jpg'
      )

      if (imageFiles.length === 0) {
        toast({
          title: 'Formato inválido',
          description: 'Apenas arquivos PNG e JPEG são aceitos.',
          variant: 'destructive',
        })
        return
      }

      // Upload all valid images
      for (const file of imageFiles) {
        await uploadFile(file)
      }
    },
    [uploadFile, toast],
  )

  // Remove element from project
  const removeElement = React.useCallback(async (elementId: number) => {
    if (!projectId) return

    try {
      const response = await fetch(`/api/projects/${projectId}/elements/${elementId}`, {
        method: 'DELETE',
      })

      if (!response.ok) {
        throw new Error('Falha ao remover elemento')
      }

      setElements((prev) => prev.filter((el) => el.id !== elementId))

      toast({
        title: 'Elemento removido',
        description: 'O elemento foi removido do projeto.'
      })
    } catch (error) {
      console.error('[ElementsPanel] Failed to remove element', error)
      toast({
        title: 'Erro ao remover elemento',
        description: 'Não foi possível remover o elemento.',
        variant: 'destructive',
      })
    }
  }, [projectId, toast])

  return (
    <>
      <input
        ref={fileInputRef}
        type="file"
        accept=".png,.jpg,.jpeg,image/png,image/jpeg"
        multiple
        className="hidden"
        onChange={handleFileChange}
      />

      <div className="space-y-4">
        {/* Upload Area */}
        <div
          onDragEnter={handleDragEnter}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          className={`cursor-pointer rounded-lg border-2 border-dashed p-6 text-center transition ${
            isDragging
              ? 'border-primary bg-primary/10'
              : 'border-border/60 hover:border-primary/50 hover:bg-muted/50'
          }`}
          onClick={() => fileInputRef.current?.click()}
        >
          {isUploading ? (
            <div className="flex flex-col items-center justify-center py-4">
              <Loader2 className="mb-2 h-10 w-10 animate-spin text-primary" />
              <p className="text-sm font-medium text-foreground">Enviando...</p>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-4">
              <Upload className="mb-2 h-10 w-10 text-muted-foreground/50" />
              <p className="mb-1 text-sm font-medium text-foreground">
                {isDragging ? 'Solte as imagens aqui' : 'Clique ou arraste imagens'}
              </p>
              <p className="text-xs text-muted-foreground">
                Apenas PNG e JPEG (múltiplas seleções)
              </p>
            </div>
          )}
        </div>

        {/* Elements Grid */}
        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : elements.length > 0 ? (
          <>
            <div className="border-t border-border/40 pt-4">
              <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Elementos do Projeto
              </h3>
            </div>

            <ScrollArea className="h-[400px]">
              <div className="grid grid-cols-2 gap-3">
                {elements.map((element) => (
                  <div
                    key={element.id}
                    className="group relative aspect-square overflow-hidden rounded-lg border border-border/40 bg-muted/30 transition hover:border-primary"
                  >
                    <button
                      onClick={() => insertElementLayer(element)}
                      className="h-full w-full"
                    >
                      <img
                        src={element.fileUrl}
                        alt={element.name}
                        className="h-full w-full object-contain p-2"
                      />
                      <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent p-2 opacity-0 transition group-hover:opacity-100">
                        <p className="truncate text-xs font-medium text-white">
                          {element.name}
                        </p>
                      </div>
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        removeElement(element.id)
                      }}
                      className="absolute right-1 top-1 rounded-full bg-black/60 p-1 opacity-0 transition hover:bg-black/80 group-hover:opacity-100"
                      title="Remover elemento"
                    >
                      <X className="h-3 w-3 text-white" />
                    </button>
                  </div>
                ))}
              </div>
            </ScrollArea>
          </>
        ) : (
          <div className="rounded-lg border border-dashed border-border/60 py-8 text-center">
            <p className="text-sm text-muted-foreground">
              Nenhum elemento carregado ainda.
            </p>
          </div>
        )}

        {/* Info Box */}
        <div className="rounded-lg border border-border/40 bg-muted/20 p-4">
          <p className="text-xs text-muted-foreground">
            <strong>Dica:</strong> Os elementos são salvos no projeto e ficam disponíveis em todos os templates.
            Eles são adicionados em tamanho reduzido (200px) mantendo as proporções.
          </p>
        </div>
      </div>
    </>
  )
}
