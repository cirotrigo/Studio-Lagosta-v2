'use client'

import { useEffect, useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useParams, useRouter, useSearchParams } from 'next/navigation'
import { ArrowLeft, Plus } from 'lucide-react'
import { usePageMetadata } from '@/contexts/page-metadata'
import { api } from '@/lib/api-client'
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
import { ModelosTab } from '@/components/projects/modelos-tab'
import { ArtesReferenciaTab } from '@/components/projects/artes-referencia-tab'
import { GoogleDriveFolderSelector } from '@/components/projects/google-drive-folder-selector'
import { InstagramAccountConfig } from '@/components/projects/instagram-account-config'
import { LaterProviderConfig } from '@/components/projects/later-provider-config'
import { AIChatBehaviorConfig } from '@/components/projects/ai-chat-behavior-config'
import { ArtImprovementPromptConfig } from '@/components/projects/art-improvement-prompt-config'
import { BrandDnaSection } from '@/components/projects/brand-dna-section'
import { ProjectTagsConfig } from '@/components/projects/project-tags-config'
import { InstagramTokenConfig } from '@/components/projects/instagram-token-config'
import { ProjectAnalyticsPanel } from '@/components/analytics/project-analytics-panel'
import { agendaHref, postHref } from '@/lib/agenda-routes'
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

  // Header próprio compacto — esconde o breadcrumb automático do layout
  // (restaura ao sair para não afetar outras páginas)
  const { setMetadata } = usePageMetadata()
  useEffect(() => {
    setMetadata({ showBreadcrumbs: false })
    return () => setMetadata({ showBreadcrumbs: true })
  }, [setMetadata])
  const [isDialogOpen, setIsDialogOpen] = useState(false)
  const [selectedType, setSelectedType] = useState<string>('STORY')
  const queryClient = useQueryClient()

  const activeTab = searchParams.get('tab') || 'templates'

  /*
    A agenda saiu da aba e virou rota (`/projects/[id]/agenda`) em 08/08/2026.
    Os links `?tab=agenda` continuam chegando — vivem em conversas de WhatsApp
    que ninguém apaga, geradas pelos avisos de falha, pelos lembretes, pelo
    `agendar.ts` e pelo MCP — então a aba redireciona em vez de renderizar.
    Com `postId` junto, vai direto para a tela do post.
  */
  const postIdParam = searchParams.get('postId')
  useEffect(() => {
    if (activeTab !== 'agenda' || Number.isNaN(projectId)) return
    router.replace(
      postIdParam ? postHref(projectId, postIdParam) : agendaHref(projectId),
    )
  }, [activeTab, postIdParam, projectId, router])

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
      <div className="mb-3 flex max-w-full items-center gap-2 overflow-hidden md:mb-4">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => router.push('/projects')}
          className="h-9 w-9 flex-shrink-0"
          aria-label="Voltar para projetos"
          title="Voltar para projetos"
        >
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <h1 className="min-w-0 truncate text-lg font-semibold text-foreground md:text-xl">
          {projectDetails.name}
        </h1>
        {projectDetails.description && (
          <span className="hidden min-w-0 truncate text-sm text-muted-foreground lg:inline">
            — {projectDetails.description}
          </span>
        )}
      </div>

      {/* A barra de navegação vive no layout (`ProjectNav`), não aqui: Agenda e
          Bancada são rotas próprias, e enquanto a barra era desta página elas a
          levavam embora ao abrir. O `Tabs` continua, só que como seletor de
          conteúdo governado pela URL — sem `TabsList` e sem `onValueChange`,
          porque quem navega agora são os links do menu. */}
      <Tabs value={activeTab} className="w-full max-w-full overflow-x-hidden">

        <TabsContent value="drive" className="mt-3 md:mt-4 space-y-4">
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

        <TabsContent value="templates" className="mt-3 md:mt-4">
          <div className="mb-3 flex justify-end">
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

        {/* Modelos guarda DUAS coisas que só têm o nome em comum: páginas de
            template (estrutura editável, escolhida por tag) e artes prontas
            aprovadas (imagem de referência que inspira a próxima geração).
            Juntas numa lista só, ninguém achava as segundas. */}
        <TabsContent value="modelos" className="mt-3 md:mt-4">
          <Tabs defaultValue="templates" className="w-full">
            <TabsList>
              <TabsTrigger value="templates">Modelos de template</TabsTrigger>
              <TabsTrigger value="artes">Artes de referência</TabsTrigger>
            </TabsList>

            <TabsContent value="templates" className="mt-3 md:mt-4">
              <p className="mb-3 text-sm text-muted-foreground">
                Curadoria de templates por tema. Aplique tags para que a skill
                /arte-rapida encontre o template certo a partir de uma frase em PT.
              </p>
              <ModelosTab projectId={projectId} canCurate={Boolean(projectDetails.canCurate)} />
            </TabsContent>

            <TabsContent value="artes" className="mt-3 md:mt-4">
              <p className="mb-3 text-sm text-muted-foreground">
                As artes aprovadas que servem de inspiração para as próximas gerações desta marca.
                Marque com a estrela na aba Criativos.
              </p>
              <ArtesReferenciaTab projectId={projectId} />
            </TabsContent>
          </Tabs>
        </TabsContent>

        <TabsContent value="criativos" className="mt-3 md:mt-4">
          <CreativesGallery projectId={projectId} />
        </TabsContent>

        {/* A agenda vive em `/projects/[id]/agenda`. O efeito acima redireciona
            quem chegar por `?tab=agenda`; este conteúdo é só o que se vê no
            quadro entre o clique e a navegação. */}
        <TabsContent value="agenda" className="mt-3 md:mt-4">
          <Card className="p-6">
            <Skeleton className="h-6 w-60" />
            <Skeleton className="mt-4 h-96 w-full" />
          </Card>
        </TabsContent>

        <TabsContent value="assets" className="mt-3 md:mt-4">
          <div className="space-y-6">
            {/* DNA primeiro: é o que muda o resultado das gerações. Os assets
                visuais (logos, cores, fontes) vêm em seguida — são a parte da
                identidade que o sistema injeta sozinho. */}
            <BrandDnaSection projectId={projectId} />
            {projectDetails && (
              <ArtImprovementPromptConfig
                projectId={projectId}
                initialPrompt={projectDetails.artImprovementPrompt}
              />
            )}
            <ProjectAssetsPanel projectId={projectId} />
          </div>
        </TabsContent>

        <TabsContent value="metricas" className="mt-3 md:mt-4">
          <ProjectAnalyticsPanel projectId={projectId} projectName={projectDetails?.name} />
        </TabsContent>

        <TabsContent value="configuracoes" className="mt-3 md:mt-4">
          <div className="space-y-6">
            {isLoadingProject ? (
              <Card className="p-6">
                <Skeleton className="h-6 w-60" />
                <Skeleton className="mt-4 h-4 w-full" />
                <Skeleton className="mt-2 h-4 w-1/2" />
              </Card>
            ) : projectDetails ? (
              <div className="space-y-6">
                {/* AI Chat Behavior Configuration */}
                <AIChatBehaviorConfig
                  projectId={projectId}
                  initialBehavior={projectDetails.aiChatBehavior}
                />

                {/* Project Tags Configuration */}
                <ProjectTagsConfig projectId={projectId} />

                {/* Instagram Account Configuration */}
                <InstagramAccountConfig
                  projectId={projectId}
                  instagramAccountId={projectDetails.instagramAccountId}
                  instagramUsername={projectDetails.instagramUsername}
                />

                {/* Token do Instagram (métricas e verificação) */}
                <InstagramTokenConfig
                  projectId={projectId}
                  hasToken={projectDetails.hasInstagramToken}
                  expiresAt={projectDetails.instagramTokenExpiresAt}
                  instagramUsername={projectDetails.instagramUsername}
                />

                {/* Later API Provider Configuration */}
                <LaterProviderConfig
                  projectId={projectId}
                  laterAccountId={projectDetails.laterAccountId}
                  laterProfileId={projectDetails.laterProfileId}
                  postingProvider={projectDetails.postingProvider}
                  instagramUsername={projectDetails.instagramUsername}
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
