'use client'

import * as React from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useQuery } from '@tanstack/react-query'
import { AlertCircle, Lock, Pencil, Plus, Tag, Wand2 } from 'lucide-react'
import { toast } from 'sonner'

import { api } from '@/lib/api-client'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { TagInput } from '@/components/projects/tag-input'
import { useUpdateTemplatePageTags } from '@/hooks/use-template-page-tags'
import { useCreateModelo } from '@/hooks/use-create-modelo'

const SUGGESTED_THEME_TAGS = [
  'almoco-executivo',
  'almoco',
  'happy-hour',
  'jantar',
  'delivery',
  'abertura',
  'funcionamento',
  'cardapio',
  'bebidas',
  'chapas',
  'desejo',
  'promocao',
  'novidade',
  'evento',
]

const MODELO_DIMENSIONS: Record<'STORY' | 'FEED' | 'SQUARE', string> = {
  STORY: '1080x1920',
  FEED: '1080x1350',
  SQUARE: '1080x1080',
}

interface CreateModeloDialogProps {
  projectId: number
  open: boolean
  onOpenChange: (open: boolean) => void
}

function CreateModeloDialog({
  projectId,
  open,
  onOpenChange,
}: CreateModeloDialogProps) {
  const router = useRouter()
  const createModelo = useCreateModelo(projectId)
  const [name, setName] = React.useState('')
  const [type, setType] = React.useState<'STORY' | 'FEED' | 'SQUARE'>('STORY')
  const [tags, setTags] = React.useState<string[]>([])

  const reset = () => {
    setName('')
    setType('STORY')
    setTags([])
  }

  const handleSubmit = async (action: 'create' | 'createAndOpen') => {
    if (!name.trim()) {
      toast.error('Dá um nome pro modelo')
      return
    }
    try {
      const created = await createModelo.mutateAsync({
        name: name.trim(),
        type,
        dimensions: MODELO_DIMENSIONS[type],
        tags,
      })
      toast.success('Modelo criado')
      onOpenChange(false)
      reset()
      if (action === 'createAndOpen') {
        router.push(
          `/templates/${created.templateId}/editor?pageId=${created.pageId}`,
        )
      }
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Erro ao criar modelo'
      toast.error(message)
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(value) => {
        if (!value) reset()
        onOpenChange(value)
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Criar modelo do zero</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="modelo-name">Nome</Label>
            <Input
              id="modelo-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Ex: Story Almoço Executivo"
              autoFocus
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="modelo-type">Formato</Label>
            <Select
              value={type}
              onValueChange={(value) =>
                setType(value as 'STORY' | 'FEED' | 'SQUARE')
              }
            >
              <SelectTrigger id="modelo-type">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="STORY">Story (9:16) — 1080x1920</SelectItem>
                <SelectItem value="FEED">Feed (4:5) — 1080x1350</SelectItem>
                <SelectItem value="SQUARE">Quadrado (1:1) — 1080x1080</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label>Tags de tema</Label>
            <TagInput
              value={tags}
              onChange={setTags}
              suggestions={SUGGESTED_THEME_TAGS}
              placeholder="almoco-executivo, happy-hour..."
            />
            <p className="text-xs text-muted-foreground">
              A skill /arte-rapida usa estas tags pra encontrar o modelo a partir
              da frase do usuário. Pode editar depois.
            </p>
          </div>
        </div>
        <DialogFooter className="gap-2 sm:gap-2">
          <Button
            variant="outline"
            onClick={() => handleSubmit('create')}
            disabled={createModelo.isPending}
          >
            Criar
          </Button>
          <Button
            onClick={() => handleSubmit('createAndOpen')}
            disabled={createModelo.isPending}
          >
            {createModelo.isPending ? 'Criando...' : 'Criar e abrir editor'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

interface ModelosTabProps {
  projectId: number
  canCurate: boolean
}

interface TemplateSummary {
  id: number
  name: string
  type: string
  thumbnailUrl: string | null
  createdAt: string
  _count?: { Page: number }
}

interface TemplatePage {
  id: string
  name: string
  templateId: number
  templateName: string | null
  thumbnail: string | null
  width: number
  height: number
  tags: string[]
  Template: { name: string; tags: string[] }
}

function PageTagEditor({
  page,
  projectId,
  canEdit,
}: {
  page: TemplatePage
  projectId: number
  canEdit: boolean
}) {
  const [draft, setDraft] = React.useState<string[]>(page.tags ?? [])
  const [dirty, setDirty] = React.useState(false)
  const updateMutation = useUpdateTemplatePageTags(projectId)

  React.useEffect(() => {
    setDraft(page.tags ?? [])
    setDirty(false)
  }, [page.tags])

  const handleChange = (next: string[]) => {
    setDraft(next)
    setDirty(true)
  }

  const handleSave = async () => {
    try {
      await updateMutation.mutateAsync({ pageId: page.id, tags: draft })
      toast.success('Tags atualizadas')
      setDirty(false)
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Erro ao salvar tags'
      toast.error(message)
    }
  }

  const handleReset = () => {
    setDraft(page.tags ?? [])
    setDirty(false)
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <Tag className="h-3 w-3" />
        <span>Tags de tema</span>
        {!canEdit && <Lock className="h-3 w-3" aria-label="Somente leitura" />}
      </div>
      <TagInput
        value={draft}
        onChange={handleChange}
        suggestions={SUGGESTED_THEME_TAGS}
        placeholder={canEdit ? 'almoco-executivo, happy-hour...' : 'Sem tags'}
        disabled={!canEdit}
      />
      {canEdit && dirty && (
        <div className="flex justify-end gap-2 pt-1">
          <Button size="sm" variant="ghost" onClick={handleReset}>
            Cancelar
          </Button>
          <Button
            size="sm"
            onClick={handleSave}
            disabled={updateMutation.isPending}
          >
            {updateMutation.isPending ? 'Salvando...' : 'Salvar tags'}
          </Button>
        </div>
      )}
    </div>
  )
}

function PageRow({
  page,
  projectId,
  canEdit,
}: {
  page: TemplatePage
  projectId: number
  canEdit: boolean
}) {
  return (
    <div className="flex flex-col md:flex-row gap-4 p-4 border-t border-border/40 first:border-t-0">
      <div className="flex-shrink-0 w-full md:w-32">
        <div className="relative aspect-[9/16] rounded-md overflow-hidden bg-muted">
          {page.thumbnail ? (
            <Image
              src={page.thumbnail}
              alt={page.name}
              fill
              className="object-cover"
              sizes="128px"
            />
          ) : (
            <div className="absolute inset-0 flex items-center justify-center text-muted-foreground">
              <Wand2 className="h-6 w-6" />
            </div>
          )}
        </div>
      </div>
      <div className="flex-1 space-y-3 min-w-0">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <p className="font-medium truncate">{page.name}</p>
            <p className="text-xs text-muted-foreground">
              {page.width} x {page.height}
            </p>
          </div>
          {canEdit && (
            <Link
              href={`/templates/${page.templateId}/editor?pageId=${page.id}`}
            >
              <Button size="sm" variant="outline">
                <Pencil className="h-3.5 w-3.5 mr-1.5" />
                Editar página
              </Button>
            </Link>
          )}
        </div>
        <PageTagEditor page={page} projectId={projectId} canEdit={canEdit} />
      </div>
    </div>
  )
}

export function ModelosTab({ projectId, canCurate }: ModelosTabProps) {
  const canEdit = canCurate
  const [createOpen, setCreateOpen] = React.useState(false)

  const templatesQuery = useQuery<TemplateSummary[]>({
    queryKey: ['templates', projectId],
    queryFn: () => api.get(`/api/projects/${projectId}/templates`),
    enabled: !Number.isNaN(projectId),
  })

  // Pages query: this endpoint returns ALL template pages in the project,
  // regardless of templateId in the URL — derived from the template's project.
  // We still need *a* templateId to call it, so pick the first available.
  const seedTemplateId = templatesQuery.data?.[0]?.id ?? 0
  const pagesQuery = useQuery<TemplatePage[]>({
    queryKey: ['template-pages', seedTemplateId],
    queryFn: () =>
      api.get<TemplatePage[]>(`/api/templates/${seedTemplateId}/template-pages`),
    enabled: seedTemplateId > 0,
    staleTime: 60_000,
  })

  if (templatesQuery.isLoading) {
    return (
      <div className="space-y-4">
        {Array.from({ length: 2 }).map((_, index) => (
          <Card key={index} className="p-6">
            <Skeleton className="h-5 w-48" />
            <Skeleton className="mt-4 h-32 w-full" />
          </Card>
        ))}
      </div>
    )
  }

  const templates = templatesQuery.data ?? []

  if (templates.length === 0) {
    return (
      <>
        <Card className="p-8 text-center space-y-4">
          <p className="text-sm text-muted-foreground">
            Este projeto ainda não tem modelos.
            {canEdit
              ? ' Crie um modelo do zero pra começar.'
              : ' Apenas o curador pode criar modelos.'}
          </p>
          {canEdit && (
            <div className="flex justify-center">
              <Button onClick={() => setCreateOpen(true)}>
                <Plus className="h-4 w-4 mr-1.5" />
                Criar modelo do zero
              </Button>
            </div>
          )}
        </Card>
        <CreateModeloDialog
          projectId={projectId}
          open={createOpen}
          onOpenChange={setCreateOpen}
        />
      </>
    )
  }

  const pagesByTemplate = (pagesQuery.data ?? []).reduce<Record<number, TemplatePage[]>>(
    (acc, page) => {
      const list = acc[page.templateId] ?? []
      list.push(page)
      acc[page.templateId] = list
      return acc
    },
    {},
  )

  return (
    <div className="space-y-6">
      {canEdit && (
        <div className="flex justify-end">
          <Button onClick={() => setCreateOpen(true)}>
            <Plus className="h-4 w-4 mr-1.5" />
            Criar modelo do zero
          </Button>
        </div>
      )}

      <Card className="p-4 border-dashed bg-muted/30">
        <div className="flex items-start gap-3">
          {canEdit ? (
            <Tag className="h-5 w-5 text-muted-foreground flex-shrink-0 mt-0.5" />
          ) : (
            <AlertCircle className="h-5 w-5 text-amber-500 flex-shrink-0 mt-0.5" />
          )}
          <div className="text-sm text-muted-foreground">
            <p className="font-medium text-foreground">
              Cure templates por tema para uso na geração rápida de criativos.
            </p>
            <p className="mt-1">
              {canEdit
                ? 'Adicione tags como “almoco-executivo”, “happy-hour” ou “delivery” em cada page. A skill /arte-rapida usa essas tags pra encontrar o template certo a partir de uma frase em PT.'
                : 'Modo somente leitura: apenas o dono do projeto ou um admin da organização podem editar tags. Se você é cirotrigo@gmail.com e este projeto é seu, peça pra migrar a posse no admin (Project.userId precisa bater com seu Clerk user ID atual) ou entre como admin de uma org que compartilha o projeto.'}
            </p>
          </div>
        </div>
      </Card>

      {templates.map((template) => {
        const pages = pagesByTemplate[template.id] ?? []
        return (
          <Card key={template.id} className="overflow-hidden">
            <div className="flex flex-wrap items-center justify-between gap-2 p-4 bg-muted/30">
              <div className="min-w-0">
                <p className="font-semibold truncate">{template.name}</p>
                <p className="text-xs text-muted-foreground">
                  {template.type} • {pages.length} page{pages.length === 1 ? '' : 's'}
                </p>
              </div>
            </div>

            {pagesQuery.isLoading ? (
              <div className="p-4">
                <Skeleton className="h-24 w-full" />
              </div>
            ) : pages.length === 0 ? (
              <div className="p-6 text-sm text-muted-foreground text-center">
                Sem pages neste template ainda.
              </div>
            ) : (
              pages.map((page) => (
                <PageRow
                  key={page.id}
                  page={page}
                  projectId={projectId}
                  canEdit={canEdit}
                />
              ))
            )}

            {template.type && pages.length > 0 && (
              <div className="px-4 py-3 bg-muted/30 border-t border-border/40 flex flex-wrap items-center gap-2 text-xs">
                <span className="text-muted-foreground">Tags em uso:</span>
                {Array.from(
                  new Set(pages.flatMap((page) => page.tags ?? [])),
                ).length === 0 ? (
                  <span className="text-muted-foreground italic">nenhuma</span>
                ) : (
                  Array.from(
                    new Set(pages.flatMap((page) => page.tags ?? [])),
                  ).map((tag) => (
                    <Badge key={tag} variant="outline" className="text-[11px]">
                      {tag}
                    </Badge>
                  ))
                )}
              </div>
            )}
          </Card>
        )
      })}

      <CreateModeloDialog
        projectId={projectId}
        open={createOpen}
        onOpenChange={setCreateOpen}
      />
    </div>
  )
}
