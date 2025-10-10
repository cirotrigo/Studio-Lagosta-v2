"use client"

import * as React from 'react'
import { Film, Upload, Play, HardDrive, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { useTemplateEditor, createDefaultLayer } from '@/contexts/template-editor-context'
import { useToast } from '@/hooks/use-toast'
import { DesktopGoogleDriveModal } from '@/components/projects/google-drive-folder-selector'
import type { GoogleDriveItem } from '@/types/google-drive'
import { useProject } from '@/hooks/use-project'

const ALLOWED_VIDEO_TYPES = ['video/mp4', 'video/webm', 'video/quicktime']
const MAX_VIDEO_SIZE = 100 * 1024 * 1024 // 100MB

type DriveStatus = 'loading' | 'available' | 'unavailable'

export function VideosPanel() {
  const { addLayer, design, projectId } = useTemplateEditor()
  const { toast } = useToast()
  const fileInputRef = React.useRef<HTMLInputElement>(null)
  const [isDriveModalOpen, setIsDriveModalOpen] = React.useState(false)
  const [driveImporting, setDriveImporting] = React.useState(false)
  const [driveStatus, setDriveStatus] = React.useState<DriveStatus>('loading')
  const [driveStatusMessage, setDriveStatusMessage] = React.useState<string | null>(null)
  const { data: projectDetails } = useProject(projectId)
  const [uploadedVideos, setUploadedVideos] = React.useState<Array<{ id: string; name: string; url: string }>>([])

  React.useEffect(() => {
    let mounted = true
    const checkDrive = async () => {
      try {
        const response = await fetch('/api/google-drive/test')
        if (!mounted) return
        if (response.ok) {
          const payload = (await response.json()) as { status?: string }
          if (payload.status === 'ok') {
            setDriveStatus('available')
            setDriveStatusMessage(null)
          } else {
            setDriveStatus('unavailable')
            setDriveStatusMessage('Integração do Google Drive indisponível no momento.')
          }
        } else {
          setDriveStatus('unavailable')
          setDriveStatusMessage('Não foi possível conectar ao Google Drive.')
        }
      } catch (error) {
        console.warn('[VideosPanel] Falha ao verificar Google Drive', error)
        if (!mounted) return
        setDriveStatus('unavailable')
        setDriveStatusMessage('Não foi possível conectar ao Google Drive.')
      }
    }
    void checkDrive()
    return () => {
      mounted = false
    }
  }, [])

  const handleFileUpload = React.useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0]
      if (!file) return

      // Validar tipo
      if (!ALLOWED_VIDEO_TYPES.includes(file.type)) {
        toast({
          title: 'Formato inválido',
          description: 'Apenas vídeos MP4, WebM e MOV são suportados.',
          variant: 'destructive',
        })
        return
      }

      // Validar tamanho
      if (file.size > MAX_VIDEO_SIZE) {
        toast({
          title: 'Arquivo muito grande',
          description: 'O vídeo deve ter no máximo 100MB.',
          variant: 'destructive',
        })
        return
      }

      // Criar URL temporária
      const videoUrl = URL.createObjectURL(file)
      const videoId = crypto.randomUUID()

      // Adicionar à lista de vídeos
      setUploadedVideos((prev) => [
        ...prev,
        {
          id: videoId,
          name: file.name.replace(/\.[^/.]+$/, ''),
          url: videoUrl,
        },
      ])

      // Criar layer de vídeo
      const base = createDefaultLayer('video')
      addLayer({
        ...base,
        name: `Vídeo - ${file.name.replace(/\.[^/.]+$/, '')}`,
        fileUrl: videoUrl,
        size: { width: design.canvas.width, height: design.canvas.height },
        position: { x: 0, y: 0 },
        videoMetadata: {
          ...base.videoMetadata,
          autoplay: true,
          loop: true,
          muted: true,
          objectFit: 'cover',
        },
      })

      toast({
        title: 'Vídeo adicionado',
        description: 'O vídeo foi adicionado como fundo do canvas.',
      })

      // Limpar input
      if (fileInputRef.current) {
        fileInputRef.current.value = ''
      }
    },
    [addLayer, design.canvas.width, design.canvas.height, toast],
  )

  const handleAddExistingVideo = React.useCallback(
    (video: { url: string; name: string }) => {
      const base = createDefaultLayer('video')
      addLayer({
        ...base,
        name: `Vídeo - ${video.name}`,
        fileUrl: video.url,
        size: { width: design.canvas.width, height: design.canvas.height },
        position: { x: 0, y: 0 },
        videoMetadata: {
          ...base.videoMetadata,
          autoplay: true,
          loop: true,
          muted: true,
          objectFit: 'cover',
        },
      })

      toast({
        title: 'Vídeo adicionado',
        description: 'O vídeo foi adicionado como fundo do canvas.',
      })
    },
    [addLayer, design.canvas.width, design.canvas.height, toast],
  )

  const importDriveFile = React.useCallback(async (fileId: string) => {
    const response = await fetch('/api/upload/google-drive', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fileId }),
    })
    if (!response.ok) {
      const message = await response.text()
      throw new Error(message || 'Falha ao importar arquivo do Google Drive')
    }
    return (await response.json()) as { url?: string; name?: string }
  }, [])

  const handleDriveSelect = React.useCallback(
    async (item: GoogleDriveItem | { id: string; name: string; kind: 'folder' }) => {
      if ('kind' in item && item.kind === 'folder') {
        toast({ title: 'Selecione um arquivo', description: 'Escolha um vídeo dentro da pasta.' })
        return
      }

      // Validar se é um arquivo de vídeo
      if ('mimeType' in item && item.mimeType && !item.mimeType.startsWith('video/')) {
        toast({
          title: 'Formato inválido',
          description: 'Por favor, selecione um arquivo de vídeo (MP4, WebM ou MOV).',
          variant: 'destructive',
        })
        return
      }

      setDriveImporting(true)
      try {
        const uploaded = await importDriveFile(item.id)
        if (!uploaded.url) {
          throw new Error('Falha ao importar arquivo do Google Drive')
        }

        const videoId = crypto.randomUUID()
        setUploadedVideos((prev) => [
          ...prev,
          {
            id: videoId,
            name: uploaded.name ?? item.name,
            url: uploaded.url,
          },
        ])

        const base = createDefaultLayer('video')
        addLayer({
          ...base,
          name: `Vídeo - ${uploaded.name ?? item.name}`,
          fileUrl: uploaded.url,
          size: { width: design.canvas.width, height: design.canvas.height },
          position: { x: 0, y: 0 },
          videoMetadata: {
            ...base.videoMetadata,
            autoplay: true,
            loop: true,
            muted: true,
            objectFit: 'cover',
          },
        })

        toast({
          title: 'Vídeo adicionado',
          description: 'O vídeo do Google Drive foi adicionado como fundo do canvas.',
        })

        setIsDriveModalOpen(false)
      } catch (error) {
        console.error('[VideosPanel] Falha ao importar do Drive', error)
        toast({
          title: 'Erro ao importar do Drive',
          description: error instanceof Error ? error.message : 'Não foi possível copiar o arquivo.',
          variant: 'destructive',
        })
      } finally {
        setDriveImporting(false)
      }
    },
    [importDriveFile, addLayer, design.canvas.width, design.canvas.height, toast],
  )

  const driveAvailable = driveStatus === 'available'

  return (
    <div className="flex h-full min-h-[400px] flex-col gap-3 rounded-lg border border-border/40 bg-card/60 p-4 shadow-sm">
      <div className="space-y-2">
        <h3 className="flex items-center gap-2 text-sm font-semibold">
          <Film className="h-4 w-4" />
          Vídeos de Fundo
        </h3>
        <p className="text-xs text-muted-foreground">Adicione vídeos como background do seu design</p>
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept="video/mp4,video/webm,video/quicktime"
        onChange={handleFileUpload}
        className="hidden"
      />

      <div className="flex gap-2">
        <Button onClick={() => fileInputRef.current?.click()} className="flex-1 gap-2">
          <Upload className="h-4 w-4" />
          Upload Local
        </Button>
        <Button
          variant="outline"
          onClick={() => setIsDriveModalOpen(true)}
          disabled={!driveAvailable || driveImporting}
          className="flex-1 gap-2"
        >
          {driveImporting ? <Loader2 className="h-4 w-4 animate-spin" /> : <HardDrive className="h-4 w-4" />}
          {driveImporting ? 'Importando...' : 'Google Drive'}
        </Button>
      </div>

      {driveStatus !== 'available' && (
        <p className="rounded-md border border-dashed border-border/60 bg-muted/40 p-2 text-xs text-muted-foreground">
          {driveStatusMessage ?? 'Integração do Google Drive indisponível no momento.'}
        </p>
      )}

      <div className="rounded-md border border-dashed border-border/60 bg-muted/40 p-3 text-xs text-muted-foreground">
        <p className="mb-1 font-medium">Formatos suportados:</p>
        <ul className="ml-4 list-disc space-y-0.5">
          <li>MP4 (recomendado)</li>
          <li>WebM</li>
          <li>MOV (QuickTime)</li>
        </ul>
        <p className="mt-2 text-xs">Tamanho máximo: 100MB</p>
      </div>

      <ScrollArea className="flex-1">
        <div className="space-y-2 pr-2">
          {uploadedVideos.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-border/60 bg-muted/30 p-6 text-center">
              <Film className="h-8 w-8 text-muted-foreground" />
              <p className="text-xs text-muted-foreground">Nenhum vídeo carregado ainda</p>
              <p className="text-xs text-muted-foreground/70">Faça upload para começar</p>
            </div>
          ) : (
            uploadedVideos.map((video) => (
              <div
                key={video.id}
                className="flex items-center gap-3 rounded-lg border border-border/40 bg-muted/30 p-3"
              >
                <div className="flex h-10 w-10 items-center justify-center rounded bg-primary/10 text-primary">
                  <Play className="h-5 w-5" />
                </div>
                <div className="flex-1 space-y-1">
                  <p className="truncate text-xs font-medium text-foreground">{video.name}</p>
                  <p className="text-[10px] text-muted-foreground">Vídeo carregado</p>
                </div>
                <Button size="sm" variant="outline" onClick={() => handleAddExistingVideo(video)}>
                  Usar
                </Button>
              </div>
            ))
          )}
        </div>
      </ScrollArea>

      <DesktopGoogleDriveModal
        open={isDriveModalOpen}
        onOpenChange={(open) => {
          if (!open) {
            setDriveImporting(false)
          }
          setIsDriveModalOpen(open)
        }}
        mode="videos"
        initialFolderId={projectDetails?.googleDriveFolderId ?? undefined}
        onSelect={handleDriveSelect}
      />
    </div>
  )
}
