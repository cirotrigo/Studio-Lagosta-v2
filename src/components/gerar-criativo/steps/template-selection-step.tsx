'use client'

import Link from 'next/link'
import { useTemplates } from '@/hooks/use-templates'
import { useGerarCriativo } from '../gerar-criativo-context'
import { useStepper } from '../stepper'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { ChevronLeft, Plus, LayoutTemplate } from 'lucide-react'

function TemplateCard({
  template,
  onSelect,
}: {
  template: { id: number; name: string; type: string; thumbnailUrl?: string | null }
  onSelect: () => void
}) {
  return (
    <Card
      className="cursor-pointer hover:border-primary transition-colors overflow-hidden"
      onClick={onSelect}
    >
      <div className="aspect-[9/16] bg-muted">
        {template.thumbnailUrl ? (
          <img
            src={template.thumbnailUrl}
            alt={template.name}
            className="w-full h-full object-cover"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <LayoutTemplate className="w-8 h-8 text-muted-foreground" />
          </div>
        )}
      </div>
      <div className="p-3">
        <p className="font-medium text-sm truncate">{template.name}</p>
        <p className="text-xs text-muted-foreground">{template.type}</p>
      </div>
    </Card>
  )
}

function TemplateSelectionSkeleton() {
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Skeleton className="h-10 w-10" />
        <div>
          <Skeleton className="h-6 w-48" />
          <Skeleton className="h-4 w-64 mt-1" />
        </div>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
        {[1, 2, 3, 4].map((i) => (
          <Skeleton key={i} className="aspect-[9/16]" />
        ))}
      </div>
    </div>
  )
}

export function TemplateSelectionStep() {
  const { selectedProjectId, selectTemplate } = useGerarCriativo()
  const stepper = useStepper()
  const { data: templates, isLoading } = useTemplates({ projectId: selectedProjectId })

  const storyTemplates = templates?.filter((t) => t.type === 'STORY') || []
  const otherTemplates = templates?.filter((t) => t.type !== 'STORY') || []

  const handleSelect = (templateId: number) => {
    selectTemplate(templateId)
    stepper.next()
  }

  if (isLoading) {
    return <TemplateSelectionSkeleton />
  }

  if (!templates || templates.length === 0) {
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon" onClick={() => stepper.prev()}>
            <ChevronLeft className="w-5 h-5" />
          </Button>
          <div>
            <h2 className="text-lg font-semibold">Selecione o Template</h2>
          </div>
        </div>
        <Card className="p-8 text-center">
          <div className="flex flex-col items-center gap-4">
            <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center">
              <LayoutTemplate className="w-8 h-8 text-muted-foreground" />
            </div>
            <div>
              <h3 className="font-medium">Nenhum template encontrado</h3>
              <p className="text-sm text-muted-foreground mt-1">
                Este projeto nao possui templates. Crie um template primeiro.
              </p>
            </div>
            <Button variant="outline" asChild>
              <Link href={`/projects/${selectedProjectId}/templates/new`}>
                <Plus className="w-4 h-4 mr-2" />
                Criar Template
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
          <h2 className="text-lg font-semibold">Selecione o Template</h2>
          <p className="text-sm text-muted-foreground">
            Stories sao recomendados para publicacao rapida
          </p>
        </div>
      </div>

      {storyTemplates.length > 0 && (
        <div>
          <h3 className="text-sm font-medium mb-2 flex items-center gap-2">
            <span>*</span> Stories (Recomendado)
          </h3>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
            {storyTemplates.map((template) => (
              <TemplateCard
                key={template.id}
                template={template}
                onSelect={() => handleSelect(template.id)}
              />
            ))}
          </div>
        </div>
      )}

      {otherTemplates.length > 0 && (
        <div>
          <h3 className="text-sm font-medium mb-2">Outros Formatos</h3>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
            {otherTemplates.map((template) => (
              <TemplateCard
                key={template.id}
                template={template}
                onSelect={() => handleSelect(template.id)}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
