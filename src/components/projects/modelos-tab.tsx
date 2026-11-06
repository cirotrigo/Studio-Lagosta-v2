'use client'

/**
 * A aba Modelos do projeto: a vitrine (S5, 06/11/2026). Um cartão por modelo, sobre o `GET /api/projects/[id]/modelos`
 * — a aba antiga agrupava por tag (o mesmo modelo repetia em cada tag) e lia o `GET template-pages`, que traz as
 * camadas de todos os modelos.
 */

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { ChevronDown, Plus, Settings2 } from 'lucide-react'
import { toast } from '@/hooks/use-toast'

import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { TagInput } from '@/components/projects/tag-input'
import { ProjectTagsConfig } from '@/components/projects/project-tags-config'
import { ModelosGrid } from '@/components/modelos/modelos-grid'
import { useCreateModelo } from '@/hooks/use-create-modelo'
import { useModelosDoProjeto } from '@/hooks/use-modelos-do-projeto'
import { useProjectTags } from '@/hooks/use-project-tags'

const MODELO_DIMENSIONS: Record<'STORY' | 'FEED' | 'SQUARE', string> = {
  STORY: '1080x1920',
  FEED: '1080x1350',
  SQUARE: '1080x1080',
}

interface ModelosTabProps {
  projectId: number
  canCurate: boolean
}

function CreateModeloDialog({
  projectId,
  open,
  onOpenChange,
}: {
  projectId: number
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const router = useRouter()
  const createModelo = useCreateModelo(projectId)
  const projectTags = useProjectTags({ projectId, enabled: open })
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
      toast({ title: 'Dá um nome pro modelo', variant: 'destructive' })
      return
    }
    try {
      const created = await createModelo.mutateAsync({
        name: name.trim(),
        type,
        dimensions: MODELO_DIMENSIONS[type],
        tags,
      })
      toast({ title: 'Modelo criado' })
      onOpenChange(false)
      reset()
      if (action === 'createAndOpen') {
        router.push(`/templates/${created.templateId}/editor?pageId=${created.pageId}`)
      }
    } catch (error: unknown) {
      toast({ title: error instanceof Error ? error.message : 'Erro ao criar modelo', variant: 'destructive' })
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
            <Select value={type} onValueChange={(value) => setType(value as 'STORY' | 'FEED' | 'SQUARE')}>
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
              suggestions={(projectTags.data ?? []).map((t) => t.name).filter(Boolean)}
              placeholder="almoco-executivo, happy-hour..."
            />
            <p className="text-xs text-muted-foreground">
              É por elas que o Studio acha o modelo a partir de uma frase. Tags novas viram tags do projeto.
            </p>
          </div>
        </div>
        <DialogFooter className="gap-2 sm:gap-2">
          <Button variant="outline" onClick={() => handleSubmit('create')} disabled={createModelo.isPending}>
            Criar
          </Button>
          <Button onClick={() => handleSubmit('createAndOpen')} disabled={createModelo.isPending}>
            {createModelo.isPending ? 'Criando...' : 'Criar e abrir editor'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export function ModelosTab({ projectId, canCurate }: ModelosTabProps) {
  const [createOpen, setCreateOpen] = React.useState(false)
  const [tagsManagerOpen, setTagsManagerOpen] = React.useState(false)
  const modelosQuery = useModelosDoProjeto(projectId)
  const modelos = modelosQuery.data ?? []

  if (modelosQuery.isLoading) {
    return (
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="aspect-[9/16] w-full rounded-lg" />
        ))}
      </div>
    )
  }

  if (modelosQuery.isError) {
    return (
      <Card className="p-6 text-sm text-muted-foreground">
        Não deu para carregar os modelos.{' '}
        <button type="button" className="font-medium text-primary hover:underline" onClick={() => modelosQuery.refetch()}>
          Tentar de novo
        </button>
      </Card>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          {modelos.length} modelo{modelos.length === 1 ? '' : 's'}
        </p>
        {canCurate && (
          <div className="flex gap-2">
            <Sheet
              open={tagsManagerOpen}
              onOpenChange={setTagsManagerOpen}
            >
              <SheetTrigger asChild>
                <Button variant="outline" size="sm" aria-label="Gerenciar tags">
                  <Settings2 className="h-4 w-4 sm:mr-1.5" />
                  <span className="hidden sm:inline">Gerenciar tags</span>
                </Button>
              </SheetTrigger>
              <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-md">
                <SheetHeader>
                  <SheetTitle>Tags do projeto</SheetTitle>
                </SheetHeader>
                <div className="mt-4">
                  <ProjectTagsConfig projectId={projectId} />
                </div>
              </SheetContent>
            </Sheet>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button size="sm">
                  <Plus className="mr-1.5 h-4 w-4" />
                  Novo modelo
                  <ChevronDown className="ml-1 h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-64">
                <DropdownMenuItem onSelect={() => setCreateOpen(true)}>Criar modelo do zero</DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">
                  ou abra qualquer arte e clique em Marcar modelo
                </DropdownMenuLabel>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        )}
      </div>

      {modelos.length === 0 ? (
        <Card className="space-y-4 p-8 text-center">
          <p className="text-sm text-muted-foreground">
            Nenhum modelo ainda.
            {canCurate && ' Crie um do zero, ou abra qualquer arte no editor e clique em Marcar modelo.'}
          </p>
          {canCurate && (
            <div className="flex justify-center">
              <Button onClick={() => setCreateOpen(true)}>
                <Plus className="mr-1.5 h-4 w-4" />
                Criar modelo do zero
              </Button>
            </div>
          )}
        </Card>
      ) : (
        <ModelosGrid projectId={projectId} modelos={modelos} canCurate={canCurate} />
      )}

      <CreateModeloDialog projectId={projectId} open={createOpen} onOpenChange={setCreateOpen} />
    </div>
  )
}
