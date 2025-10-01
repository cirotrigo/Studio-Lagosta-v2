"use client"

import * as React from 'react'
import Image from 'next/image'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import { Switch } from '@/components/ui/switch'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { useToast } from '@/hooks/use-toast'
import { cn } from '@/lib/utils'
import { Download, Trash2, Upload } from 'lucide-react'

interface LogoRecord {
  id: number
  name: string
  fileUrl: string
  projectId: number
  uploadedBy: string
  createdAt: string
}

interface ElementRecord {
  id: number
  name: string
  category: string | null
  fileUrl: string
  projectId: number
  uploadedBy: string
  createdAt: string
}

interface FontRecord {
  id: number
  name: string
  fontFamily: string
  fileUrl: string
  projectId: number
  uploadedBy: string
  createdAt: string
}

function formatDateRelative(iso: string) {
  const date = new Date(iso)
  return new Intl.DateTimeFormat('pt-BR', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date)
}

export function ProjectAssetsPanel({ projectId }: { projectId: number }) {
  return (
    <div className="space-y-8">
      <LogoSection projectId={projectId} />
      <ElementSection projectId={projectId} />
      <FontSection projectId={projectId} />
    </div>
  )
}

function LogoSection({ projectId }: { projectId: number }) {
  const { toast } = useToast()
  const queryClient = useQueryClient()
  const fileInputRef = React.useRef<HTMLInputElement>(null)

  const { data: logos, isLoading } = useQuery<LogoRecord[]>({
    queryKey: ['project-assets', projectId, 'logos'],
    queryFn: () => fetch(`/api/projects/${projectId}/logos`).then((res) => {
      if (!res.ok) throw new Error('Falha ao carregar logos')
      return res.json()
    }),
  })

  const uploadLogo = useMutation({
    mutationFn: async (file: File) => {
      const formData = new FormData()
      formData.append('file', file)
      const response = await fetch(`/api/projects/${projectId}/logos`, {
        method: 'POST',
        body: formData,
      })
      if (!response.ok) {
        const message = await response.text()
        throw new Error(message || 'Falha no upload do logo')
      }
      return response.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['project-assets', projectId, 'logos'] })
      toast({ title: 'Logo enviado', description: 'O logo foi adicionado ao projeto.' })
    },
    onError: (error: unknown) => {
      toast({
        title: 'Erro ao enviar logo',
        description: error instanceof Error ? error.message : 'Tente novamente mais tarde.',
        variant: 'destructive',
      })
    },
  })

  const deleteLogo = useMutation({
    mutationFn: async (logoId: number) => {
      const response = await fetch(`/api/projects/${projectId}/logos/${logoId}`, {
        method: 'DELETE',
      })
      if (!response.ok) {
        const message = await response.text()
        throw new Error(message || 'Falha ao remover logo')
      }
      return response.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['project-assets', projectId, 'logos'] })
      toast({ title: 'Logo removido', description: 'O logo foi deletado.' })
    },
    onError: (error: unknown) => {
      toast({
        title: 'Erro ao remover logo',
        description: error instanceof Error ? error.message : 'Não foi possível remover o logo.',
        variant: 'destructive',
      })
    },
  })

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (file) {
      uploadLogo.mutate(file)
      event.target.value = ''
    }
  }

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold">Logos</h2>
          <p className="text-sm text-muted-foreground">
            Armazene logos da marca para uso rápido nos templates.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={handleFileChange}
          />
          <Button
            onClick={() => fileInputRef.current?.click()}
            disabled={uploadLogo.isPending}
          >
            <Upload className="mr-2 h-4 w-4" /> {uploadLogo.isPending ? 'Enviando...' : 'Enviar logo'}
          </Button>
        </div>
      </div>

      {isLoading ? (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 6 }).map((_, idx) => (
            <Card key={idx} className="overflow-hidden">
              <Skeleton className="h-40 w-full" />
              <div className="p-3">
                <Skeleton className="h-4 w-1/2" />
              </div>
            </Card>
          ))}
        </div>
      ) : logos && logos.length > 0 ? (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {logos.map((logo) => (
            <Card key={logo.id} className="overflow-hidden border border-border/40 bg-card/70">
              <div className="relative h-40 w-full bg-muted">
                <Image
                  src={logo.fileUrl}
                  alt={logo.name}
                  fill
                  className="object-contain"
                />
              </div>
              <div className="flex items-center justify-between gap-2 p-4">
                <div>
                  <p className="font-medium text-sm truncate" title={logo.name}>{logo.name}</p>
                  <p className="text-xs text-muted-foreground">{formatDateRelative(logo.createdAt)}</p>
                </div>
                <div className="flex items-center gap-2">
                  <Button size="icon" variant="outline" onClick={() => window.open(logo.fileUrl, '_blank', 'noopener,noreferrer')}>
                    <Download className="h-4 w-4" />
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    onClick={() => deleteLogo.mutate(logo.id)}
                  >
                    <Trash2 className="h-4 w-4 text-red-500" />
                  </Button>
                </div>
              </div>
            </Card>
          ))}
        </div>
      ) : (
        <Card className="p-6 text-center text-sm text-muted-foreground">
          Nenhum logo cadastrado ainda. Envie o primeiro logo para este projeto.
        </Card>
      )}
    </section>
  )
}

