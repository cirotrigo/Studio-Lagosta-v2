'use client'

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import Image from 'next/image'
import { useParams, useRouter, useSearchParams } from 'next/navigation'
import { Plus, FileText } from 'lucide-react'
import { api } from '@/lib/api-client'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
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
import { TemplatesGallery } from '@/components/projects/templates-gallery'
import { GoogleDriveFolderSelector } from '@/components/projects/google-drive-folder-selector'
import { InstagramAccountConfig } from '@/components/projects/instagram-account-config'
import { ProjectAgendaView } from '@/components/projects/project-agenda-view'
import { DrivePage as ProjectDrivePage } from '@/app/(protected)/drive/_components/drive-page'
import { useProject } from '@/hooks/use-project'
import { Skeleton } from '@/components/ui/skeleton'

const createTemplateSchema = z.object({
  name: z.string().min(1, 'Nome é obrigatório'),
  type: z.enum(['STORY', 'FEED', 'SQUARE']),
  dimensions: z.string().regex(/^\d+x\d+$/, 'Formato inválido'),
})

type CreateTemplateData = z.infer<typeof createTemplateSchema>

const TEMPLATE_TYPES = [
  { value: 'STORY', label: 'Story (9:16)', dimensions: '1080x1920' },
  { value: 'FEED', label: 'Feed (4:5)', dimensions: '1080x1350' },
  { value: 'SQUARE', label: 'Quadrado (1:1)', dimensions: '1080x1080' },
]

export default function ProjectDetailPage() {
  const params = useParams()
  const router = useRouter()
  const searchParams = useSearchParams()
  const projectId = Number(params.id)
  const [isDialogOpen, setIsDialogOpen] = useState(false)
  const [selectedType, setSelectedType] = useState<string>('STORY')
  const queryClient = useQueryClient()

  const activeTab = searchParams.get('tab') || 'templates'

  const {
    data: projectDetails,
    isLoading: isLoadingProject,
    error: projectError,
  } = useProject(
    Number.isNaN(projectId) ? null : projectId,
  )

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

  // Mutations de exclusão/duplicação removidas pois agora são lidadas pelo TemplatesGallery
  // Query de templates removida

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

  const driveImagesConfigured = Boolean(projectDetails.googleDriveImagesFolderId)
  const driveVideosConfigured = Boolean(projectDetails.googleDriveVideosFolderId)
  const driveFallbackConfigured = Boolean(projectDetails.googleDriveFolderId)
  const driveConfigured = driveImagesConfigured || driveVideosConfigured || driveFallbackConfigured
  const configLink = `/projects/${projectId}?tab=configuracoes`

  return (
    <div className="w-full max-w-full overflow-x-hidden px-0">
      <div className="mb-6 md:mb-8 flex flex-col gap-3 md:gap-4 max-w-full overflow-hidden">
        <Button
          variant="ghost"
          onClick={() => router.push('/projects')}
          className="self-start flex-shrink-0"
        >
          ← Voltar para Projetos
        </Button>
        <div className="max-w-full overflow-hidden">
          <h1 className="text-2xl md:text-3xl font-bold text-foreground break-words overflow-wrap-anywhere">
            {projectDetails.name}
          </h1>
          {projectDetails.description && (
            <p className="mt-1 text-sm text-muted-foreground break-words overflow-wrap-anywhere">
              {projectDetails.description}
            </p>
          )}
        </div>
      </div>

      <Tabs
        value={activeTab}
        onValueChange={(value) => router.push(`/projects/${projectId}?tab=${value}`)}
        className="w-full max-w-full overflow-x-hidden"
      >
        <TabsList>
          <TabsTrigger value="drive">Drive</TabsTrigger>
          <TabsTrigger value="templates">Templates</TabsTrigger>
          <TabsTrigger value="criativos">Criativos</TabsTrigger>
          <TabsTrigger value="agenda">Agenda</TabsTrigger>
          <TabsTrigger value="assets">Assets</TabsTrigger>
          <TabsTrigger value="configuracoes">Configurações</TabsTrigger>
        </TabsList>

        <TabsContent value="drive" className="mt-6 space-y-4">
          {!driveConfigured && (
            <Card className="p-4 text-sm text-muted-foreground">
              <p>
                Configure as pastas de fotos e/ou vídeos em{' '}
                <Link href={configLink} className="font-medium text-primary hover:underline">
                  Configurações
                </Link>{' '}
                para aproveitar todos os recursos do Drive. Mesmo assim, você já pode visualizar os arquivos existentes abaixo.
              </p>
            </Card>
          )}
          <ProjectDrivePage initialProjectId={projectDetails.id} showProjectSelector={false} disableUrlSync />
        </TabsContent>

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

          <TemplatesGallery
            projectId={projectId}
            onCreateClick={() => setIsDialogOpen(true)}
          />
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

        <TabsContent value="agenda" className="mt-6">
          {isLoadingProject ? (
            <Card className="p-6">
              <Skeleton className="h-6 w-60" />
              <Skeleton className="mt-4 h-96 w-full" />
            </Card>
          ) : projectDetails ? (
            <ProjectAgendaView project={projectDetails} projectId={projectId} />
          ) : (
            <Card className="p-6">
              <h4 className="text-base font-semibold">Não foi possível carregar a agenda</h4>
              <p className="mt-2 text-sm text-muted-foreground">
                {projectError instanceof Error ? projectError.message : 'Tente atualizar a página e tente novamente.'}
              </p>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="assets" className="mt-6">
          <ProjectAssetsPanel projectId={projectId} />
        </TabsContent>

        <TabsContent value="configuracoes" className="mt-6">
          <div className="space-y-6">
            <Card className="p-6">
              <h3 className="text-lg font-semibold">Configurações do Projeto</h3>
              <p className="text-sm text-muted-foreground">
                Ajuste integrações e recursos extras para este projeto
              </p>
            </Card>

            {isLoadingProject ? (
              <Card className="p-6">
                <Skeleton className="h-6 w-60" />
                <Skeleton className="mt-4 h-4 w-full" />
                <Skeleton className="mt-2 h-4 w-1/2" />
              </Card>
            ) : projectDetails ? (
              <div className="space-y-6">
                {/* Instagram Account Configuration */}
                <InstagramAccountConfig
                  projectId={projectId}
                  instagramAccountId={projectDetails.instagramAccountId}
                  instagramUsername={projectDetails.instagramUsername}
                  zapierWebhookUrl={projectDetails.zapierWebhookUrl}
                />

                {/* Google Drive Folders */}
                <div className="space-y-4">
                  <h4 className="text-base font-semibold">Integração Google Drive</h4>
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
