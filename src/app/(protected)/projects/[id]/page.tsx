'use client'

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import Image from 'next/image'
import { useParams, useRouter } from 'next/navigation'
import { Plus, FileText, Image as ImageIcon, Trash2, Edit, Copy } from 'lucide-react'
import { api } from '@/lib/api-client'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
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
    onError: (error: any) => {
      toast.error(error?.message || 'Erro ao duplicar template')
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

  return (
    <div className="container mx-auto p-8">
      <div className="mb-8">
        <Button variant="ghost" onClick={() => router.push('/projects')} className="mb-4">
          ← Voltar para Projetos
        </Button>
        <h1 className="text-3xl font-bold">Gerenciar Projeto</h1>
      </div>

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
                      <div className="flex items-center justify-between text-xs">
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
              <GoogleDriveFolderSelector
                projectId={projectId}
                folderId={projectDetails?.googleDriveFolderId ?? null}
                folderName={projectDetails?.googleDriveFolderName ?? null}
              />
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