function ElementSection({ projectId }: { projectId: number }) {
  const { toast } = useToast()
  const queryClient = useQueryClient()
  const fileInputRef = React.useRef<HTMLInputElement>(null)
  const [showCategories, setShowCategories] = React.useState(false)

  const { data: elements, isLoading } = useQuery<ElementRecord[]>({
    queryKey: ['project-assets', projectId, 'elements'],
    queryFn: () => fetch(`/api/projects/${projectId}/elements`).then((res) => {
      if (!res.ok) throw new Error('Falha ao carregar elementos')
      return res.json()
    }),
  })

  const uploadElement = useMutation({
    mutationFn: async (file: File) => {
      const formData = new FormData()
      formData.append('file', file)
      const response = await fetch(`/api/projects/${projectId}/elements`, {
        method: 'POST',
        body: formData,
      })
      if (!response.ok) {
        const message = await response.text()
        throw new Error(message || 'Falha no upload do elemento')
      }
      return response.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['project-assets', projectId, 'elements'] })
      toast({ title: 'Elemento enviado', description: 'O elemento foi adicionado ao projeto.' })
    },
    onError: (error: unknown) => {
      toast({
        title: 'Erro ao enviar elemento',
        description: error instanceof Error ? error.message : 'Tente novamente mais tarde.',
        variant: 'destructive',
      })
    },
  })

  const deleteElement = useMutation({
    mutationFn: async (elementId: number) => {
      const response = await fetch(`/api/projects/${projectId}/elements/${elementId}`, {
        method: 'DELETE',
      })
      if (!response.ok) {
        const message = await response.text()
        throw new Error(message || 'Falha ao remover elemento')
      }
      return response.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['project-assets', projectId, 'elements'] })
      toast({ title: 'Elemento removido', description: 'O elemento foi deletado.' })
    },
    onError: (error: unknown) => {
      toast({
        title: 'Erro ao remover elemento',
        description: error instanceof Error ? error.message : 'Não foi possível remover o elemento.',
        variant: 'destructive',
      })
    },
  })

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (file) {
      uploadElement.mutate(file)
      event.target.value = ''
    }
  }

  const categorized = React.useMemo(() => {
    if (!elements) return new Map<string, ElementRecord[]>()
    const map = new Map<string, ElementRecord[]>()
    elements.forEach((element) => {
      const key = element.category?.trim() || 'Sem categoria'
      const list = map.get(key) ?? []
      list.push(element)
      map.set(key, list)
    })
    return map
  }, [elements])

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold">Elementos Gráficos</h2>
          <p className="text-sm text-muted-foreground">
            Centralize ícones, ilustrações e shapes para reaproveitar nos templates.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Switch id="toggle-groups" checked={showCategories} onCheckedChange={setShowCategories} />
            <label htmlFor="toggle-groups">Agrupar por categoria</label>
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={handleFileChange}
          />
          <Button onClick={() => fileInputRef.current?.click()} disabled={uploadElement.isPending}>
            <Upload className="mr-2 h-4 w-4" /> {uploadElement.isPending ? 'Enviando...' : 'Adicionar elemento'}
          </Button>
        </div>
      </div>

      {isLoading ? (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 6 }).map((_, idx) => (
            <Card key={idx} className="p-4">
              <Skeleton className="mb-3 h-36 w-full" />
              <Skeleton className="h-4 w-1/2" />
            </Card>
          ))}
        </div>
      ) : elements && elements.length > 0 ? (
        showCategories ? (
          <div className="space-y-6">
            {[...categorized.entries()].map(([category, list]) => (
              <div key={category} className="space-y-3">
                <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">{category}</h3>
                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                  {list.map((element) => (
                    <Card key={element.id} className="overflow-hidden border border-border/40 bg-card/70">
                      <div className="relative h-36 w-full bg-muted">
                        <Image
                          src={element.fileUrl}
                          alt={element.name}
                          fill
                          className="object-contain"
                        />
                      </div>
                      <div className="flex items-center justify-between gap-2 p-4">
                        <div>
                          <p className="font-medium text-sm truncate" title={element.name}>{element.name}</p>
                          <p className="text-xs text-muted-foreground">{formatDateRelative(element.createdAt)}</p>
                        </div>
                        <div className="flex items-center gap-2">
                          <Button size="icon" variant="outline" onClick={() => window.open(element.fileUrl, '_blank', 'noopener,noreferrer')}>
                            <Download className="h-4 w-4" />
                          </Button>
                          <Button size="icon" variant="ghost" onClick={() => deleteElement.mutate(element.id)}>
                            <Trash2 className="h-4 w-4 text-red-500" />
                          </Button>
                        </div>
                      </div>
                    </Card>
                  ))}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {elements.map((element) => (
              <Card key={element.id} className="overflow-hidden border border-border/40 bg-card/70">
                <div className="relative h-36 w-full bg-muted">
                  <Image
                    src={element.fileUrl}
                    alt={element.name}
                    fill
                    className="object-contain"
                  />
                </div>
                <div className="flex items-center justify-between gap-2 p-4">
                  <div>
                    <p className="font-medium text-sm truncate" title={element.name}>{element.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {element.category ? `Categoria: ${element.category}` : 'Sem categoria'}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button size="icon" variant="outline" onClick={() => window.open(element.fileUrl, '_blank', 'noopener,noreferrer')}>
                      <Download className="h-4 w-4" />
                    </Button>
                    <Button size="icon" variant="ghost" onClick={() => deleteElement.mutate(element.id)}>
                      <Trash2 className="h-4 w-4 text-red-500" />
                    </Button>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        )
      ) : (
        <Card className="p-6 text-center text-sm text-muted-foreground">
          Nenhum elemento cadastrado. Faça upload de ícones ou ilustrações.
        </Card>
      )}
    </section>
  )
}

function FontSection({ projectId }: { projectId: number }) {
  const { toast } = useToast()
  const queryClient = useQueryClient()
  const [open, setOpen] = React.useState(false)
  const [fontFile, setFontFile] = React.useState<File | null>(null)
  const [fontFamily, setFontFamily] = React.useState('')
  const [displayName, setDisplayName] = React.useState('')

  const { data: fonts, isLoading } = useQuery<FontRecord[]>({
    queryKey: ['project-assets', projectId, 'fonts'],
    queryFn: () => fetch(`/api/projects/${projectId}/fonts`).then((res) => {
      if (!res.ok) throw new Error('Falha ao carregar fontes')
      return res.json()
    }),
  })

  const uploadFont = useMutation({
    mutationFn: async ({ file, family, name }: { file: File; family: string; name?: string }) => {
      const formData = new FormData()
      formData.append('file', file)
      formData.append('fontFamily', family)
      if (name) formData.append('name', name)
      const response = await fetch(`/api/projects/${projectId}/fonts`, {
        method: 'POST',
        body: formData,
      })
      if (!response.ok) {
        const message = await response.text()
        throw new Error(message || 'Falha no upload da fonte')
      }
      return response.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['project-assets', projectId, 'fonts'] })
      toast({ title: 'Fonte enviada', description: 'Fonte adicionada ao projeto.' })
      setOpen(false)
      setFontFile(null)
      setFontFamily('')
      setDisplayName('')
    },
    onError: (error: unknown) => {
      toast({
        title: 'Erro ao enviar fonte',
        description: error instanceof Error ? error.message : 'Tente novamente mais tarde.',
        variant: 'destructive',
      })
    },
  })

  const deleteFont = useMutation({
    mutationFn: async (fontId: number) => {
      const response = await fetch(`/api/projects/${projectId}/fonts/${fontId}`, {
        method: 'DELETE',
      })
      if (!response.ok) {
        const message = await response.text()
        throw new Error(message || 'Falha ao remover fonte')
      }
      return response.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['project-assets', projectId, 'fonts'] })
      toast({ title: 'Fonte removida', description: 'A fonte foi deletada.' })
    },
    onError: (error: unknown) => {
      toast({
        title: 'Erro ao remover fonte',
        description: error instanceof Error ? error.message : 'Não foi possível remover a fonte.',
        variant: 'destructive',
      })
    },
  })

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!fontFile || !fontFamily.trim()) {
      toast({ title: 'Preencha os campos obrigatórios', variant: 'destructive' })
      return
    }
    uploadFont.mutate({ file: fontFile, family: fontFamily.trim(), name: displayName.trim() || undefined })
  }

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold">Fontes customizadas</h2>
          <p className="text-sm text-muted-foreground">
            Envie fontes (.ttf, .otf) para utilizar nos templates e no editor.
          </p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button>
              <Upload className="mr-2 h-4 w-4" /> Adicionar fonte
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Upload de fonte</DialogTitle>
              <DialogDescription>
                Informe o nome da família exatamente como será utilizado nos templates.
              </DialogDescription>
            </DialogHeader>
            <form className="space-y-4" onSubmit={handleSubmit}>
              <div className="space-y-1">
                <Label htmlFor="fontFamily">Font family *</Label>
                <Input
                  id="fontFamily"
                  value={fontFamily}
                  onChange={(event) => setFontFamily(event.target.value)}
                  placeholder="Ex: Acme Sans"
                  required
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="fontName">Nome exibido (opcional)</Label>
                <Input
                  id="fontName"
                  value={displayName}
                  onChange={(event) => setDisplayName(event.target.value)}
                  placeholder="Ex: Acme Sans Regular"
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="fontFile">Arquivo da fonte *</Label>
                <Input
                  id="fontFile"
                  type="file"
                  accept=".ttf,.otf,.woff,.woff2"
                  onChange={(event) => setFontFile(event.target.files?.[0] ?? null)}
                  required
                />
              </div>
              <DialogFooter>
                <Button type="submit" disabled={uploadFont.isPending}>
                  {uploadFont.isPending ? 'Enviando...' : 'Enviar fonte'}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {isLoading ? (
        <div className="grid gap-3 md:grid-cols-2">
          {Array.from({ length: 4 }).map((_, idx) => (
            <Card key={idx} className="p-4">
              <Skeleton className="mb-3 h-6 w-1/2" />
              <Skeleton className="h-4 w-1/3" />
            </Card>
          ))}
        </div>
      ) : fonts && fonts.length > 0 ? (
        <div className="grid gap-3 md:grid-cols-2">
          {fonts.map((font) => (
            <Card key={font.id} className="flex items-center justify-between gap-3 border border-border/40 bg-card/70 p-4">
              <div>
                <p className="font-medium" style={{ fontFamily: font.fontFamily }}>{font.name}</p>
                <p className="text-xs text-muted-foreground">{font.fontFamily}</p>
                <p className="text-xs text-muted-foreground">{formatDateRelative(font.createdAt)}</p>
              </div>
              <div className="flex items-center gap-2">
                <Button size="icon" variant="outline" onClick={() => window.open(font.fileUrl, '_blank', 'noopener,noreferrer')}>
                  <Download className="h-4 w-4" />
                </Button>
                <Button size="icon" variant="ghost" onClick={() => deleteFont.mutate(font.id)}>
                  <Trash2 className="h-4 w-4 text-red-500" />
                </Button>
              </div>
            </Card>
          ))}
        </div>
      ) : (
        <Card className="p-6 text-center text-sm text-muted-foreground">
          Nenhuma fonte cadastrada. Envie fontes customizadas para ampliar suas opções no editor.
        </Card>
      )}
    </section>
  )
}
