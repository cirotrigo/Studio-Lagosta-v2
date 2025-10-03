"use client"

import * as React from 'react'
import Image from 'next/image'
import { useQuery } from '@tanstack/react-query'
import { HardDrive, Loader2, Search } from 'lucide-react'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { useTemplateEditor, createDefaultLayer } from '@/contexts/template-editor-context'
import { useToast } from '@/hooks/use-toast'
import { DesktopGoogleDriveModal } from '@/components/projects/google-drive-folder-selector'
import type { GoogleDriveItem } from '@/types/google-drive'
import { useProject } from '@/hooks/use-project'

interface LogoRecord {
  id: number
  name: string
  fileUrl: string
}

interface ElementRecord {
  id: number
  name: string
  category: string | null
  fileUrl: string
}

type DriveStatus = 'loading' | 'available' | 'unavailable'

export function ImagesPanel() {
  const { addLayer, projectId, design } = useTemplateEditor()
  const { toast } = useToast()
  const [search, setSearch] = React.useState('')
  const [isDriveModalOpen, setIsDriveModalOpen] = React.useState(false)
  const [driveImporting, setDriveImporting] = React.useState(false)
  const [driveStatus, setDriveStatus] = React.useState<DriveStatus>('loading')
  const [driveStatusMessage, setDriveStatusMessage] = React.useState<string | null>(null)
  const { data: projectDetails } = useProject(projectId)

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
        console.warn('[ImagesPanel] Falha ao verificar Google Drive', error)
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

  const { data: logos = [], isLoading: loadingLogos } = useQuery<LogoRecord[]>({
    queryKey: ['template-editor', projectId, 'logos'],
    enabled: Number.isFinite(projectId),
    queryFn: async () => {
      const response = await fetch(`/api/projects/${projectId}/logos`)
      if (!response.ok) {
        throw new Error('Não foi possível carregar logos do projeto.')
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
        throw new Error('Não foi possível carregar elementos do projeto.')
      }
      return response.json() as Promise<ElementRecord[]>
    },
  })

  const driveAvailable = driveStatus === 'available'
  const canvasWidth = design.canvas.width
  const canvasHeight = design.canvas.height

  const insertImageLayer = React.useCallback(
    (url: string, name?: string) => {
      const base = createDefaultLayer('image')
      addLayer({
        ...base,
        name: name ? `Imagem - ${name}` : 'Imagem',
        fileUrl: url,
        position: { x: 0, y: 0 },
        size: { width: canvasWidth, height: canvasHeight },
        style: {
          ...base.style,
          objectFit: 'cover' as const,
        },
      })
      toast({ title: 'Imagem adicionada', description: 'A imagem foi posicionada para preencher o canvas.' })
    },
    [addLayer, canvasHeight, canvasWidth, toast],
  )

  const insertLogoLayer = React.useCallback(
    (record: LogoRecord) => {
      const base = createDefaultLayer('logo')
      const maxWidth = Math.round(canvasWidth * 0.6)
      const width = Math.min(240, maxWidth)
      const height = Math.round(width * 0.45)
      addLayer({
        ...base,
        name: `Logo - ${record.name}`,
        fileUrl: record.fileUrl,
        size: { width, height },
        position: {
          x: Math.round((canvasWidth - width) / 2),
          y: Math.round((canvasHeight - height) / 2),
        },
        style: {
          ...base.style,
          objectFit: 'contain' as const,
        },
      })
      toast({ title: 'Logo adicionado', description: 'O logo foi inserido no centro do canvas.' })
    },
    [addLayer, canvasHeight, canvasWidth, toast],
  )

  const insertElementLayer = React.useCallback(
    (record: ElementRecord) => {
      const base = createDefaultLayer('element')
      const maxSize = Math.round(canvasWidth * 0.4)
      const size = Math.max(180, Math.min(260, maxSize))
      addLayer({
        ...base,
        name: `Elemento - ${record.name}`,
        fileUrl: record.fileUrl,
        size: { width: size, height: size },
        position: {
          x: Math.round((canvasWidth - size) / 2),
          y: Math.round((canvasHeight - size) / 2),
        },
        style: {
          ...base.style,
          objectFit: 'contain' as const,
        },
      })
      toast({ title: 'Elemento adicionado', description: 'O elemento foi inserido no centro do canvas.' })
    },
    [addLayer, canvasHeight, canvasWidth, toast],
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
        toast({ title: 'Selecione um arquivo', description: 'Escolha uma imagem dentro da pasta.' })
        return
      }
      setDriveImporting(true)
      try {
        const uploaded = await importDriveFile(item.id)
        if (!uploaded.url) {
          throw new Error('Falha ao importar arquivo do Google Drive')
        }
        insertImageLayer(uploaded.url, uploaded.name ?? item.name)
        setIsDriveModalOpen(false)
      } catch (error) {
        console.error('[ImagesPanel] Falha ao importar do Drive', error)
        toast({
          title: 'Erro ao importar do Drive',
          description: error instanceof Error ? error.message : 'Não foi possível copiar o arquivo.',
          variant: 'destructive',
        })
      } finally {
        setDriveImporting(false)
      }
    },
    [importDriveFile, insertImageLayer, toast],
  )

  const filteredLogos = React.useMemo(() => {
    if (!search.trim()) return logos
    const query = search.trim().toLowerCase()
    return logos.filter((item) => item.name.toLowerCase().includes(query))
  }, [logos, search])

  const filteredElements = React.useMemo(() => {
    if (!search.trim()) return elements
    const query = search.trim().toLowerCase()
    return elements.filter((item) => item.name.toLowerCase().includes(query))
  }, [elements, search])

  return (
    <div className="flex h-full min-h-[400px] flex-col gap-3 rounded-lg border border-border/40 bg-card/60 p-4 shadow-sm">
      <div className="space-y-2">
        <h3 className="text-sm font-semibold">Imagens do projeto</h3>
        <p className="text-xs text-muted-foreground">Utilize arquivos enviados anteriormente ou copie novos itens do Google Drive.</p>
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <Input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Buscar por nome..."
              className="pl-8"
            />
            <Search className="absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setIsDriveModalOpen(true)}
            disabled={!driveAvailable || driveImporting}
          >
            {driveImporting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <HardDrive className="mr-2 h-4 w-4" />}
            {driveImporting ? 'Importando...' : 'Google Drive'}
          </Button>
        </div>
        {driveStatus !== 'available' && (
          <p className="rounded-md border border-dashed border-border/60 bg-muted/40 p-2 text-xs text-muted-foreground">
            {driveStatusMessage ?? 'Integração do Google Drive indisponível no momento.'}
          </p>
        )}
      </div>

      <ScrollArea className="flex-1">
        <div className="space-y-4 pr-2">
          <Section
            title="Logos"
            loading={loadingLogos}
            emptyMessage="Nenhum logo adicionado ao projeto ainda."
          >
            {filteredLogos.map((logo) => (
              <AssetCard
                key={`logo-${logo.id}`}
                name={logo.name}
                url={logo.fileUrl}
                onAdd={() => insertLogoLayer(logo)}
              />
            ))}
          </Section>

          <Section
            title="Elementos"
            loading={loadingElements}
            emptyMessage="Nenhum elemento cadastrado ainda."
          >
            {filteredElements.map((element) => (
              <AssetCard
                key={`element-${element.id}`}
                name={element.name}
                url={element.fileUrl}
                onAdd={() => insertElementLayer(element)}
              />
            ))}
          </Section>
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
        mode="images"
        initialFolderId={projectDetails?.googleDriveFolderId ?? undefined}
        onSelect={handleDriveSelect}
      />
    </div>
  )
}

