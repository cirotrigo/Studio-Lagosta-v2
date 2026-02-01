'use client'

import Link from 'next/link'
import { useTemplateModelPages, type ModelPage } from '@/hooks/use-template-model-pages'
import { useGerarCriativo } from '../gerar-criativo-context'
import { useStepper } from '../stepper'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { ChevronLeft, FileImage, Pencil } from 'lucide-react'
import type { Layer } from '@/types/template'

function ModelPageSkeleton() {
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Skeleton className="h-10 w-10" />
        <div>
          <Skeleton className="h-6 w-48" />
          <Skeleton className="h-4 w-64 mt-1" />
        </div>
      </div>
      <div className="flex gap-4 overflow-x-auto pb-4">
        {[1, 2, 3].map((i) => (
          <Skeleton key={i} className="flex-shrink-0 w-[200px] aspect-[9/16]" />
        ))}
      </div>
    </div>
  )
}

export function ModelPageStep() {
  const { selectedTemplateId, selectModelPage } = useGerarCriativo()
  const stepper = useStepper()
  const { data: modelPages, isLoading } = useTemplateModelPages(selectedTemplateId)

  const handleSelect = (page: ModelPage) => {
    selectModelPage(page.id, page.layers)
    stepper.next()
  }

  if (isLoading) {
    return <ModelPageSkeleton />
  }

  if (!modelPages || modelPages.length === 0) {
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon" onClick={() => stepper.prev()}>
            <ChevronLeft className="w-5 h-5" />
          </Button>
          <div>
            <h2 className="text-lg font-semibold">Selecione a Pagina Modelo</h2>
          </div>
        </div>
        <Card className="p-8 text-center">
          <div className="flex flex-col items-center gap-4">
            <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center">
              <FileImage className="w-8 h-8 text-muted-foreground" />
            </div>
            <div>
              <h3 className="font-medium">Nenhuma pagina modelo encontrada</h3>
              <p className="text-sm text-muted-foreground mt-1">
                Este template nao possui paginas modelo (isTemplate: true). Crie uma pagina modelo
                no editor de templates.
              </p>
            </div>
            <Button variant="outline" asChild>
              <Link href={`/templates/${selectedTemplateId}/editor`}>
                <Pencil className="w-4 h-4 mr-2" />
                Abrir Editor
              </Link>
            </Button>
          </div>
        </Card>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="icon" onClick={() => stepper.prev()}>
          <ChevronLeft className="w-5 h-5" />
        </Button>
        <div>
          <h2 className="text-lg font-semibold">Selecione a Pagina Modelo</h2>
          <p className="text-sm text-muted-foreground">Escolha o layout base para seu criativo</p>
        </div>
      </div>

      <div className="flex gap-4 overflow-x-auto pb-4 snap-x snap-mandatory md:grid md:grid-cols-3 md:overflow-visible">
        {modelPages.map((page) => {
          const layers = (page.layers || []) as Layer[]
          const dynamicCount = layers.filter((l) => l.isDynamic).length
          return (
            <Card
              key={page.id}
              className="flex-shrink-0 w-[200px] md:w-auto cursor-pointer hover:border-primary transition-colors snap-center"
              onClick={() => handleSelect(page)}
            >
              <div className="aspect-[9/16] bg-muted rounded-t overflow-hidden">
                {page.thumbnail ? (
                  <img
                    src={page.thumbnail}
                    alt={page.name}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center">
                    <FileImage className="w-12 h-12 text-muted-foreground" />
                  </div>
                )}
              </div>
              <div className="p-3">
                <p className="font-medium text-sm truncate">{page.name}</p>
                <p className="text-xs text-muted-foreground">{dynamicCount} campos dinamicos</p>
              </div>
            </Card>
          )
        })}
      </div>
    </div>
  )
}
