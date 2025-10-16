'use client'

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus, FolderOpen, Settings, Trash2 } from 'lucide-react'
import { api } from '@/lib/api-client'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import Link from 'next/link'
import { toast } from 'sonner'
import { ProjectShareControls } from '@/components/projects/project-share-controls'

const createProjectSchema = z.object({
  name: z.string().min(1, 'Nome é obrigatório'),
  description: z.string().optional(),
})

type CreateProjectData = z.infer<typeof createProjectSchema>

interface Project {
  id: number
  name: string
  description: string | null
  status: string
  createdAt: string
  userId: string
  _count?: {
    Template?: number
    Generation?: number
    templates?: number
    generations?: number
  }
  organizationShares?: Array<{
    organizationId: string
    organizationName: string | null
    defaultCanEdit: boolean
    sharedAt: string
  }>
  Logo?: Array<{
    id: number
    name: string
    fileUrl: string
    isProjectLogo: boolean
  }>
}

export default function ProjectsPage() {
  const [isDialogOpen, setIsDialogOpen] = useState(false)
  const queryClient = useQueryClient()

  const { data: projects, isLoading } = useQuery<Project[]>({
    queryKey: ['projects'],
    queryFn: () => api.get('/api/projects'),
  })

  const createMutation = useMutation({
    mutationFn: (data: CreateProjectData) => api.post('/api/projects', data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['projects'] })
      setIsDialogOpen(false)
      reset()
      toast.success('Projeto criado com sucesso!')
    },
    onError: () => {
      toast.error('Erro ao criar projeto')
    },
  })

  const deleteMutation = useMutation({
    mutationFn: (id: number) => api.delete(`/api/projects/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['projects'] })
      toast.success('Projeto deletado com sucesso!')
    },
    onError: () => {
      toast.error('Erro ao deletar projeto')
    },
  })

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<CreateProjectData>({
    resolver: zodResolver(createProjectSchema),
  })

  const onSubmit = (data: CreateProjectData) => {
    createMutation.mutate(data)
  }

  const handleDelete = (id: number, name: string) => {
    if (confirm(`Tem certeza que deseja deletar o projeto "${name}"?`)) {
      deleteMutation.mutate(id)
    }
  }

  return (
    <div className="container mx-auto px-4 py-6 md:p-8">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
        <div>
          <h1 className="text-3xl md:text-4xl font-bold bg-gradient-to-r from-foreground to-foreground/70 bg-clip-text text-transparent">
            Projetos
          </h1>
          <p className="text-muted-foreground mt-2">
            Gerencie seus projetos de criativos
          </p>
        </div>

        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogTrigger asChild>
            <Button size="lg" className="shadow-lg">
              <Plus className="w-4 h-4 mr-2" />
              Novo Projeto
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Criar Novo Projeto</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
              <div>
                <Label htmlFor="name">Nome do Projeto</Label>
                <Input
                  id="name"
                  {...register('name')}
                  placeholder="Ex: Campanha Verão 2024"
                />
                {errors.name && (
                  <p className="text-sm text-red-500 mt-1">{errors.name.message}</p>
                )}
              </div>

              <div>
                <Label htmlFor="description">Descrição (opcional)</Label>
                <Textarea
                  id="description"
                  {...register('description')}
                  placeholder="Descreva o objetivo deste projeto..."
                  rows={3}
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
                  {isSubmitting ? 'Criando...' : 'Criar Projeto'}
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center h-64">
          <div className="flex flex-col items-center gap-3">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
            <p className="text-muted-foreground">Carregando projetos...</p>
          </div>
        </div>
      ) : projects && projects.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {projects.map((project) => {
            const projectLogo = project.Logo?.find(logo => logo.isProjectLogo) ?? project.Logo?.[0]

            return (
              <Card key={project.id} className="group relative overflow-hidden hover:shadow-xl transition-all duration-300 border-border/40 bg-card/60 backdrop-blur-sm">
                {/* Gradient Background Effect */}
                <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />

                <div className="relative p-6 space-y-4">
                  {/* Header with Logo and Title */}
                  <div className="flex items-start gap-4">
                    {/* Project Logo or Icon */}
                    <div className="flex-shrink-0">
                      {projectLogo ? (
                        <div className="relative w-16 h-16 rounded-xl overflow-hidden bg-muted ring-2 ring-border/40 group-hover:ring-primary/40 transition-all duration-300">
                          <img
                            src={projectLogo.fileUrl}
                            alt={projectLogo.name}
                            className="w-full h-full object-cover"
                          />
                        </div>
                      ) : (
                        <div className="w-16 h-16 rounded-xl bg-gradient-to-br from-primary/20 to-primary/5 flex items-center justify-center ring-2 ring-border/40 group-hover:ring-primary/40 transition-all duration-300">
                          <FolderOpen className="w-7 h-7 text-primary" />
                        </div>
                      )}
                    </div>

                    {/* Title and Status */}
                    <div className="flex-1 min-w-0">
                      <h3 className="font-semibold text-lg mb-2 truncate group-hover:text-primary transition-colors">
                        {project.name}
                      </h3>
                      <span
                        className={`inline-flex items-center text-xs px-2.5 py-1 rounded-full font-medium ${
                          project.status === 'ACTIVE'
                            ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                            : 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-400'
                        }`}
                      >
                        <span className={`w-1.5 h-1.5 rounded-full mr-1.5 ${
                          project.status === 'ACTIVE' ? 'bg-green-500' : 'bg-gray-500'
                        }`} />
                        {project.status === 'ACTIVE' ? 'Ativo' : 'Inativo'}
                      </span>
                    </div>
                  </div>

                  {/* Description */}
                  {project.description && (
                    <p className="text-sm text-muted-foreground line-clamp-2 leading-relaxed">
                      {project.description}
                    </p>
                  )}

                  {/* Stats */}
                  <div className="flex gap-6 text-sm">
                    <div className="flex items-center gap-2">
                      <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
                        <span className="text-xs font-semibold text-primary">
                          {project._count?.Template ?? project._count?.templates ?? 0}
                        </span>
                      </div>
                      <span className="text-muted-foreground">templates</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
                        <span className="text-xs font-semibold text-primary">
                          {project._count?.Generation ?? project._count?.generations ?? 0}
                        </span>
                      </div>
                      <span className="text-muted-foreground">criativos</span>
                    </div>
                  </div>

                  {/* Share Controls */}
                  <div className="pt-2 border-t border-border/40">
                    <ProjectShareControls
                      projectId={project.id}
                      projectName={project.name}
                      shares={project.organizationShares ?? []}
                      variant="card"
                    />
                  </div>

                  {/* Actions */}
                  <div className="flex gap-2 pt-2">
                    <Button asChild variant="default" className="flex-1 group/btn">
                      <Link href={`/projects/${project.id}`}>
                        <Settings className="w-4 h-4 mr-2 group-hover/btn:rotate-90 transition-transform duration-300" />
                        Abrir Projeto
                      </Link>
                    </Button>
                    <Button
                      variant="outline"
                      size="icon"
                      onClick={() => handleDelete(project.id, project.name)}
                      disabled={deleteMutation.isPending}
                      className="hover:bg-red-50 hover:text-red-600 hover:border-red-200 dark:hover:bg-red-950 dark:hover:text-red-400 dark:hover:border-red-900 transition-colors"
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              </Card>
            )
          })}
        </div>
      ) : (
        <Card className="p-12 md:p-16 text-center border-dashed border-2 border-border/60 bg-card/40 backdrop-blur-sm">
          <div className="flex flex-col items-center gap-6 max-w-md mx-auto">
            <div className="relative">
              <div className="absolute inset-0 bg-primary/20 rounded-full blur-2xl" />
              <div className="relative p-6 bg-gradient-to-br from-primary/10 to-primary/5 rounded-full ring-2 ring-primary/20">
                <FolderOpen className="w-12 h-12 text-primary" />
              </div>
            </div>
            <div>
              <h3 className="font-semibold text-xl mb-2">Nenhum projeto ainda</h3>
              <p className="text-muted-foreground mb-6 leading-relaxed">
                Crie seu primeiro projeto para começar a organizar e criar criativos incríveis
              </p>
              <Button size="lg" onClick={() => setIsDialogOpen(true)} className="shadow-lg">
                <Plus className="w-4 h-4 mr-2" />
                Criar Primeiro Projeto
              </Button>
            </div>
          </div>
        </Card>
      )}
    </div>
  )
}
