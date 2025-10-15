"use client"

import * as React from 'react'
import Image from 'next/image'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Upload, Loader2, X } from 'lucide-react'
import { useTemplateEditor, createDefaultLayer } from '@/contexts/template-editor-context'
import { useToast } from '@/hooks/use-toast'

interface Logo {
  id: number
  name: string
  fileUrl: string
  projectId: number
  uploadedBy: string
  createdAt: string
}

export function LogoPanelContent() {
  const { addLayer, design, projectId } = useTemplateEditor()
  const { toast } = useToast()

  const [logos, setLogos] = React.useState<Logo[]>([])
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

  // Insert logo layer in reduced size (max 200px width) maintaining aspect ratio
  const insertLogoLayer = React.useCallback(
    async (logo: Logo) => {
      try {
        // Get original dimensions
        const originalDimensions = await loadImageDimensions(logo.fileUrl)

        // Calculate size maintaining aspect ratio (max 200px width)
        const maxWidth = 200
        let width = originalDimensions.width
        let height = originalDimensions.height

        if (width > maxWidth) {
          const ratio = maxWidth / width
          width = maxWidth
          height = height * ratio
        }

        const base = createDefaultLayer('logo')

        // Position: centered on canvas
        const x = (canvasWidth - width) / 2
        const y = (canvasHeight - height) / 2

        const layer = {
          ...base,
          name: `Logo - ${logo.name}`,
          fileUrl: logo.fileUrl,
          position: { x, y },
          size: { width, height },
          style: {
            ...base.style,
            objectFit: 'cover' as const,
          },
        }

        addLayer(layer)
        toast({
          title: 'Logo adicionado',
          description: 'Redimensione conforme necessário.'
        })
      } catch (_error) {
        console.error('[LogoPanel] Failed to load image dimensions', error)
        toast({
          title: 'Erro ao adicionar logo',
          description: 'Não foi possível carregar as dimensões da imagem.',
          variant: 'destructive',
        })
      }
    },
    [addLayer, canvasWidth, canvasHeight, toast],
  )

  // Load logos from project
  const loadLogos = React.useCallback(async () => {
    if (!projectId) return

    setIsLoading(true)
    try {
      const response = await fetch(`/api/projects/${projectId}/logos`)
      if (!response.ok) {
        throw new Error('Falha ao carregar logos')
      }
      const data = await response.json()
      setLogos(data)
    } catch (_error) {
      console.error('[LogoPanel] Failed to load logos', error)
      toast({
        title: 'Erro ao carregar logos',
        description: 'Não foi possível carregar os logos do projeto.',
        variant: 'destructive',
      })
    } finally {
      setIsLoading(false)
    }
  }, [projectId, toast])

  // Load logos on mount
  React.useEffect(() => {
    loadLogos()
  }, [loadLogos])

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

      // Validate file type (accept common image formats for logos)
      const validTypes = ['image/png', 'image/jpeg', 'image/jpg', 'image/svg+xml', 'image/webp']
      if (!validTypes.includes(file.type)) {
        toast({
          title: 'Formato inválido',
          description: 'Apenas arquivos de imagem são aceitos para logos.',
          variant: 'destructive',
        })
        return
      }

      setIsUploading(true)
      try {
        const formData = new FormData()
        formData.append('file', file)
        formData.append('name', file.name)

        const response = await fetch(`/api/projects/${projectId}/logos`, {
          method: 'POST',
          body: formData,
        })

        if (!response.ok) {
          const message = await response.text()
          throw new Error(message || 'Falha ao enviar o logo')
        }

        const newLogo = await response.json()
        setLogos((prev) => [newLogo, ...prev])

        toast({
          title: 'Logo salvo',
          description: 'O logo foi salvo no projeto e está disponível para todos os templates.'
        })
      } catch (_error) {
        console.error('[LogoPanel] Upload failed', error)
        toast({
          title: 'Erro ao enviar logo',
          description: error instanceof Error ? error.message : 'Não foi possível enviar o logo.',
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
      const imageFiles = files.filter((file) => file.type.startsWith('image/'))

      if (imageFiles.length === 0) {
        toast({
          title: 'Formato inválido',
          description: 'Apenas arquivos de imagem são aceitos.',
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

  // Remove logo from project
  const removeLogo = React.useCallback(async (logoId: number) => {
    if (!projectId) return

    try {
      const response = await fetch(`/api/projects/${projectId}/logos/${logoId}`, {
        method: 'DELETE',
      })

      if (!response.ok) {
        throw new Error('Falha ao remover logo')
      }

      setLogos((prev) => prev.filter((logo) => logo.id !== logoId))

      toast({
        title: 'Logo removido',
        description: 'O logo foi removido do projeto.'
      })
    } catch (_error) {
      console.error('[LogoPanel] Failed to remove logo', error)
      toast({
        title: 'Erro ao remover logo',
        description: 'Não foi possível remover o logo.',
        variant: 'destructive',
      })
    }
  }, [projectId, toast])

  return (
    <>
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
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
                {isDragging ? 'Solte os logos aqui' : 'Clique ou arraste logos'}
              </p>
              <p className="text-xs text-muted-foreground">
                PNG, JPG, SVG até 10MB (múltiplas seleções)
              </p>
            </div>
          )}
        </div>

        {/* Logos Grid */}
        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : logos.length > 0 ? (
          <>
            <div className="border-t border-border/40 pt-4">
              <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Logos da Marca
              </h3>
            </div>

            <ScrollArea className="h-[400px]">
              <div className="grid grid-cols-2 gap-3">
                {logos.map((logo) => (
                  <div
                    key={logo.id}
                    className="group relative aspect-square overflow-hidden rounded-lg border border-border/40 bg-muted/30 transition hover:border-primary"
                  >
                    <button
                      onClick={() => insertLogoLayer(logo)}
                      className="relative h-full w-full"
                    >
                      <div className="relative h-full w-full p-2">
                        <Image
                          src={logo.fileUrl}
                          alt={logo.name}
                          fill
                          className="object-contain"
                        />
                      </div>
                      <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent p-2 opacity-0 transition group-hover:opacity-100">
                        <p className="truncate text-xs font-medium text-white">
                          {logo.name}
                        </p>
                      </div>
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        removeLogo(logo.id)
                      }}
                      className="absolute right-1 top-1 rounded-full bg-black/60 p-1 opacity-0 transition hover:bg-black/80 group-hover:opacity-100"
                      title="Remover logo"
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
              Nenhum logo carregado ainda.
            </p>
          </div>
        )}

        {/* Info Box */}
        <div className="rounded-lg border border-border/40 bg-muted/20 p-4">
          <p className="text-xs text-muted-foreground">
            <strong>Dica:</strong> Os logos são salvos no projeto e ficam disponíveis em todos os templates.
            Eles são adicionados em tamanho reduzido (200px) mantendo as proporções.
          </p>
        </div>
      </div>
    </>
  )
}
