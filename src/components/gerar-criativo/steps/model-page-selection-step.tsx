'use client'

import { useGerarCriativoModelPages } from '@/hooks/use-gerar-criativo-model-pages'
import { useGerarCriativo } from '../gerar-criativo-context'
import { useStepper } from '../stepper'
import { Card } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { ImageIcon, FolderOpen } from 'lucide-react'

function ModelPageSelectionSkeleton() {
  return (
    <div className="space-y-4">
      <div>
        <Skeleton className="h-6 w-48" />
        <Skeleton className="h-4 w-64 mt-1" />
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
        {[1, 2, 3, 4, 5, 6, 7, 8].map((i) => (
          <div key={i} className="space-y-2">
            <Skeleton className="aspect-[9/16] w-full rounded-lg" />
            <Skeleton className="h-4 w-full" />
          </div>
        ))}
      </div>
    </div>
  )
}

export function ModelPageSelectionStep() {
  const { selectModelPageWithContext } = useGerarCriativo()
  const stepper = useStepper()
  const { data: modelPages, isLoading } = useGerarCriativoModelPages()

  const handleSelect = (page: (typeof modelPages)[number]) => {
    selectModelPageWithContext(
      page.project.id,
      page.templateId,
      page.id,
      page.layers
    )
    stepper.next()
  }

  if (isLoading) {
    return <ModelPageSelectionSkeleton />
  }

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold">Escolha o Modelo</h2>
        <p className="text-sm text-muted-foreground">
          Selecione uma pagina modelo para criar seu criativo
        </p>
      </div>

      {modelPages && modelPages.length > 0 ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
          {modelPages.map((page) => (
            <Card
              key={page.id}
              className="cursor-pointer hover:border-primary hover:shadow-md transition-all overflow-hidden group"
              onClick={() => handleSelect(page)}
            >
              <div className="aspect-[9/16] relative bg-muted">
                {page.thumbnail ? (
                  <img
                    src={page.thumbnail}
                    alt={page.templateName || page.name}
                    className="absolute inset-0 w-full h-full object-cover group-hover:scale-105 transition-transform"
                  />
                ) : (
                  <div className="absolute inset-0 flex items-center justify-center">
                    <ImageIcon className="w-12 h-12 text-muted-foreground/50" />
                  </div>
                )}
              </div>
              <div className="p-3">
                <div className="flex items-center gap-2 mb-1">
                  {page.project.logoUrl ? (
                    <img
                      src={page.project.logoUrl}
                      alt={page.project.name}
                      className="w-5 h-5 rounded object-cover flex-shrink-0"
                    />
                  ) : (
                    <div className="w-5 h-5 rounded bg-muted flex items-center justify-center flex-shrink-0">
                      <FolderOpen className="w-3 h-3 text-muted-foreground" />
                    </div>
                  )}
                  <span className="text-xs text-muted-foreground truncate">
                    {page.project.name}
                  </span>
                </div>
                <p className="text-sm font-medium truncate">
                  {page.templateName || page.name}
                </p>
              </div>
            </Card>
          ))}
        </div>
      ) : (
        <Card className="p-8 text-center">
          <div className="flex flex-col items-center gap-4">
            <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center">
              <ImageIcon className="w-8 h-8 text-muted-foreground" />
            </div>
            <div>
              <h3 className="font-medium">Nenhum modelo encontrado</h3>
              <p className="text-sm text-muted-foreground mt-1">
                Marque uma pagina como modelo no editor de templates para comecar
              </p>
            </div>
          </div>
        </Card>
      )}
    </div>
  )
}
