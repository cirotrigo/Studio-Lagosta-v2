'use client'

import { useDeferredValue, useMemo, useState } from 'react'
import { useGerarCriativoModelPages } from '@/hooks/use-gerar-criativo-model-pages'
import { useGerarCriativo } from '../gerar-criativo-context'
import { useStepper } from '../stepper'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'
import { rankModelPagesForBrief } from '@/lib/gerar-criativo/model-page-ranking'
import { ImageIcon, FolderOpen, Sparkles } from 'lucide-react'

function ModelPageSelectionSkeleton() {
  return (
    <div className="space-y-4">
      <div>
        <Skeleton className="h-6 w-48" />
        <Skeleton className="h-4 w-64 mt-1" />
      </div>
      <div className="flex gap-3 overflow-x-auto pb-2">
        {[1, 2, 3, 4, 5].map((i) => (
          <Skeleton key={i} className="w-12 h-12 rounded-full flex-shrink-0" />
        ))}
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

interface ProjectFilter {
  id: number
  name: string
  logoUrl: string | null
}

export function ModelPageSelectionStep() {
  const { selectModelPageWithContext } = useGerarCriativo()
  const stepper = useStepper()
  const { data: modelPages, isLoading } = useGerarCriativoModelPages()
  const [selectedProjectFilter, setSelectedProjectFilter] = useState<number | null>(null)
  const [rankingBrief, setRankingBrief] = useState('')
  const deferredRankingBrief = useDeferredValue(rankingBrief)

  // Extract unique projects from model pages
  const projects = useMemo(() => {
    if (!modelPages || !Array.isArray(modelPages)) return []
    const projectMap = new Map<number, ProjectFilter>()
    modelPages.forEach((page) => {
      if (!projectMap.has(page.project.id)) {
        projectMap.set(page.project.id, {
          id: page.project.id,
          name: page.project.name,
          logoUrl: page.project.logoUrl,
        })
      }
    })
    return Array.from(projectMap.values())
  }, [modelPages])

  // Filter model pages by selected project
  const filteredModelPages = useMemo(() => {
    if (!modelPages || !Array.isArray(modelPages)) return []
    if (selectedProjectFilter === null) return modelPages
    return modelPages.filter((page) => page.project.id === selectedProjectFilter)
  }, [modelPages, selectedProjectFilter])

  const rankedModelPages = useMemo(() => {
    if (!deferredRankingBrief.trim()) {
      return filteredModelPages.map((page) => ({
        page,
        score: 0,
        reasons: [],
        label: 'Neutro' as const,
        templateContext: null,
      }))
    }

    return rankModelPagesForBrief(filteredModelPages, deferredRankingBrief)
  }, [deferredRankingBrief, filteredModelPages])

  const handleSelect = (page: (typeof modelPages)[number]) => {
    selectModelPageWithContext(
      page.project.id,
      page.templateId,
      page.id,
      page.layers,
      page.width,
      page.height,
      page.project.fonts
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

      <Card className="p-4 space-y-3">
        <div className="space-y-1">
          <div className="flex items-center gap-2 text-sm font-medium">
            <Sparkles className="w-4 h-4" />
            Recomendar modelos pelo brief
          </div>
          <p className="text-sm text-muted-foreground">
            Opcional. Descreva rapidamente a arte para priorizar os modelos com a estrutura mais compativel.
          </p>
        </div>
        <Textarea
          value={rankingBrief}
          onChange={(event) => setRankingBrief(event.target.value)}
          placeholder="Ex: almoco executivo com horario de segunda a sexta e CTA para pedir no WhatsApp"
          rows={3}
          className="resize-none"
        />
        {deferredRankingBrief.trim() && (
          <p className="text-xs text-muted-foreground">
            Os modelos abaixo foram reordenados para favorecer assunto, headline, descricao e rodape conforme o brief.
          </p>
        )}
      </Card>

      {/* Project logo filter carousel */}
      {projects.length > 1 && (
        <div className="flex gap-3 overflow-x-auto pb-2 scrollbar-thin scrollbar-thumb-muted scrollbar-track-transparent">
          <button
            onClick={() => setSelectedProjectFilter(null)}
            className={cn(
              'flex-shrink-0 w-12 h-12 rounded-full border-2 flex items-center justify-center transition-all',
              selectedProjectFilter === null
                ? 'border-primary bg-primary/10'
                : 'border-muted hover:border-muted-foreground/50'
            )}
            title="Todos os projetos"
          >
            <span className="text-xs font-medium">Todos</span>
          </button>
          {projects.map((project) => (
            <button
              key={project.id}
              onClick={() => setSelectedProjectFilter(project.id)}
              className={cn(
                'flex-shrink-0 w-12 h-12 rounded-full border-2 overflow-hidden transition-all',
                selectedProjectFilter === project.id
                  ? 'border-primary ring-2 ring-primary/30'
                  : 'border-muted hover:border-muted-foreground/50'
              )}
              title={project.name}
            >
              {project.logoUrl ? (
                <img
                  src={project.logoUrl}
                  alt={project.name}
                  className="w-full h-full object-cover"
                />
              ) : (
                <div className="w-full h-full bg-muted flex items-center justify-center">
                  <FolderOpen className="w-5 h-5 text-muted-foreground" />
                </div>
              )}
            </button>
          ))}
        </div>
      )}

      {rankedModelPages && rankedModelPages.length > 0 ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
          {rankedModelPages.map(({ page, label, reasons }, index) => (
            <Card
              key={page.id}
              className="cursor-pointer hover:border-primary hover:shadow-md transition-all overflow-hidden group"
              onClick={() => handleSelect(page)}
            >
              <div className="aspect-[9/16] relative bg-muted">
                {deferredRankingBrief.trim() && index < 3 && label !== 'Neutro' && (
                  <div className="absolute top-2 left-2 z-10">
                    <Badge variant={label === 'Mais indicado' ? 'default' : 'secondary'}>
                      {label}
                    </Badge>
                  </div>
                )}
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
                <p className="text-sm font-medium truncate">
                  {page.templateName || page.template.name}
                </p>
                {deferredRankingBrief.trim() && reasons.length > 0 && (
                  <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
                    {reasons.join(' • ')}
                  </p>
                )}
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
