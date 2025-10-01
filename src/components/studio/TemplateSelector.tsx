"use client"

import * as React from 'react'
import Image from 'next/image'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'

export interface TemplateSummary {
  id: number
  name: string
  type: string
  dimensions: string
  thumbnailUrl?: string | null
  updatedAt?: string
  createdAt?: string
}

interface TemplateSelectorProps {
  templates: TemplateSummary[] | undefined
  onSelect: (templateId: number) => void
  selectedTemplateId?: number | null
  isLoading?: boolean
}

const typeLabels: Record<string, string> = {
  STORY: 'Story',
  FEED: 'Feed',
  SQUARE: 'Quadrado',
}

export function TemplateSelector({
  templates,
  onSelect,
  selectedTemplateId,
  isLoading = false,
}: TemplateSelectorProps) {
  if (isLoading) {
    return (
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {Array.from({ length: 6 }).map((_, index) => (
          <Card key={index} className="p-4">
            <Skeleton className="mb-4 h-40 w-full" />
            <Skeleton className="mb-2 h-6 w-3/4" />
            <Skeleton className="h-4 w-1/2" />
          </Card>
        ))}
      </div>
    )
  }

  if (!templates || templates.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-border/60 p-6 text-center text-sm text-muted-foreground">
        Nenhum template disponível neste projeto. Crie um template primeiro para gerar criativos.
      </div>
    )
  }

  return (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
      {templates.map((template) => {
        const isSelected = selectedTemplateId === template.id
        const typeLabel = typeLabels[template.type] ?? template.type

        return (
          <Card
            key={template.id}
            className={cn(
              'relative flex h-full flex-col overflow-hidden border border-border/40 bg-card/70 transition hover:border-primary/40',
              isSelected && 'border-primary shadow-[0_0_0_1px_var(--primary)]',
            )}
          >
            <div className="relative h-44 w-full bg-muted">
              {template.thumbnailUrl ? (
                <Image
                  src={template.thumbnailUrl}
                  alt={template.name}
                  fill
                  className="object-cover"
                />
              ) : (
                <div className="flex h-full items-center justify-center text-xs text-muted-foreground">
                  Sem thumbnail
                </div>
              )}
            </div>
            <div className="flex flex-1 flex-col gap-3 p-4">
              <div className="space-y-1">
                <div className="flex items-center justify-between gap-2">
                  <h3 className="truncate text-sm font-semibold">{template.name}</h3>
                  <Badge variant="secondary" className="shrink-0">
                    {typeLabel}
                  </Badge>
                </div>
                <p className="text-xs text-muted-foreground">{template.dimensions}</p>
              </div>
              <div className="mt-auto flex items-center justify-end">
                <Button
                  size="sm"
                  variant={isSelected ? 'default' : 'outline'}
                  onClick={() => onSelect(template.id)}
                >
                  {isSelected ? 'Selecionado' : 'Selecionar'}
                </Button>
              </div>
            </div>
          </Card>
        )
      })}
    </div>
  )
}
