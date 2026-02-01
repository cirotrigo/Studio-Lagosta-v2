'use client'

import { useProjects } from '@/hooks/use-project'
import { useGerarCriativo } from '../gerar-criativo-context'
import { useStepper } from '../stepper'
import { Card } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { FolderOpen, ChevronRight } from 'lucide-react'

function ProjectSelectionSkeleton() {
  return (
    <div className="space-y-4">
      <div>
        <Skeleton className="h-6 w-48" />
        <Skeleton className="h-4 w-64 mt-1" />
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {[1, 2, 3, 4, 5, 6].map((i) => (
          <Skeleton key={i} className="h-20" />
        ))}
      </div>
    </div>
  )
}

export function ProjectSelectionStep() {
  const { selectProject } = useGerarCriativo()
  const stepper = useStepper()
  const { data: projects, isLoading } = useProjects()

  const handleSelect = (projectId: number) => {
    selectProject(projectId)
    stepper.next()
  }

  if (isLoading) {
    return <ProjectSelectionSkeleton />
  }

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold">Selecione o Projeto</h2>
        <p className="text-sm text-muted-foreground">
          Escolha o projeto onde o criativo sera salvo
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {projects?.map((project) => (
          <Card
            key={project.id}
            className="cursor-pointer hover:border-primary transition-colors p-4"
            onClick={() => handleSelect(project.id)}
          >
            <div className="flex items-center gap-3">
              {project.Logo?.[0]?.fileUrl ? (
                <img
                  src={project.Logo[0].fileUrl}
                  alt={project.name}
                  className="w-12 h-12 rounded object-cover"
                />
              ) : (
                <div className="w-12 h-12 rounded bg-muted flex items-center justify-center">
                  <FolderOpen className="w-6 h-6 text-muted-foreground" />
                </div>
              )}
              <div className="flex-1 min-w-0">
                <p className="font-medium truncate">{project.name}</p>
                <p className="text-xs text-muted-foreground">
                  {project._count?.Template || 0} templates
                </p>
              </div>
              <ChevronRight className="w-5 h-5 text-muted-foreground" />
            </div>
          </Card>
        ))}
      </div>

      {(!projects || projects.length === 0) && (
        <Card className="p-8 text-center">
          <div className="flex flex-col items-center gap-4">
            <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center">
              <FolderOpen className="w-8 h-8 text-muted-foreground" />
            </div>
            <div>
              <h3 className="font-medium">Nenhum projeto encontrado</h3>
              <p className="text-sm text-muted-foreground mt-1">
                Crie um projeto primeiro para comecar a gerar criativos
              </p>
            </div>
          </div>
        </Card>
      )}
    </div>
  )
}
