"use client"

import * as React from 'react'
import Image from 'next/image'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { Input } from '@/components/ui/input'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { useToast } from '@/hooks/use-toast'
import {
  Type,
  Image as ImageIcon,
  Files,
  Trash2,
  Save,
  Minus,
  ZoomIn,
  Layers,
  HardDrive,
  Loader2,
  BadgeCheck,
  Shapes,
  Upload,
  Copy,
  ClipboardPaste,
  Share2,
  Undo2,
  Redo2,
} from 'lucide-react'
import { useTemplateEditor, createDefaultLayer } from '@/contexts/template-editor-context'
import { useMultiPage } from '@/contexts/multi-page-context'
import { DesktopGoogleDriveModal } from '@/components/projects/google-drive-folder-selector'
import type { GoogleDriveItem } from '@/types/google-drive'
import { useProject } from '@/hooks/use-project'

interface EditorToolbarProps {
  onSave: () => void
  saving: boolean
}

interface LogoRecord {
  id: number
  name: string
  fileUrl: string
}

interface ElementRecord {
  id: number
  name: string
  fileUrl: string
  category: string | null
}

type DriveStatus = 'loading' | 'available' | 'unavailable'

const MAX_CANVAS_ASSET_RATIO = 0.6

export function EditorToolbar({ onSave, saving }: EditorToolbarProps) {
  const {
    addLayer,
    duplicateLayer,
    removeLayer,
    selectedLayerId,
    selectedLayerIds,
    design,
    zoom,
    zoomIn,
    zoomOut,
    dirty,
    projectId,
    copySelectedLayers,
    pasteLayers,
    undo,
    redo,
    canUndo,
    canRedo,
    exportDesign,
    isExporting,
  } = useTemplateEditor()
  const { pages, currentPageId } = useMultiPage()
  const { toast } = useToast()
  const queryClient = useQueryClient()

  const canvasWidth = design.canvas.width
  const canvasHeight = design.canvas.height

  const { data: project } = useProject(projectId)
  const driveFolderId =
    project?.googleDriveImagesFolderId ?? project?.googleDriveFolderId ?? null
  const driveFolderName =
    project?.googleDriveImagesFolderName ?? project?.googleDriveFolderName ?? null

  const [driveStatus, setDriveStatus] = React.useState<DriveStatus>('loading')
  const [driveStatusMessage, setDriveStatusMessage] = React.useState<string | null>(null)

  React.useEffect(() => {
    let active = true
    const checkDrive = async () => {
      try {
        const response = await fetch('/api/google-drive/test')
        if (!active) return
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
      } catch (_error) {
        console.warn('[EditorToolbar] Falha ao verificar Google Drive', _error)
        if (!active) return
        setDriveStatus('unavailable')
        setDriveStatusMessage('Não foi possível conectar ao Google Drive.')
      }
    }

    void checkDrive()
    return () => {
      active = false
    }
  }, [])

  const driveAvailable = driveStatus === 'available'

  const { data: logos = [], isLoading: loadingLogos } = useQuery<LogoRecord[]>({
    queryKey: ['template-editor', projectId, 'logos'],
    enabled: Number.isFinite(projectId),
    queryFn: async () => {
      const response = await fetch(`/api/projects/${projectId}/logos`)
      if (!response.ok) {
        throw new Error('Não foi possível carregar os logos do projeto.')
      }
      return response.json() as Promise<LogoRecord[]>
    },
  })

  const { data: elements = [], isLoading: loadingElements } = useQuery<ElementRecord[]>({
    queryKey: ['template-editor', projectId, 'elements'],
    enabled: Number.isFinite(projectId),
    queryFn: async () => {
      const response = await fetch(`/api/projects/${projectId}/elements`)
      if (!response.ok) {
        throw new Error('Não foi possível carregar os elementos do projeto.')
      }
      return response.json() as Promise<ElementRecord[]>
    },
  })

  // Gradient helpers
  const addFullCanvasGradient = React.useCallback(() => {
    const base = createDefaultLayer('gradient')
    const layer = {
      ...base,
      name: 'Gradiente',
      position: { x: 0, y: 0 },
      size: { width: canvasWidth, height: canvasHeight },
      style: {
        ...base.style,
        gradientType: 'linear' as const,
        gradientAngle: 180,
        gradientStops: [
          { id: '1', color: '#000000', position: 0, opacity: 1 },
          { id: '2', color: '#000000', position: 1, opacity: 0 },
        ],
      },
    }
    addLayer(layer)
  }, [addLayer, canvasWidth, canvasHeight])

  // Image insertion helpers
  const insertImageLayer = React.useCallback(
    (url: string, name?: string) => {
      const base = createDefaultLayer('image')
      const layer = {
        ...base,
        name: name ? `Imagem - ${name}` : 'Imagem',
        fileUrl: url,
        position: { x: 0, y: 0 },
        size: { width: canvasWidth, height: canvasHeight },
      style: {
        ...base.style,
        objectFit: 'cover' as const,
      },
    }
      addLayer(layer)
      toast({ title: 'Imagem adicionada', description: 'A imagem foi posicionada para preencher o canvas.' })
    },
    [addLayer, canvasWidth, canvasHeight, toast],
  )

  const insertLogoLayer = React.useCallback(
    (logo: LogoRecord) => {
      const base = createDefaultLayer('logo')
      const maxWidth = Math.round(canvasWidth * MAX_CANVAS_ASSET_RATIO)
      const width = Math.min(240, maxWidth)
      const height = Math.round(width * 0.45)
      const layer = {
        ...base,
        name: `Logo - ${logo.name}`,
        fileUrl: logo.fileUrl,
        size: { width, height },
        position: {
          x: Math.round((canvasWidth - width) / 2),
          y: Math.round((canvasHeight - height) / 2),
        },
      style: {
        ...base.style,
        objectFit: 'contain' as const,
      },
    }
      addLayer(layer)
      toast({ title: 'Logo adicionado', description: 'O logo foi inserido no centro do canvas.' })
    },
    [addLayer, canvasWidth, canvasHeight, toast],
  )

  const insertElementLayer = React.useCallback(
    (element: ElementRecord) => {
      const base = createDefaultLayer('element')
      const maxWidth = Math.round(canvasWidth * 0.5)
      const size = Math.min(200, maxWidth)
      const layer = {
        ...base,
        name: `Elemento - ${element.name}`,
        fileUrl: element.fileUrl,
        size: { width: size, height: size },
        position: {
          x: Math.round((canvasWidth - size) / 2),
          y: Math.round((canvasHeight - size) / 2),
        },
      style: {
        ...base.style,
        objectFit: 'contain' as const,
      },
    }
      addLayer(layer)
      toast({ title: 'Elemento adicionado', description: 'O elemento foi inserido no centro do canvas.' })
    },
    [addLayer, canvasWidth, canvasHeight, toast],
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

  // Image dialog state
  const [isImageDialogOpen, setIsImageDialogOpen] = React.useState(false)
  const [imageUrlInput, setImageUrlInput] = React.useState('')
  const [imageUploading, setImageUploading] = React.useState(false)
  const [imageDriveImporting, setImageDriveImporting] = React.useState(false)
  const [isDriveImageModalOpen, setIsDriveImageModalOpen] = React.useState(false)
  const imageFileInputRef = React.useRef<HTMLInputElement>(null)

  const handleImageFileChange = React.useCallback(
    async (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0]
      if (!file) return
      setImageUploading(true)
      try {
        const formData = new FormData()
        formData.append('file', file)
        const response = await fetch('/api/upload', {
          method: 'POST',
          body: formData,
        })
        if (!response.ok) {
          const message = await response.text()
          throw new Error(message || 'Falha ao enviar a imagem')
        }
        const payload = (await response.json()) as { url?: string; name?: string }
        if (!payload.url) {
          throw new Error('Resposta inválida do servidor de upload')
        }
        insertImageLayer(payload.url, payload.name ?? file.name)
        setIsImageDialogOpen(false)
      } catch (_error) {
        console.error('[EditorToolbar] Upload de imagem falhou', _error)
        toast({
          title: 'Erro ao enviar imagem',
          description: _error instanceof Error ? _error.message : 'Não foi possível enviar a imagem.',
          variant: 'destructive',
        })
      } finally {
        setImageUploading(false)
        if (event.target) event.target.value = ''
      }
    },
    [insertImageLayer, toast],
  )

  const handleAddImageFromUrl = React.useCallback(() => {
    if (!imageUrlInput.trim()) return
    insertImageLayer(imageUrlInput.trim())
    setImageUrlInput('')
    setIsImageDialogOpen(false)
  }, [imageUrlInput, insertImageLayer])

  const handleImageDriveSelect = React.useCallback(
    async (item: GoogleDriveItem | { id: string; name: string; kind: 'folder' }) => {
      if ('kind' in item && item.kind === 'folder') {
        toast({ title: 'Selecione um arquivo', description: 'Escolha uma imagem dentro da pasta.' })
        return
      }
      setImageDriveImporting(true)
      try {
        const uploaded = await importDriveFile(item.id)
        if (!uploaded.url) {
          throw new Error('Falha ao importar arquivo do Google Drive')
        }
        insertImageLayer(uploaded.url, uploaded.name ?? item.name)
        setIsDriveImageModalOpen(false)
        setIsImageDialogOpen(false)
      } catch (_error) {
        console.error('[EditorToolbar] Importação de imagem do Drive falhou', _error)
        toast({
          title: 'Erro ao importar do Drive',
          description: _error instanceof Error ? _error.message : 'Não foi possível copiar o arquivo.',
          variant: 'destructive',
        })
      } finally {
        setImageDriveImporting(false)
      }
    },
    [importDriveFile, insertImageLayer, toast],
  )

  // Logo dialog state
  const [isLogoDialogOpen, setIsLogoDialogOpen] = React.useState(false)
  const [logoUploading, setLogoUploading] = React.useState(false)
  const [logoDriveImporting, setLogoDriveImporting] = React.useState(false)
  const [isDriveLogoModalOpen, setIsDriveLogoModalOpen] = React.useState(false)
  const logoFileInputRef = React.useRef<HTMLInputElement>(null)

  const handleLogoUpload = React.useCallback(
    async (file: File) => {
      setLogoUploading(true)
      try {
        const formData = new FormData()
        formData.append('file', file)
        const response = await fetch(`/api/projects/${projectId}/logos`, {
          method: 'POST',
          body: formData,
        })
        if (!response.ok) {
          const message = await response.text()
          throw new Error(message || 'Falha ao enviar logo')
        }
        const payload = (await response.json()) as LogoRecord
        await queryClient.invalidateQueries({ queryKey: ['project-assets', projectId, 'logos'] })
        await queryClient.invalidateQueries({ queryKey: ['template-editor', projectId, 'logos'] })
        insertLogoLayer(payload)
        setIsLogoDialogOpen(false)
      } catch (_error) {
        console.error('[EditorToolbar] Upload de logo falhou', _error)
        toast({
          title: 'Erro ao enviar logo',
          description: _error instanceof Error ? _error.message : 'Não foi possível enviar o logo.',
          variant: 'destructive',
        })
      } finally {
        setLogoUploading(false)
      }
    },
    [insertLogoLayer, projectId, queryClient, toast],
  )

  const handleLogoFileChange = React.useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0]
      if (file) {
        void handleLogoUpload(file)
        event.target.value = ''
      }
    },
    [handleLogoUpload],
  )

  const handleLogoDriveSelect = React.useCallback(
    async (item: GoogleDriveItem | { id: string; name: string; kind: 'folder' }) => {
      if ('kind' in item && item.kind === 'folder') {
        toast({ title: 'Selecione um arquivo', description: 'Escolha um logo dentro da pasta.' })
        return
      }
      setLogoDriveImporting(true)
      try {
        const uploaded = await importDriveFile(item.id)
        if (!uploaded.url) {
          throw new Error('Falha ao importar arquivo do Google Drive')
        }
        const response = await fetch(`/api/projects/${projectId}/logos`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ url: uploaded.url, name: uploaded.name ?? item.name }),
        })
        if (!response.ok) {
          const message = await response.text()
          throw new Error(message || 'Falha ao registrar logo importado')
        }
        const payload = (await response.json()) as LogoRecord
        await queryClient.invalidateQueries({ queryKey: ['project-assets', projectId, 'logos'] })
        await queryClient.invalidateQueries({ queryKey: ['template-editor', projectId, 'logos'] })
        insertLogoLayer(payload)
        setIsDriveLogoModalOpen(false)
        setIsLogoDialogOpen(false)
      } catch (_error) {
        console.error('[EditorToolbar] Importação de logo do Drive falhou', _error)
        toast({
          title: 'Erro ao importar do Drive',
          description: _error instanceof Error ? _error.message : 'Não foi possível copiar o arquivo.',
          variant: 'destructive',
        })
      } finally {
        setLogoDriveImporting(false)
      }
    },
    [importDriveFile, insertLogoLayer, projectId, queryClient, toast],
  )

  // Element dialog state
  const [isElementDialogOpen, setIsElementDialogOpen] = React.useState(false)
  const [elementUploading, setElementUploading] = React.useState(false)
  const [elementDriveImporting, setElementDriveImporting] = React.useState(false)
  const [isDriveElementModalOpen, setIsDriveElementModalOpen] = React.useState(false)
  const elementFileInputRef = React.useRef<HTMLInputElement>(null)

  const handleElementUpload = React.useCallback(
    async (file: File) => {
      setElementUploading(true)
      try {
        const formData = new FormData()
        formData.append('file', file)
        const response = await fetch(`/api/projects/${projectId}/elements`, {
          method: 'POST',
          body: formData,
        })
        if (!response.ok) {
          const message = await response.text()
          throw new Error(message || 'Falha ao enviar elemento')
        }
        const payload = (await response.json()) as ElementRecord
        await queryClient.invalidateQueries({ queryKey: ['project-assets', projectId, 'elements'] })
        await queryClient.invalidateQueries({ queryKey: ['template-editor', projectId, 'elements'] })
        insertElementLayer(payload)
        setIsElementDialogOpen(false)
      } catch (_error) {
        console.error('[EditorToolbar] Upload de elemento falhou', _error)
        toast({
          title: 'Erro ao enviar elemento',
          description: _error instanceof Error ? _error.message : 'Não foi possível enviar o elemento.',
          variant: 'destructive',
        })
      } finally {
        setElementUploading(false)
      }
    },
    [insertElementLayer, projectId, queryClient, toast],
  )

  const handleElementFileChange = React.useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0]
      if (file) {
        void handleElementUpload(file)
        event.target.value = ''
      }
    },
    [handleElementUpload],
  )

  const handleElementDriveSelect = React.useCallback(
    async (item: GoogleDriveItem | { id: string; name: string; kind: 'folder' }) => {
      if ('kind' in item && item.kind === 'folder') {
        toast({ title: 'Selecione um arquivo', description: 'Escolha um elemento dentro da pasta.' })
        return
      }
      setElementDriveImporting(true)
      try {
        const uploaded = await importDriveFile(item.id)
        if (!uploaded.url) {
          throw new Error('Falha ao importar arquivo do Google Drive')
        }
        const response = await fetch(`/api/projects/${projectId}/elements`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ url: uploaded.url, name: uploaded.name ?? item.name }),
        })
        if (!response.ok) {
          const message = await response.text()
          throw new Error(message || 'Falha ao registrar elemento importado')
        }
        const payload = (await response.json()) as ElementRecord
        await queryClient.invalidateQueries({ queryKey: ['project-assets', projectId, 'elements'] })
        await queryClient.invalidateQueries({ queryKey: ['template-editor', projectId, 'elements'] })
        insertElementLayer(payload)
        setIsDriveElementModalOpen(false)
        setIsElementDialogOpen(false)
      } catch (_error) {
        console.error('[EditorToolbar] Importação de elemento do Drive falhou', _error)
        toast({
          title: 'Erro ao importar do Drive',
          description: _error instanceof Error ? _error.message : 'Não foi possível copiar o arquivo.',
          variant: 'destructive',
        })
      } finally {
        setElementDriveImporting(false)
      }
    },
    [importDriveFile, insertElementLayer, projectId, queryClient, toast],
  )

  const handleDuplicate = React.useCallback(() => {
    if (selectedLayerId) duplicateLayer(selectedLayerId)
  }, [duplicateLayer, selectedLayerId])

  const handleRemove = React.useCallback(() => {
    if (selectedLayerId) removeLayer(selectedLayerId)
  }, [removeLayer, selectedLayerId])

  const handleCopy = React.useCallback(() => {
    if (selectedLayerIds.length === 0) return
    copySelectedLayers()
    toast({
      title: 'Layers copiadas',
      description: `${selectedLayerIds.length} camada(s) adicionadas à área de transferência.`,
    })
  }, [copySelectedLayers, selectedLayerIds.length, toast])

  const handlePaste = React.useCallback(() => {
    pasteLayers()
    toast({
      title: 'Layers coladas',
      description: 'As camadas copiadas foram inseridas no canvas.',
    })
  }, [pasteLayers, toast])

  const handleExport = React.useCallback(async () => {
    try {
      // Encontrar nome da página atual
      const currentPage = pages.find((p) => p.id === currentPageId)
      await exportDesign('jpeg', currentPage?.name)
      toast({
        title: 'Criativo salvo com sucesso!',
        description: 'O criativo foi salvo e está disponível na biblioteca.',
      })
    } catch (_error) {
      console.error('Export failed:', _error)
      toast({
        title: 'Erro ao salvar criativo',
        description: _error instanceof Error ? _error.message : 'Não foi possível salvar o criativo.',
        variant: 'destructive',
      })
    }
  }, [exportDesign, pages, currentPageId, toast])

  const handleShare = React.useCallback(() => {
    toast({
      title: 'Compartilhar',
      description: 'Compartilhamento será habilitado em breve. Envie o link do projeto para colaboradores.',
    })
  }, [toast])

  return (
    <>
      <input ref={imageFileInputRef} type="file" accept="image/*" className="hidden" onChange={handleImageFileChange} />
      <input ref={logoFileInputRef} type="file" accept="image/*" className="hidden" onChange={handleLogoFileChange} />
      <input ref={elementFileInputRef} type="file" accept="image/*" className="hidden" onChange={handleElementFileChange} />

      <div className="space-y-3 rounded-xl border border-border/50 bg-card/60 p-4 shadow-lg">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <Button size="sm" onClick={onSave} disabled={saving || !dirty} className="shadow-sm">
              <Save className="mr-2 h-4 w-4" />
              {saving ? 'Salvando…' : dirty ? 'Salvar Template' : 'Salvo'}
            </Button>
            <Button size="sm" variant="outline" onClick={handleExport} disabled={isExporting} className="shadow-sm">
              {isExporting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Salvando...
                </>
              ) : (
                <>
                  <Save className="mr-2 h-4 w-4" />
                  Salvar Criativo
                </>
              )}
            </Button>
            <Button size="sm" variant="ghost" onClick={handleShare} className="shadow-sm">
              <Share2 className="mr-2 h-4 w-4" /> Compartilhar
            </Button>
            {dirty && <span className="rounded-full bg-destructive/10 px-3 py-1 text-[11px] font-semibold uppercase text-destructive">Não salvo</span>}
          </div>
          <div className="flex items-center gap-3 text-xs text-muted-foreground">
            <span className="hidden sm:block">{canvasWidth} × {canvasHeight}</span>
            <div className="flex items-center gap-1">
              <Button size="icon" variant="ghost" onClick={zoomOut}>
                <Minus className="h-4 w-4" />
              </Button>
              <span className="w-12 text-center font-medium text-foreground">{Math.round(zoom * 100)}%</span>
              <Button size="icon" variant="ghost" onClick={zoomIn}>
                <ZoomIn className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 border-t border-border/40 pt-3">
          <Button size="sm" variant="outline" onClick={() => addLayer(createDefaultLayer('text'))}>
            <Type className="mr-2 h-4 w-4" /> Texto
          </Button>

          <Button size="sm" variant="outline" onClick={addFullCanvasGradient}>
            <Layers className="mr-2 h-4 w-4" /> Gradiente
          </Button>

          <Dialog open={isImageDialogOpen} onOpenChange={setIsImageDialogOpen}>
            <DialogTrigger asChild>
              <Button size="sm" variant="outline">
                <ImageIcon className="mr-2 h-4 w-4" /> Imagem
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-md">
              <DialogHeader>
                <DialogTitle>Adicionar imagem ao canvas</DialogTitle>
                <DialogDescription>
                  A imagem será ajustada automaticamente para preencher todo o canvas.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4">
                <div className="grid gap-3">
                  <Button onClick={() => imageFileInputRef.current?.click()} disabled={imageUploading}>
                    {imageUploading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Upload className="mr-2 h-4 w-4" />}
                    {imageUploading ? 'Enviando...' : 'Selecionar do computador'}
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => setIsDriveImageModalOpen(true)}
                    disabled={!driveAvailable || imageDriveImporting}
                  >
                    {imageDriveImporting ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : (
                      <HardDrive className="mr-2 h-4 w-4" />
                    )}
                    {imageDriveImporting ? 'Importando...' : 'Importar do Google Drive'}
                  </Button>
                  {driveStatus === 'loading' && (
                    <p className="text-xs text-muted-foreground">Verificando integração do Google Drive...</p>
                  )}
                  {driveStatus === 'unavailable' && (
                    <p className="text-xs text-destructive">{driveStatusMessage ?? 'Integração do Google Drive indisponível.'}</p>
                  )}
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-medium text-muted-foreground" htmlFor="image-url-input">
                    Ou informe uma URL pública
                  </label>
                  <Input
                    id="image-url-input"
                    value={imageUrlInput}
                    onChange={(event) => setImageUrlInput(event.target.value)}
                    placeholder="https://exemplo.com/imagem.png"
                  />
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setIsImageDialogOpen(false)}>
                  Cancelar
                </Button>
                <Button onClick={handleAddImageFromUrl} disabled={!imageUrlInput.trim()}>
                  Adicionar por URL
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          <Dialog open={isLogoDialogOpen} onOpenChange={setIsLogoDialogOpen}>
            <DialogTrigger asChild>
              <Button size="sm" variant="outline">
                <BadgeCheck className="mr-2 h-4 w-4" /> Logo
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-lg">
              <DialogHeader>
                <DialogTitle>Adicionar logo</DialogTitle>
                <DialogDescription>
                  Utilize um logo existente do projeto ou envie um novo arquivo.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4">
                <div className="grid gap-3">
                  <Button onClick={() => logoFileInputRef.current?.click()} disabled={logoUploading}>
                    {logoUploading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Upload className="mr-2 h-4 w-4" />}
                    {logoUploading ? 'Enviando...' : 'Enviar novo logo'}
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => setIsDriveLogoModalOpen(true)}
                    disabled={!driveAvailable || logoDriveImporting}
                  >
                    {logoDriveImporting ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : (
                      <HardDrive className="mr-2 h-4 w-4" />
                    )}
                    {logoDriveImporting ? 'Importando...' : 'Copiar do Google Drive'}
                  </Button>
                </div>
                <div className="space-y-2">
                  <p className="text-xs font-semibold uppercase text-muted-foreground">Logos do projeto</p>
                  {loadingLogos ? (
                    <p className="text-xs text-muted-foreground">Carregando logos...</p>
                  ) : logos.length > 0 ? (
                    <div className="grid gap-3 sm:grid-cols-2">
                      {logos.map((logo) => (
                        <button
                          key={logo.id}
                          type="button"
                          onClick={() => {
                            insertLogoLayer(logo)
                            setIsLogoDialogOpen(false)
                          }}
                          className="group overflow-hidden rounded-lg border border-border/40 transition hover:border-primary"
                        >
                          <div className="relative aspect-video bg-muted">
                            <Image src={logo.fileUrl} alt={logo.name} fill className="object-contain" />
                          </div>
                          <div className="px-3 py-2 text-left text-xs font-medium">
                            <span className="truncate block">{logo.name}</span>
                          </div>
                        </button>
                      ))}
                    </div>
                  ) : (
                    <p className="text-xs text-muted-foreground">Nenhum logo cadastrado até o momento.</p>
                  )}
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setIsLogoDialogOpen(false)}>
                  Fechar
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          <Dialog open={isElementDialogOpen} onOpenChange={setIsElementDialogOpen}>
            <DialogTrigger asChild>
              <Button size="sm" variant="outline">
                <Shapes className="mr-2 h-4 w-4" /> Elemento
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-lg">
              <DialogHeader>
                <DialogTitle>Adicionar elemento gráfico</DialogTitle>
                <DialogDescription>
                  Reaproveite elementos cadastrados no projeto ou faça upload de um novo arquivo.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4">
                <div className="grid gap-3">
                  <Button onClick={() => elementFileInputRef.current?.click()} disabled={elementUploading}>
                    {elementUploading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Upload className="mr-2 h-4 w-4" />}
                    {elementUploading ? 'Enviando...' : 'Enviar novo elemento'}
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => setIsDriveElementModalOpen(true)}
                    disabled={!driveAvailable || elementDriveImporting}
                  >
                    {elementDriveImporting ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : (
                      <HardDrive className="mr-2 h-4 w-4" />
                    )}
                    {elementDriveImporting ? 'Importando...' : 'Copiar do Google Drive'}
                  </Button>
                </div>
                <div className="space-y-2">
                  <p className="text-xs font-semibold uppercase text-muted-foreground">Elementos do projeto</p>
                  {loadingElements ? (
                    <p className="text-xs text-muted-foreground">Carregando elementos...</p>
                  ) : elements.length > 0 ? (
                    <div className="grid gap-3 sm:grid-cols-2">
                      {elements.map((element) => (
                        <button
                          key={element.id}
                          type="button"
                          onClick={() => {
                            insertElementLayer(element)
                            setIsElementDialogOpen(false)
                          }}
                          className="group overflow-hidden rounded-lg border border-border/40 transition hover:border-primary"
                        >
                          <div className="relative aspect-square bg-muted">
                            <Image src={element.fileUrl} alt={element.name} fill className="object-contain" />
                          </div>
                          <div className="px-3 py-2 text-left text-xs font-medium">
                            <span className="truncate block">{element.name}</span>
                            {element.category && (
                              <span className="text-muted-foreground">{element.category}</span>
                            )}
                          </div>
                        </button>
                      ))}
                    </div>
                  ) : (
                    <p className="text-xs text-muted-foreground">Nenhum elemento cadastrado até o momento.</p>
                  )}
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setIsElementDialogOpen(false)}>
                  Fechar
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          <TooltipProvider>
            <div className="flex items-center gap-1 border-l border-border/40 pl-2">
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
              <Tooltip>
                <TooltipTrigger asChild>
                  <span>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={handleCopy}
                      disabled={selectedLayerIds.length === 0}
                    >
                      <Copy className="h-4 w-4" />
                    </Button>
                  </span>
                </TooltipTrigger>
                <TooltipContent>Copiar layers (⌘/Ctrl + C)</TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <span>
                    <Button size="sm" variant="ghost" onClick={handlePaste}>
                      <ClipboardPaste className="h-4 w-4" />
                    </Button>
                  </span>
                </TooltipTrigger>
                <TooltipContent>Colar layers (⌘/Ctrl + V)</TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <span>
                    <Button size="sm" variant="ghost" onClick={undo} disabled={!canUndo}>
                      <Undo2 className="h-4 w-4" />
                    </Button>
                  </span>
                </TooltipTrigger>
                <TooltipContent>Desfazer (⌘/Ctrl + Z)</TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <span>
                    <Button size="sm" variant="ghost" onClick={redo} disabled={!canRedo}>
                      <Redo2 className="h-4 w-4" />
                    </Button>
                  </span>
                </TooltipTrigger>
                <TooltipContent>Refazer (⌘/Ctrl + Shift + Z)</TooltipContent>
              </Tooltip>
            </div>
          </TooltipProvider>
        </div>
      </div>

      <DesktopGoogleDriveModal
        open={isDriveImageModalOpen}
        onOpenChange={(open) => {
          if (!open) {
            setImageDriveImporting(false)
          }
          setIsDriveImageModalOpen(open)
        }}
        mode="images"
        initialFolderId={driveFolderId ?? undefined}
        initialFolderName={driveFolderName ?? undefined}
        onSelect={handleImageDriveSelect}
      />

      <DesktopGoogleDriveModal
        open={isDriveLogoModalOpen}
        onOpenChange={(open) => {
          if (!open) {
            setLogoDriveImporting(false)
          }
          setIsDriveLogoModalOpen(open)
        }}
        mode="images"
        initialFolderId={driveFolderId ?? undefined}
        initialFolderName={driveFolderName ?? undefined}
        onSelect={handleLogoDriveSelect}
      />

      <DesktopGoogleDriveModal
        open={isDriveElementModalOpen}
        onOpenChange={(open) => {
          if (!open) {
            setElementDriveImporting(false)
          }
          setIsDriveElementModalOpen(open)
        }}
        mode="images"
        initialFolderId={driveFolderId ?? undefined}
        initialFolderName={driveFolderName ?? undefined}
        onSelect={handleElementDriveSelect}
      />
    </>
  )
}
