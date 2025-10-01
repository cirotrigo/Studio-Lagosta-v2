"use client"

import * as React from 'react'
import Image from 'next/image'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Card } from '@/components/ui/card'
import { useToast } from '@/hooks/use-toast'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'

interface PhotoRecord {
  url: string
  name: string
  size?: number
  uploadedAt: string
}

interface PhotoSelectorProps {
  onSelect: (url: string) => void
  onSkip?: () => void
  selectedUrl?: string | null
}

function convertGoogleDriveUrl(url: string): string {
  const fileIdMatch = url.match(/\/d\/([^\/]+)/)
  if (fileIdMatch) {
    const fileId = fileIdMatch[1]
    return `https://drive.google.com/uc?export=download&id=${fileId}`
  }
  if (url.includes('drive.google.com/uc')) {
    return url
  }
  return url
}

export function PhotoSelector({ onSelect, onSkip, selectedUrl }: PhotoSelectorProps) {
  const { toast } = useToast()
  const [uploading, setUploading] = React.useState(false)
  const [uploadedPhotos, setUploadedPhotos] = React.useState<PhotoRecord[]>([])
  const fileInputRef = React.useRef<HTMLInputElement>(null)
  const [manualUrl, setManualUrl] = React.useState('')
  const [driveUrl, setDriveUrl] = React.useState('')

  const handleUpload = async (file: File) => {
    try {
      setUploading(true)
      const formData = new FormData()
      formData.append('file', file)

      const response = await fetch('/api/upload', {
        method: 'POST',
        body: formData,
      })

      if (!response.ok) {
        const text = await response.text()
        throw new Error(text || 'Falha no upload')
      }

      const data = await response.json()
      if (!data?.url) {
        throw new Error('Resposta inválida do servidor')
      }

      const record: PhotoRecord = {
        url: data.url,
        name: file.name,
        size: file.size,
        uploadedAt: new Date().toISOString(),
      }
      setUploadedPhotos((prev) => [record, ...prev])
      onSelect(data.url)
      toast({ title: 'Upload concluído', description: 'Foto adicionada ao projeto.' })
    } catch (error) {
      console.error('[PhotoSelector] Upload failed', error)
      toast({
        title: 'Erro ao enviar arquivo',
        description: error instanceof Error ? error.message : 'Tente novamente mais tarde.',
        variant: 'destructive',
      })
    } finally {
      setUploading(false)
      if (fileInputRef.current) {
        fileInputRef.current.value = ''
      }
    }
  }

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (file) {
      void handleUpload(file)
    }
  }

  const handleManualSubmit = (event: React.FormEvent) => {
    event.preventDefault()
    if (!manualUrl.trim()) return
    onSelect(manualUrl.trim())
    toast({ title: 'Foto selecionada', description: 'URL aplicada ao template.' })
    setManualUrl('')
  }

  const handleDriveSubmit = (event: React.FormEvent) => {
    event.preventDefault()
    if (!driveUrl.trim()) return
    const converted = convertGoogleDriveUrl(driveUrl.trim())
    onSelect(converted)
    toast({ title: 'Google Drive', description: 'Link convertido e aplicado.' })
    setDriveUrl('')
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold">Fotos do Projeto</h2>
          <p className="text-sm text-muted-foreground">
            Faça upload de uma nova foto, use um link público ou cole uma URL do Google Drive.
          </p>
        </div>
        {onSkip && (
          <Button variant="outline" onClick={onSkip}>
            Pular etapa
          </Button>
        )}
      </div>

      <Tabs defaultValue="upload" className="w-full">
        <TabsList>
          <TabsTrigger value="upload">Upload</TabsTrigger>
          <TabsTrigger value="drive">Google Drive</TabsTrigger>
          <TabsTrigger value="url">URL pública</TabsTrigger>
        </TabsList>
        <TabsContent value="upload" className="mt-4">
          <div className="rounded-lg border border-dashed border-border/60 bg-muted/30 p-6 text-center">
            <input
              ref={fileInputRef}
              className="hidden"
              type="file"
              accept="image/*"
              onChange={handleFileChange}
            />
            <p className="mb-4 text-sm text-muted-foreground">
              Arraste e solte uma imagem aqui ou selecione um arquivo do seu computador.
            </p>
            <Button onClick={() => fileInputRef.current?.click()} disabled={uploading}>
              {uploading ? 'Enviando...' : 'Selecionar arquivo'}
            </Button>
          </div>
        </TabsContent>
        <TabsContent value="drive" className="mt-4">
          <form className="space-y-3" onSubmit={handleDriveSubmit}>
            <div className="space-y-1">
              <Label htmlFor="drive-url">Link compartilhado do Google Drive</Label>
              <Input
                id="drive-url"
                placeholder="https://drive.google.com/file/d/..."
                value={driveUrl}
                onChange={(event) => setDriveUrl(event.target.value)}
              />
            </div>
            <Button type="submit" disabled={!driveUrl.trim()}>Converter e usar</Button>
            <p className="text-xs text-muted-foreground">
              Aceitamos links no formato <code>https://drive.google.com/file/d/&lt;ID&gt;/view</code>. O link é
              convertido automaticamente para download direto.
            </p>
          </form>
        </TabsContent>
        <TabsContent value="url" className="mt-4">
          <form className="space-y-3" onSubmit={handleManualSubmit}>
            <div className="space-y-1">
              <Label htmlFor="manual-url">Cole uma URL pública de imagem</Label>
              <Input
                id="manual-url"
                placeholder="https://exemplo.com/imagem.png"
                value={manualUrl}
                onChange={(event) => setManualUrl(event.target.value)}
              />
            </div>
            <Button type="submit" disabled={!manualUrl.trim()}>Usar imagem</Button>
          </form>
        </TabsContent>
      </Tabs>

      <div>
        <h3 className="text-sm font-semibold">Uploads recentes</h3>
        <p className="text-xs text-muted-foreground mb-3">Selecione uma imagem para aplicar diretamente ao template.</p>
        {uploading && uploadedPhotos.length === 0 && (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 3 }).map((_, idx) => (
              <Card key={idx} className="p-4">
                <Skeleton className="h-28 w-full" />
              </Card>
            ))}
          </div>
        )}
        {uploadedPhotos.length > 0 ? (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {uploadedPhotos.map((photo) => {
              const isActive = selectedUrl === photo.url
              return (
                <button
                  key={photo.url}
                  type="button"
                  onClick={() => onSelect(photo.url)}
                  className={cn(
                    'group relative overflow-hidden rounded-lg border border-border/50 text-left transition hover:border-primary',
                    isActive && 'border-primary shadow-[0_0_0_1px_var(--primary)]',
                  )}
                >
                  <div className="relative aspect-video bg-muted">
                    <Image
                      src={photo.url}
                      alt={photo.name}
                      fill
                      sizes="(min-width: 1024px) 33vw, (min-width: 640px) 50vw, 100vw"
                      className="object-cover"
                    />
                  </div>
                  <div className="flex items-center justify-between gap-2 px-3 py-2 text-xs">
                    <span className="truncate font-medium">{photo.name}</span>
                    {photo.size != null && (
                      <span className="text-muted-foreground">{Math.round(photo.size / 1024)} KB</span>
                    )}
                  </div>
                </button>
              )
            })}
          </div>
        ) : (
          <div className="rounded-lg border border-dashed border-border/50 p-4 text-center text-xs text-muted-foreground">
            Nenhuma foto enviada nesta sessão. Faça upload de uma imagem para reutilizá-la rapidamente.
          </div>
        )}
      </div>
    </div>
  )
}
