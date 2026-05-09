'use client'

import * as React from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useQuery } from '@tanstack/react-query'
import { AlertCircle, Lock, Pencil, Plus, Settings2, Tag, Wand2 } from 'lucide-react'
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
} from '@/components/ui/dialog'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet'
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
import { ProjectTagsConfig } from '@/components/projects/project-tags-config'
import { useUpdateTemplatePageTags } from '@/hooks/use-template-page-tags'
import { useCreateModelo } from '@/hooks/use-create-modelo'
import { useProjectTags } from '@/hooks/use-project-tags'

const MODELO_DIMENSIONS: Record<'STORY' | 'FEED' | 'SQUARE', string> = {
  STORY: '1080x1920',
  FEED: '1080x1350',
  SQUARE: '1080x1080',
}

const UNTAGGED_KEY = '__untagged__'

interface ModelosTabProps {
  projectId: number
  canCurate: boolean
}

interface TemplateSummary {
  id: number
  name: string
  type: string
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

interface ProjectTagInfo {
  name: string
  color: string
}

// ─── Create dialog ──────────────────────────────────────────────────────

interface CreateModeloDialogProps {
  projectId: number
  open: boolean
  onOpenChange: (open: boolean) => void
  tagSuggestions: string[]
}

function CreateModeloDialog({
  projectId,
  open,
  onOpenChange,
  tagSuggestions,
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
      const message =
        error instanceof Error ? error.message : 'Erro ao criar modelo'
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
              suggestions={tagSuggestions}
              placeholder="almoco-executivo, happy-hour..."
            />
            <p className="text-xs text-muted-foreground">
              A skill /arte-rapida usa estas tags pra encontrar o modelo a partir
              da frase do usuário. Tags novas viram tags do projeto
              automaticamente.
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

// ─── Tag editor inline (attached to a page card) ────────────────────────

function PageTagEditor({
  page,
  projectId,
  canEdit,
  tagSuggestions,
}: {
  page: TemplatePage
  projectId: number
  canEdit: boolean
  tagSuggestions: string[]
}) {
  const [draft, setDraft] = React.useState<string[]>(page.tags ?? [])
  const [dirty, setDirty] = React.useState(false)
  const updateMutation = useUpdateTemplatePageTags(projectId)

  React.useEffect(() => {
    setDraft(page.tags ?? [])
    setDirty(false)
  }, [page.tags])

  const handleSave = async () => {
    try {
      await updateMutation.mutateAsync({ pageId: page.id, tags: draft })
      toast.success('Tags atualizadas')
      setDirty(false)
    } catch (error: unknown) {
      const message =
        error instanceof Error ? error.message : 'Erro ao salvar tags'
      toast.error(message)
    }
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <Tag className="h-3 w-3" />
        <span>Tags</span>
        {!canEdit && <Lock className="h-3 w-3" aria-label="Somente leitura" />}
      </div>
      <TagInput
        value={draft}
        onChange={(next) => {
          setDraft(next)
          setDirty(true)
        }}
        suggestions={tagSuggestions}
        placeholder={canEdit ? 'almoco-executivo, happy-hour...' : 'Sem tags'}
        disabled={!canEdit}
      />
      {canEdit && dirty && (
        <div className="flex justify-end gap-2 pt-1">
          <Button
            size="sm"
            variant="ghost"
            onClick={() => {
              setDraft(page.tags ?? [])
              setDirty(false)
            }}
          >
            Cancelar
          </Button>
          <Button
            size="sm"
            onClick={handleSave}
            disabled={updateMutation.isPending}
          >
            {updateMutation.isPending ? 'Salvando...' : 'Salvar'}
          </Button>
        </div>
      )}
    </div>
  )
}

// ─── One modelo card (1 page) ───────────────────────────────────────────

function ModeloCard({
  page,
  projectId,
  canEdit,
  tagSuggestions,
}: {
  page: TemplatePage
  projectId: number
  canEdit: boolean
  tagSuggestions: string[]
}) {
  return (
    <Card className="flex flex-col overflow-hidden">
      <div className="relative w-full aspect-[9/16] bg-muted">
        {page.thumbnail ? (
          <Image
            src={page.thumbnail}
            alt={page.name}
            fill
            className="object-cover"
            sizes="(max-width: 640px) 50vw, 200px"
          />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center text-muted-foreground">
            <Wand2 className="h-6 w-6" />
          </div>
        )}
      </div>
      <div className="flex-1 p-3 space-y-3">
        <div className="space-y-0.5">
          <p className="font-medium text-sm truncate" title={page.name}>
            {page.name}
          </p>
          <p className="text-[11px] text-muted-foreground">
            {page.width} × {page.height}
          </p>
        </div>
        <PageTagEditor
          page={page}
          projectId={projectId}
          canEdit={canEdit}
          tagSuggestions={tagSuggestions}
        />
        {canEdit && (
          <Link
            href={`/templates/${page.templateId}/editor?pageId=${page.id}`}
          >
            <Button size="sm" variant="outline" className="w-full">
              <Pencil className="h-3.5 w-3.5 mr-1.5" />
              Editar página
            </Button>
          </Link>
        )}
      </div>
    </Card>
  )
}

// ─── Main tab ───────────────────────────────────────────────────────────

export function ModelosTab({ projectId, canCurate }: ModelosTabProps) {
  const canEdit = canCurate
  const [createOpen, setCreateOpen] = React.useState(false)
  const [tagsManagerOpen, setTagsManagerOpen] = React.useState(false)

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

  const projectTagsQuery = useProjectTags({ projectId })

  const tagSuggestions = React.useMemo(
    () => (projectTagsQuery.data ?? []).map((t) => t.name).sort(),
    [projectTagsQuery.data],
  )

  const tagInfoByName = React.useMemo<Record<string, ProjectTagInfo>>(() => {
    const map: Record<string, ProjectTagInfo> = {}
    for (const t of projectTagsQuery.data ?? []) {
      map[t.name] = { name: t.name, color: t.color }
    }
    return map
  }, [projectTagsQuery.data])

  const pages = pagesQuery.data ?? []

  // Group pages by tag. Each page may appear in multiple groups (one per tag);
  // pages without tags fall under UNTAGGED_KEY.
  const groups = React.useMemo(() => {
    const map = new Map<string, TemplatePage[]>()
    for (const page of pages) {
      const tags = page.tags ?? []
      if (tags.length === 0) {
        const list = map.get(UNTAGGED_KEY) ?? []
        list.push(page)
        map.set(UNTAGGED_KEY, list)
        continue
      }
      for (const tag of tags) {
        const list = map.get(tag) ?? []
        list.push(page)
        map.set(tag, list)
      }
    }
    return Array.from(map.entries()).sort(([a], [b]) => {
      if (a === UNTAGGED_KEY) return 1
      if (b === UNTAGGED_KEY) return -1
      return a.localeCompare(b)
    })
  }, [pages])

  const isLoading = templatesQuery.isLoading || pagesQuery.isLoading

  if (isLoading) {
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

  const emptyState = pages.length === 0

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="text-sm text-muted-foreground">
          {pages.length} modelo{pages.length === 1 ? '' : 's'} no projeto
          {tagSuggestions.length > 0 && ` • ${tagSuggestions.length} tag${tagSuggestions.length === 1 ? '' : 's'} cadastrada${tagSuggestions.length === 1 ? '' : 's'}`}
        </div>
        {canEdit && (
          <div className="flex gap-2">
            <Sheet open={tagsManagerOpen} onOpenChange={setTagsManagerOpen}>
              <SheetTrigger asChild>
                <Button variant="outline" size="sm">
                  <Settings2 className="h-4 w-4 mr-1.5" />
                  Gerenciar tags
                </Button>
              </SheetTrigger>
              <SheetContent side="right" className="w-full sm:max-w-md overflow-y-auto">
                <SheetHeader>
                  <SheetTitle>Tags do projeto</SheetTitle>
                </SheetHeader>
                <div className="mt-4">
                  <ProjectTagsConfig projectId={projectId} />
                </div>
              </SheetContent>
            </Sheet>
            <Button onClick={() => setCreateOpen(true)}>
              <Plus className="h-4 w-4 mr-1.5" />
              Criar modelo do zero
            </Button>
          </div>
        )}
      </div>

      <Card className="p-4 border-dashed bg-muted/30">
        <div className="flex items-start gap-3">
          {canEdit ? (
            <Tag className="h-5 w-5 text-muted-foreground flex-shrink-0 mt-0.5" />
          ) : (
            <AlertCircle className="h-5 w-5 text-amber-500 flex-shrink-0 mt-0.5" />
          )}
          <div className="text-sm text-muted-foreground">
            <p className="font-medium text-foreground">
              Cada modelo é uma página única, organizada por tag.
            </p>
            <p className="mt-1">
              {canEdit
                ? 'Crie um modelo do zero, taggeie por tema, e ele aparece tanto na skill /arte-rapida quanto na aba Templates do editor (pra ser aplicado em outras pages).'
                : 'Modo somente leitura: apenas o dono do projeto ou um admin da org podem criar/editar modelos.'}
            </p>
          </div>
        </div>
      </Card>

      {emptyState ? (
        <Card className="p-8 text-center space-y-4">
          <p className="text-sm text-muted-foreground">
            Nenhum modelo ainda.
            {canEdit && ' Cria um do zero pra começar.'}
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
      ) : (
        <div className="space-y-8">
          {groups.map(([tag, tagPages]) => {
            const isUntagged = tag === UNTAGGED_KEY
            const info = tagInfoByName[tag]
            return (
              <section key={tag} className="space-y-3">
                <div className="flex items-baseline gap-3">
                  {isUntagged ? (
                    <Badge variant="outline" className="text-xs">
                      Sem tag
                    </Badge>
                  ) : (
                    <Badge
                      variant="secondary"
                      className="text-xs"
                      style={
                        info?.color
                          ? {
                              backgroundColor: `${info.color}20`,
                              color: info.color,
                              borderColor: `${info.color}40`,
                            }
                          : undefined
                      }
                    >
                      {tag}
                    </Badge>
                  )}
                  <span className="text-xs text-muted-foreground">
                    {tagPages.length} modelo{tagPages.length === 1 ? '' : 's'}
                  </span>
                </div>
                <div className="grid gap-4 grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
                  {tagPages.map((page) => (
                    <ModeloCard
                      key={`${tag}-${page.id}`}
                      page={page}
                      projectId={projectId}
                      canEdit={canEdit}
                      tagSuggestions={tagSuggestions}
                    />
                  ))}
                </div>
              </section>
            )
          })}
        </div>
      )}

      <CreateModeloDialog
        projectId={projectId}
        open={createOpen}
        onOpenChange={setCreateOpen}
        tagSuggestions={tagSuggestions}
      />
    </div>
  )
}
