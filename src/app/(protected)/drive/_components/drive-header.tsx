'use client'

import * as React from 'react'
import { Search, Filter, HardDrive } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import type { ProjectWithLogoResponse } from '@/hooks/use-project'
import type { DriveBreadcrumbEntry } from '@/types/drive'
import { ProjectSelector } from './project-selector'

interface DriveHeaderProps {
  projects: ProjectWithLogoResponse[]
  selectedProjectId: number | null
  onProjectChange: (projectId: number | null) => void
  search: string
  onSearchChange: (value: string) => void
  breadcrumbs: DriveBreadcrumbEntry[]
  onBreadcrumbClick: (folderId: string | null) => void
  isLoadingProjects?: boolean
  showProjectSelector?: boolean
}

export function DriveHeader({
  projects,
  selectedProjectId,
  onProjectChange,
  search,
  onSearchChange,
  breadcrumbs,
  onBreadcrumbClick,
  isLoadingProjects,
  showProjectSelector = true,
}: DriveHeaderProps) {
  const currentProject =
    projects.find((project) => project.id === selectedProjectId) ?? null

  return (
    <div className="flex flex-col gap-4 rounded-2xl border border-border/60 bg-gradient-to-br from-card/80 via-card/60 to-card/40 p-4 shadow-sm">
      <div className="flex flex-wrap items-center gap-3">
        {showProjectSelector ? (
          <ProjectSelector
            projects={projects}
            value={selectedProjectId}
            onChange={onProjectChange}
            isLoading={isLoadingProjects}
          />
        ) : (
          <div className="flex items-center gap-2 rounded-full border border-border/70 bg-background/60 px-4 py-2 text-sm font-medium">
            <HardDrive className="h-4 w-4 text-muted-foreground" />
            {currentProject ? currentProject.name : 'Projeto selecionado'}
          </div>
        )}
        <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
          {breadcrumbs.length === 0 ? (
            <span className="text-muted-foreground/80">Selecione um projeto para explorar as pastas do Drive.</span>
          ) : (
            breadcrumbs.map((crumb, index) => (
              <React.Fragment key={`${crumb.id}-${index}`}>
                {index > 0 && <span className="text-muted-foreground">/</span>}
                <button
                  type="button"
                  onClick={() => onBreadcrumbClick(crumb.id)}
                  className={cn(
                    'rounded-full px-3 py-1 text-xs font-medium transition-colors',
                    index === breadcrumbs.length - 1
                      ? 'bg-primary/10 text-primary'
                      : 'text-muted-foreground hover:text-foreground',
                  )}
                >
                  {crumb.name}
                </button>
              </React.Fragment>
            ))
          )}
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[220px]">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(event) => onSearchChange(event.target.value)}
            placeholder="Buscar por nome, tipo ou data"
            className="h-11 rounded-full pl-10"
          />
        </div>
        <Button variant="outline" className="rounded-full" disabled>
          <Filter className="mr-2 h-4 w-4" />
          Filtros
          <Badge variant="secondary" className="ml-2 rounded-full text-[10px]">em breve</Badge>
        </Button>
      </div>
    </div>
  )
}
