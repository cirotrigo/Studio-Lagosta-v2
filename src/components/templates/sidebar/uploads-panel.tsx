"use client"

import * as React from 'react'
import Image from 'next/image'
import { Upload, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { useTemplateEditor, createDefaultLayer } from '@/contexts/template-editor-context'

interface LocalUpload {
  id: string
  name: string
  url: string
  size: number
  createdAt: number
}

export function UploadsPanel() {
  const { addLayer } = useTemplateEditor()
  const fileInputRef = React.useRef<HTMLInputElement | null>(null)
  const [uploads, setUploads] = React.useState<LocalUpload[]>([])

  const revokeObjectUrls = React.useCallback((items: LocalUpload[]) => {
    items.forEach((item) => {
      URL.revokeObjectURL(item.url)
    })
  }, [])

  React.useEffect(() => {
    return () => revokeObjectUrls(uploads)
  }, [revokeObjectUrls, uploads])

  const handleUpload = React.useCallback(async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files
    if (!files || files.length === 0) return
    const nextUploads: LocalUpload[] = []

    for (const file of Array.from(files)) {
      const url = URL.createObjectURL(file)
      nextUploads.push({
        id: `${file.name}-${Date.now()}`,
        name: file.name,
        url,
        size: file.size,
        createdAt: Date.now(),
      })

      // Carregar imagem para obter dimensões reais
      const img = new window.Image()
      try {
        await new Promise<void>((resolve, reject) => {
          img.onload = () => resolve()
          img.onerror = () => reject(new Error('Falha ao carregar imagem'))
          img.src = url
        })

        const imgWidth = img.naturalWidth
        const imgHeight = img.naturalHeight
        const imgAspectRatio = imgWidth / imgHeight

        // Calcular dimensões mantendo aspect ratio (max 600px)
        const maxSize = 600
        let targetWidth = imgWidth
        let targetHeight = imgHeight

        if (targetWidth > maxSize || targetHeight > maxSize) {
          if (imgAspectRatio > 1) {
            // Landscape
            targetWidth = maxSize
            targetHeight = maxSize / imgAspectRatio
          } else {
            // Portrait
            targetHeight = maxSize
            targetWidth = maxSize * imgAspectRatio
          }
        }

        const base = createDefaultLayer('image')
        addLayer({
          ...base,
          name: `Upload - ${file.name}`,
          fileUrl: url,
          size: {
            width: Math.round(targetWidth),
            height: Math.round(targetHeight),
          },
          style: {
            ...base.style,
            objectFit: 'contain',
          },
        })
      } catch (error) {
        console.error('[UploadsPanel] Erro ao carregar imagem', error)
        // Fallback: usar dimensões padrão
        const base = createDefaultLayer('image')
        addLayer({
          ...base,
          name: `Upload - ${file.name}`,
          fileUrl: url,
          style: {
            ...base.style,
            objectFit: 'contain',
          },
        })
      }
    }

    setUploads((prev) => [...nextUploads, ...prev])
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
  }, [addLayer])

  const handleRemoveUpload = React.useCallback((id: string) => {
    setUploads((prev) => {
      const next = prev.filter((item) => item.id !== id)
      const removed = prev.filter((item) => item.id === id)
      revokeObjectUrls(removed)
      return next
    })
  }, [revokeObjectUrls])

  const handleReuseUpload = React.useCallback(async (upload: LocalUpload) => {
    // Carregar imagem para obter dimensões reais
    const img = new window.Image()
    try {
      await new Promise<void>((resolve, reject) => {
        img.onload = () => resolve()
        img.onerror = () => reject(new Error('Falha ao carregar imagem'))
        img.src = upload.url
      })

      const imgWidth = img.naturalWidth
      const imgHeight = img.naturalHeight
      const imgAspectRatio = imgWidth / imgHeight

      // Calcular dimensões mantendo aspect ratio (max 600px)
      const maxSize = 600
      let targetWidth = imgWidth
      let targetHeight = imgHeight

      if (targetWidth > maxSize || targetHeight > maxSize) {
        if (imgAspectRatio > 1) {
          // Landscape
          targetWidth = maxSize
          targetHeight = maxSize / imgAspectRatio
        } else {
          // Portrait
          targetHeight = maxSize
          targetWidth = maxSize * imgAspectRatio
        }
      }

      const base = createDefaultLayer('image')
      addLayer({
        ...base,
        name: `Upload - ${upload.name}`,
        fileUrl: upload.url,
        size: {
          width: Math.round(targetWidth),
          height: Math.round(targetHeight),
        },
        style: {
          ...base.style,
          objectFit: 'contain',
        },
      })
    } catch (error) {
      console.error('[UploadsPanel] Erro ao carregar imagem', error)
      // Fallback: usar dimensões padrão
      const base = createDefaultLayer('image')
      addLayer({
        ...base,
        name: `Upload - ${upload.name}`,
        fileUrl: upload.url,
        style: {
          ...base.style,
          objectFit: 'contain',
        },
      })
    }
  }, [addLayer])

  return (
    <div className="flex h-full min-h-[400px] flex-col gap-3 rounded-lg border border-border/40 bg-card/60 p-4 shadow-sm">
      <div className="space-y-2">
        <h3 className="text-sm font-semibold">Uploads</h3>
        <p className="text-xs text-muted-foreground">Envie imagens do seu computador para reutilizar no layout.</p>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          onChange={handleUpload}
        />
        <Button size="sm" onClick={() => fileInputRef.current?.click()}>
          <Upload className="mr-2 h-4 w-4" />
          Selecionar arquivos
        </Button>
      </div>
      <ScrollArea className="flex-1">
        <div className="space-y-3 pr-2">
          {uploads.length === 0 ? (
            <div className="rounded-lg border border-dashed border-border/60 bg-muted/30 p-4 text-center text-xs text-muted-foreground">
              Nenhuma imagem enviada ainda.
            </div>
          ) : (
            uploads.map((upload) => (
              <div
                key={upload.id}
                className="flex items-center gap-3 rounded-lg border border-border/40 bg-muted/30 p-3"
              >
                <div className="relative h-12 w-12 overflow-hidden rounded">
                  <Image src={upload.url} alt={upload.name} fill sizes="48px" className="object-cover" unoptimized />
                </div>
                <div className="flex-1">
                  <p className="truncate text-xs font-medium">{upload.name}</p>
                  <p className="text-[10px] text-muted-foreground">{formatSize(upload.size)}</p>
                </div>
                <div className="flex items-center gap-2">
                  <Button size="sm" variant="outline" onClick={() => handleReuseUpload(upload)}>
                    Usar novamente
                  </Button>
                  <Button size="icon" variant="ghost" onClick={() => handleRemoveUpload(upload.id)}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            ))
          )}
        </div>
      </ScrollArea>
    </div>
  )
}

function formatSize(size: number) {
  if (size < 1024) return `${size} B`
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`
  return `${(size / (1024 * 1024)).toFixed(1)} MB`
}