function Section({
  title,
  loading,
  emptyMessage,
  children,
}: {
  title: string
  loading: boolean
  emptyMessage: string
  children: React.ReactNode
}) {
  return (
    <div className="space-y-3">
      <h4 className="text-xs font-semibold uppercase text-muted-foreground">{title}</h4>
      {loading ? (
        <div className="grid gap-3 md:grid-cols-2">
          {Array.from({ length: 4 }).map((_, index) => (
            <Skeleton key={`asset-skeleton-${index}`} className="h-28 w-full" />
          ))}
        </div>
      ) : React.Children.count(children) === 0 ? (
        <div className="rounded-lg border border-dashed border-border/60 bg-muted/30 p-3 text-center text-xs text-muted-foreground">
          {emptyMessage}
        </div>
      ) : (
        <div className="grid gap-3 md:grid-cols-2">{children}</div>
      )}
    </div>
  )
}

function AssetCard({ name, url, onAdd }: { name: string; url: string; onAdd: () => void }) {
  return (
    <div className="flex overflow-hidden rounded-lg border border-border/40 bg-muted/30">
      <div className="relative h-24 w-24">
        <Image src={url} alt={name} fill sizes="96px" className="object-cover" unoptimized />
      </div>
      <div className="flex flex-1 flex-col justify-between p-3 text-xs">
        <p className="truncate font-medium text-foreground">{name}</p>
        <Button size="sm" variant="outline" onClick={onAdd}>
          Usar no canvas
        </Button>
      </div>
    </div>
  )
}
