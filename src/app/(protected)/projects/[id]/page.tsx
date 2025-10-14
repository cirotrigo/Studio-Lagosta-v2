'use client'

import { useMemo, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import Image from 'next/image'
import { useParams, useRouter } from 'next/navigation'
import { Plus, FileText, Trash2, Edit, Copy, Share2 } from 'lucide-react'
import { api } from '@/lib/api-client'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogTrigger,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import Link from 'next/link'
import { toast } from 'sonner'
import { ProjectAssetsPanel } from '@/components/projects/project-assets-panel'
import { CreativesGallery } from '@/components/projects/creatives-gallery'
import { GoogleDriveFolderSelector } from '@/components/projects/google-drive-folder-selector'
import { useProject } from '@/hooks/use-project'
import { Skeleton } from '@/components/ui/skeleton'
import { Badge } from '@/components/ui/badge'
import { Switch } from '@/components/ui/switch'
import { useOrganization } from '@clerk/nextjs'
import {
  useRemoveSharedProjectMutation,
  useShareProjectMutation,
  organizationKeys,
} from '@/hooks/use-organizations'

const createTemplateSchema = z.object({
  name: z.string().min(1, 'Nome é obrigatório'),
  type: z.enum(['STORY', 'FEED', 'SQUARE']),
  dimensions: z.string().regex(/^\d+x\d+$/, 'Formato inválido'),
})

type CreateTemplateData = z.infer<typeof createTemplateSchema>

interface Template {
  id: number
  name: string
  type: string
  dimensions: string
  thumbnailUrl: string | null
  createdAt: string
  _count?: {
    Page: number
  }
}

const TEMPLATE_TYPES = [
  { value: 'STORY', label: 'Story (9:16)', dimensions: '1080x1920' },
  { value: 'FEED', label: 'Feed (4:5)', dimensions: '1080x1350' },
  { value: 'SQUARE', label: 'Quadrado (1:1)', dimensions: '1080x1080' },
]

export default function ProjectDetailPage() {
  const params = useParams()
  const router = useRouter()
  const projectId = Number(params.id)
  const [isDialogOpen, setIsDialogOpen] = useState(false)
  const [selectedType, setSelectedType] = useState<string>('STORY')
  const queryClient = useQueryClient()

  const {
    data: projectDetails,
    isLoading: isLoadingProject,
    error: projectError,
  } = useProject(
    Number.isNaN(projectId) ? null : projectId,
  )
  const { organization, membership, isLoaded: isOrganizationLoaded } = useOrganization()
  const shareProjectMutation = useShareProjectMutation(organization?.id ?? null)
  const removeShareMutation = useRemoveSharedProjectMutation(organization?.id ?? null)
  const [isShareDialogOpen, setIsShareDialogOpen] = useState(false)
  const [allowOrganizationEdit, setAllowOrganizationEdit] = useState(true)

  const { data: templates, isLoading } = useQuery<Template[]>({
    queryKey: ['templates', projectId],
    queryFn: () => api.get(`/api/projects/${projectId}/templates`),
    enabled: !isNaN(projectId),
  })

  const createMutation = useMutation({
    mutationFn: (data: CreateTemplateData) =>
      api.post(`/api/projects/${projectId}/templates`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['templates', projectId] })
      setIsDialogOpen(false)
      reset()
      toast.success('Template criado com sucesso!')
    },
    onError: () => {
      toast.error('Erro ao criar template')
    },
  })

  const deleteMutation = useMutation({
    mutationFn: (id: number) => api.delete(`/api/templates/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['templates', projectId] })
      toast.success('Template deletado com sucesso!')
    },
    onError: () => {
      toast.error('Erro ao deletar template')
    },
  })

  const duplicateMutation = useMutation({
    mutationFn: (id: number) => api.post(`/api/templates/${id}/duplicate`, {}),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['templates', projectId] })
      toast.success('Template duplicado com sucesso!')
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : 'Erro ao duplicar template')
    },
  })

  const {
    register,
    handleSubmit,
    reset,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<CreateTemplateData>({
    resolver: zodResolver(createTemplateSchema),
    defaultValues: {
      type: 'STORY',
      dimensions: '1080x1920',
    },
  })

  const handleTypeChange = (type: string) => {
    setSelectedType(type)
    const typeConfig = TEMPLATE_TYPES.find((t) => t.value === type)
    if (typeConfig) {
      setValue('type', type as 'STORY' | 'FEED' | 'SQUARE')
      setValue('dimensions', typeConfig.dimensions)
    }
  }

  const onSubmit = (data: CreateTemplateData) => {
    createMutation.mutate(data)
  }

  const handleDelete = (id: number, name: string) => {
    if (confirm(`Tem certeza que deseja deletar o template "${name}"?`)) {
      deleteMutation.mutate(id)
    }
  }

const handleDuplicate = (id: number, name: string) => {
  if (confirm(`Duplicar o template "${name}"?`)) {
    duplicateMutation.mutate(id)
  }
}

const getTypeLabel = (type: string) => {
  const typeConfig = TEMPLATE_TYPES.find((t) => t.value === type)
  return typeConfig?.label || type
}

if (isLoadingProject) {
  return (
    <div className="container mx-auto space-y-6 p-8">
      <Skeleton className="h-6 w-32" />
      <Skeleton className="h-10 w-3/4" />
      <Skeleton className="h-24 w-full" />
    </div>
  )
}

if (projectError) {
  return (
    <div className="container mx-auto p-8">
      <Card className="border border-destructive/40 bg-destructive/10 p-6">
        <p className="text-sm text-destructive-foreground">
          Ocorreu um erro ao carregar este projeto. Tente novamente mais tarde.
        </p>
      </Card>
    </div>
  )
}

if (!projectDetails) {
  return (
    <div className="container mx-auto p-8">
      <Card className="border border-border/40 bg-card/60 p-6">
        <p className="text-sm text-muted-foreground">Projeto não encontrado.</p>
        <Button className="mt-4" variant="outline" onClick={() => router.push('/projects')}>
          Voltar para projetos
        </Button>
      </Card>
    </div>
  )
}

const organizationShares = projectDetails.organizationShares ?? []

const activeOrganizationShare = organization?.id
  ? organizationShares.find((share) => share.organizationId === organization.id)
  : undefined

const otherOrganizationShares = organization?.id
  ? organizationShares.filter((share) => share.organizationId !== organization.id)
  : organizationShares

const canManageSharing = Boolean(organization) && membership?.role === 'org:admin'

const handleShareWithOrganization = () => {
  if (!organization) {
    toast.error('Selecione uma organização no topo para compartilhar o projeto.')
    return
  }

  shareProjectMutation.mutate(
    {
      projectId,
      canEdit: allowOrganizationEdit,
    },
    {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: ['project', projectId] })
        queryClient.invalidateQueries({ queryKey: ['projects'] })
        queryClient.invalidateQueries({ queryKey: organizationKeys.projects(organization.id) })
        toast.success(`Projeto compartilhado com ${organization.name ?? 'a organização'}`)
        setIsShareDialogOpen(false)
      },
      onError: () => {
        toast.error('Não foi possível compartilhar o projeto.')
      },
    },
  )
}

const handleRemoveShare = () => {
  if (!organization) {
    toast.error('Selecione uma organização no topo para gerenciar o compartilhamento.')
    return
  }

  removeShareMutation.mutate(projectId, {
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['project', projectId] })
      queryClient.invalidateQueries({ queryKey: ['projects'] })
      queryClient.invalidateQueries({ queryKey: organizationKeys.projects(organization.id) })
      toast.success('Compartilhamento removido com sucesso.')
    },
    onError: () => {
      toast.error('Não foi possível remover o compartilhamento.')
    },
  })
}

return (
  <div className="container mx-auto p-8">
    <div className="mb-8 flex flex-col gap-4">
      <Button variant="ghost" onClick={() => router.push('/projects')} className="self-start">
        ← Voltar para Projetos
      </Button>
      <div>
        <h1 className="text-3xl font-bold text-foreground">{projectDetails.name}</h1>
        {projectDetails.description && (
          <p className="mt-1 text-sm text-muted-foreground">{projectDetails.description}</p>
        )}
      </div>
    </div>

    <Card className="mb-8 border border-border/40 bg-card/60 p-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div className="space-y-3">
          <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
            <Share2 className="h-4 w-4" />
            Compartilhamento com equipes
          </div>
          <p className="text-sm text-muted-foreground">
            Controle com quais organizações este projeto está disponível. O contexto ativo no topo determina onde as ações são realizadas.
          </p>
          {organizationShares.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              {organizationShares.map((share) => (
                <Badge key={share.organizationId} variant="outline">
                  {share.organizationName ?? share.organizationId}
                  {!share.defaultCanEdit && <span className="ml-2 text-xs text-muted-foreground">(somente visualização)</span>}
                </Badge>
              ))}
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">Este projeto ainda não foi compartilhado com nenhuma organização.</p>
          )}
          {otherOrganizationShares.length > 0 && (
            <p className="text-xs text-muted-foreground">
              Também disponível para: {otherOrganizationShares.map((share) => share.organizationName ?? share.organizationId).join(', ')}
            </p>
          )}
        </div>

        <div className="flex w-full flex-col items-start gap-2 md:w-auto md:items-end">
          {!isOrganizationLoaded ? (
            <Skeleton className="h-9 w-40" />
          ) : organization ? (
            activeOrganizationShare ? (
              <div className="flex flex-col items-start gap-2 md:items-end">
                <div className="rounded-md border border-border/40 bg-background/60 px-3 py-2 text-xs text-muted-foreground">
                  Compartilhado com <span className="font-medium text-foreground">{organization.name ?? organization.id}</span>{' '}
                  — {activeOrganizationShare.defaultCanEdit ? 'edição liberada' : 'somente visualização'}
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setAllowOrganizationEdit(activeOrganizationShare.defaultCanEdit)
                      setIsShareDialogOpen(true)
                    }}
                    disabled={!canManageSharing}
                  >
                    Ajustar permissões
                  </Button>
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={handleRemoveShare}
                    disabled={!canManageSharing || removeShareMutation.isPending}
                  >
                    {removeShareMutation.isPending ? 'Removendo…' : 'Remover compartilhamento'}
                  </Button>
                </div>
                {!canManageSharing && (
                  <p className="max-w-xs text-right text-xs text-muted-foreground">
                    Apenas administradores da organização podem alterar permissões de compartilhamento.
                  </p>
                )}
              </div>
            ) : (
              <div className="flex flex-col items-start gap-2 md:items-end">
                <Button
                  size="sm"
                  onClick={() => {
                    setAllowOrganizationEdit(true)
                    setIsShareDialogOpen(true)
                  }}
                  disabled={!canManageSharing || shareProjectMutation.isPending}
                >
                  Compartilhar com {organization.name ?? 'a organização'}
                </Button>
                {!canManageSharing && (
                  <p className="max-w-xs text-right text-xs text-muted-foreground">
                    Apenas administradores da organização podem compartilhar novos projetos.
                  </p>
                )}
              </div>
            )
          ) : (
            <p className="max-w-sm text-xs text-muted-foreground md:text-right">
              Selecione uma organização no topo para disponibilizar este projeto à sua equipe.
            </p>
          )}
        </div>
      </div>
    </Card>

    <Dialog open={isShareDialogOpen} onOpenChange={setIsShareDialogOpen}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {activeOrganizationShare ? 'Atualizar permissões da organização' : 'Compartilhar projeto com a organização'}
          </DialogTitle>
          <DialogDescription>
            {organization
              ? `O projeto será compartilhado com ${organization.name ?? organization.id}. Defina se os membros podem editar ou apenas visualizar.`
              : 'Selecione uma organização para continuar.'}
          </DialogDescription>
        </DialogHeader>
        <div className="rounded-lg border border-border/40 bg-card/60 px-4 py-3">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-sm font-medium text-foreground">Permitir edição pelos membros</p>
              <p className="text-xs text-muted-foreground">
                Quando ativado, todos os membros com acesso poderão editar os templates deste projeto.
              </p>
            </div>
            <Switch
              checked={allowOrganizationEdit}
              onCheckedChange={(value) => setAllowOrganizationEdit(Boolean(value))}
              disabled={!canManageSharing}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setIsShareDialogOpen(false)}>
            Cancelar
          </Button>
          <Button
            onClick={handleShareWithOrganization}
            disabled={!canManageSharing || shareProjectMutation.isPending}
          >
            {shareProjectMutation.isPending
              ? 'Salvando…'
              : activeOrganizationShare
              ? 'Atualizar compartilhamento'
              : 'Compartilhar projeto'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>

    <Tabs defaultValue="templates" className="w-full">
        <TabsList>
          <TabsTrigger value="templates">Templates</TabsTrigger>
          <TabsTrigger value="assets">Assets</TabsTrigger>
          <TabsTrigger value="criativos">Criativos</TabsTrigger>
          <TabsTrigger value="configuracoes">Configurações</TabsTrigger>
        </TabsList>

        <TabsContent value="templates" className="mt-6">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h2 className="text-xl font-semibold">Templates</h2>
              <p className="text-sm text-muted-foreground">
                Modelos reutilizáveis para criar criativos
              </p>
            </div>

            <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
              <DialogTrigger asChild>
                <Button>
                  <Plus className="w-4 h-4 mr-2" />
                  Novo Template
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Criar Novo Template</DialogTitle>
                </DialogHeader>
                <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
                  <div>
                    <Label htmlFor="name">Nome do Template</Label>
                    <Input
                      id="name"
                      {...register('name')}
                      placeholder="Ex: Story Promo Verão"
                    />
                    {errors.name && (
                      <p className="text-sm text-red-500 mt-1">{errors.name.message}</p>
                    )}
                  </div>

                  <div>
                    <Label htmlFor="type">Tipo de Template</Label>
                    <Select value={selectedType} onValueChange={handleTypeChange}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {TEMPLATE_TYPES.map((type) => (
                          <SelectItem key={type.value} value={type.value}>
                            {type.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div>
                    <Label>Dimensões</Label>
                    <Input
                      {...register('dimensions')}
                      disabled
                      className="bg-muted"
                    />
                  </div>

                  <div className="flex justify-end gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => setIsDialogOpen(false)}
                    >
                      Cancelar
                    </Button>
                    <Button type="submit" disabled={isSubmitting}>
                      {isSubmitting ? 'Criando...' : 'Criar Template'}
                    </Button>
                  </div>
                </form>
              </DialogContent>
            </Dialog>
          </div>

          {isLoading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-4">
              {Array.from({ length: 8 }).map((_, index) => (
                <Card key={`skeleton-${index}`} className="overflow-hidden">
                  <Skeleton className="aspect-[4/5] w-full" />
                  <div className="p-3">
                    <Skeleton className="h-4 w-3/4 mb-2" />
                    <Skeleton className="h-3 w-1/2" />
                  </div>
                </Card>
              ))}
            </div>
          ) : templates && templates.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-4">
              {templates.map((template) => {
                // Calcular aspect ratio baseado no tipo
                const aspectRatios: Record<string, string> = {
                  STORY: 'aspect-[9/16]',
                  FEED: 'aspect-[4/5]',
                  SQUARE: 'aspect-square',
                }
                const aspectRatio = aspectRatios[template.type] ?? 'aspect-[4/5]'

                return (
                  <Card
                    key={template.id}
                    className="group overflow-hidden transition-all hover:shadow-lg hover:scale-[1.02]"
                  >
                    <div className={cn('relative bg-muted group', aspectRatio)}>
                      {template.thumbnailUrl ? (
                        <Image
                          src={template.thumbnailUrl}
                          alt={template.name}
                          fill
                          sizes="(min-width: 1536px) 20vw, (min-width: 1280px) 25vw, (min-width: 1024px) 33vw, (min-width: 768px) 50vw, 100vw"
                          className="object-cover"
                          unoptimized
                        />
                      ) : (
                        <div className="w-full h-full flex flex-col items-center justify-center gap-2">
                          <FileText className="w-8 h-8 text-muted-foreground opacity-40" />
                          <span className="text-xs text-muted-foreground opacity-60">Sem preview</span>
                        </div>
                      )}
                      <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                        <Button
                          size="icon"
                          variant="secondary"
                          asChild
                          className="h-9 w-9"
                        >
                          <Link href={`/templates/${template.id}/editor`}>
                            <Edit className="w-4 h-4" />
                          </Link>
                        </Button>
                        <Button
                          size="icon"
                          variant="secondary"
                          className="h-9 w-9"
                          onClick={() => handleDuplicate(template.id, template.name)}
                          disabled={duplicateMutation.isPending}
                        >
                          <Copy className="w-4 h-4" />
                        </Button>
                      </div>
                    </div>
                    <div className="p-3">
                      <h3 className="font-semibold text-sm leading-tight line-clamp-1 mb-1">
                        {template.name}
                      </h3>
                      <div className="flex items-center justify-between text-xs mb-1">
                        <span className="text-muted-foreground truncate">
                          {getTypeLabel(template.type)} • {template.dimensions}
                        </span>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 shrink-0"
                          onClick={() => handleDelete(template.id, template.name)}
                          disabled={deleteMutation.isPending}
                        >
                          <Trash2 className="w-3.5 h-3.5 text-red-500" />
                        </Button>
                      </div>
                      {template._count && template._count.Page > 0 && (
                        <div className="text-xs text-muted-foreground">
                          {template._count.Page} {template._count.Page === 1 ? 'página' : 'páginas'}
                        </div>
                      )}
                    </div>
                  </Card>
                )
              })}
            </div>
          ) : (
            <Card className="p-12 text-center">
              <div className="flex flex-col items-center gap-4">
                <div className="p-4 bg-muted rounded-full">
                  <FileText className="w-8 h-8 text-muted-foreground" />
                </div>
                <div>
                  <h3 className="font-semibold text-lg mb-2">Nenhum template ainda</h3>
                  <p className="text-muted-foreground mb-4">
                    Crie seu primeiro template para começar
                  </p>
                  <Button onClick={() => setIsDialogOpen(true)}>
                    <Plus className="w-4 h-4 mr-2" />
                    Criar Primeiro Template
                  </Button>
                </div>
              </div>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="assets" className="mt-6">
          <ProjectAssetsPanel projectId={projectId} />
        </TabsContent>

        <TabsContent value="criativos" className="mt-6">
          <div className="mb-6">
            <h2 className="text-xl font-semibold mb-2">Galeria de Criativos</h2>
            <p className="text-sm text-muted-foreground">
              Visualize e baixe todos os criativos exportados neste projeto. Os criativos são salvos automaticamente quando você faz export no editor Konva.
            </p>
          </div>
          <CreativesGallery projectId={projectId} />
        </TabsContent>

        <TabsContent value="configuracoes" className="mt-6">
          <div className="space-y-4">
            <Card className="p-6">
              <h3 className="text-lg font-semibold">Configurações do Projeto</h3>
              <p className="text-sm text-muted-foreground">
                Ajuste integrações e recursos extras para este projeto. Novas opções serão adicionadas em breve.
              </p>
            </Card>

            {isLoadingProject ? (
              <Card className="p-6">
                <Skeleton className="h-6 w-60" />
                <Skeleton className="mt-4 h-4 w-full" />
                <Skeleton className="mt-2 h-4 w-1/2" />
              </Card>
            ) : projectDetails ? (
              <div className="space-y-4">
                <GoogleDriveFolderSelector
                  projectId={projectId}
                  folderId={projectDetails.googleDriveFolderId}
                  folderName={projectDetails.googleDriveFolderName}
                  variant="backup"
                />
                <GoogleDriveFolderSelector
                  projectId={projectId}
                  folderId={projectDetails.googleDriveImagesFolderId}
                  folderName={projectDetails.googleDriveImagesFolderName}
                  variant="images"
                />
                <GoogleDriveFolderSelector
                  projectId={projectId}
                  folderId={projectDetails.googleDriveVideosFolderId}
                  folderName={projectDetails.googleDriveVideosFolderName}
                  variant="videos"
                />
              </div>
            ) : (
              <Card className="p-6">
                <h4 className="text-base font-semibold">Não foi possível carregar as configurações</h4>
                <p className="mt-2 text-sm text-muted-foreground">
                  {projectError instanceof Error ? projectError.message : 'Tente atualizar a página e tente novamente.'}
                </p>
              </Card>
            )}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  )
}
