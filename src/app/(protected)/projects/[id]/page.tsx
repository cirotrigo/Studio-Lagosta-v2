'use client'

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useParams, useRouter } from 'next/navigation'
import { Plus, FileText, Image as ImageIcon, Trash2, Edit, Eye, Sparkles } from 'lucide-react'
import { api } from '@/lib/api-client'
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
          <TabsTrigger value="studio">Studio</TabsTrigger>
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
            <div className="flex items-center justify-center h-64">
              <p className="text-muted-foreground">Carregando templates...</p>
            </div>
          ) : templates && templates.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {templates.map((template) => (
                <Card key={template.id} className="overflow-hidden hover:shadow-lg transition-shadow">
                  <div className="aspect-[4/5] bg-muted relative group">
                    {template.thumbnailUrl ? (
                      <img
                        src={template.thumbnailUrl}
                        alt={template.name}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center">
                        <FileText className="w-12 h-12 text-muted-foreground" />
                      </div>
                    )}
                    <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                      <Button
                        size="icon"
                        variant="secondary"
                        asChild
                      >
                        <Link href={`/templates/${template.id}/editor`}>
                          <Edit className="w-4 h-4" />
                        </Link>
                      </Button>
                    </div>
                  </div>
                  <div className="p-4">
                    <h3 className="font-semibold mb-1 truncate">{template.name}</h3>
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground">
                        {getTypeLabel(template.type)}
                      </span>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        onClick={() => handleDelete(template.id, template.name)}
                        disabled={deleteMutation.isPending}
                      >
                        <Trash2 className="w-4 h-4 text-red-500" />
                      </Button>
                    </div>
                  </div>
                </Card>
              ))}
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

        <TabsContent value="studio" className="mt-6">
          <div className="flex flex-col items-center justify-center gap-6 py-16">
            <div className="flex flex-col items-center gap-4">
              <div className="p-4 bg-primary/10 rounded-full">
                <Sparkles className="w-12 h-12 text-primary" />
              </div>
              <div className="text-center max-w-md">
                <h3 className="font-semibold text-xl mb-2">Studio de Geração</h3>
                <p className="text-muted-foreground mb-6">
                  Crie criativos incríveis aplicando conteúdo dinâmico aos seus templates.
                  Selecione fotos, personalize textos e gere suas artes prontas para publicação.
                </p>
                <Button asChild size="lg">
                  <Link href={`/projects/${projectId}/studio`}>
                    <Sparkles className="w-4 h-4 mr-2" />
                    Abrir Studio
                  </Link>
                </Button>
              </div>
            </div>

            {templates && templates.length > 0 && (
              <Card className="p-4 max-w-md w-full">
                <p className="text-sm text-muted-foreground text-center">
                  ✨ Você tem {templates.length} {templates.length === 1 ? 'template disponível' : 'templates disponíveis'} para usar
                </p>
              </Card>
            )}
          </div>
        </TabsContent>

        <TabsContent value="criativos" className="mt-6">
          <Card className="p-6">
            <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
              <div className="space-y-2">
                <h3 className="text-lg font-semibold">Painel de Criativos</h3>
                <p className="text-sm text-muted-foreground">
                  Visualize e baixe todos os criativos gerados para este projeto. Aplique filtros, organize em grid ou lista e baixe em lote.
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Button variant="outline" asChild>
                  <Link href={`/projects/${projectId}/studio`}>
                    <Sparkles className="mr-2 h-4 w-4" /> Gerar novo criativo
                  </Link>
                </Button>
                <Button asChild>
                  <Link href={`/projects/${projectId}/creativos`}>
                    <ImageIcon className="mr-2 h-4 w-4" /> Abrir lista de criativos
                  </Link>
                </Button>
              </div>
            </div>
          </Card>
        </TabsContent>

        <TabsContent value="configuracoes" className="mt-6">
          <Card className="p-6">
            <h3 className="font-semibold mb-4">Configurações do Projeto</h3>
            <p className="text-muted-foreground">
              Configurações adicionais estarão disponíveis em breve
            </p>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}
