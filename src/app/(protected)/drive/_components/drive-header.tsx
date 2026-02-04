'use client'

import * as React from 'react'
import { Search, Filter, HardDrive, Sparkles, Image, Video, Folder, Check } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
  DropdownMenuLabel,
} from '@/components/ui/dropdown-menu'
import { cn } from '@/lib/utils'
import type { ProjectWithLogoResponse } from '@/hooks/use-project'
import type { DriveBreadcrumbEntry } from '@/types/drive'
import { ProjectSelector } from './project-selector'

export type DriveFilterType = 'all' | 'ai-generated' | 'images' | 'videos' | 'folders'

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
  filter?: DriveFilterType
  onFilterChange?: (filter: DriveFilterType) => void
}

const FILTER_OPTIONS: { value: DriveFilterType; label: string; icon: React.ReactNode }[] = [
  { value: 'all', label: 'Todos', icon: null },
  { value: 'ai-generated', label: 'Gerados com IA', icon: <Sparkles className="h-4 w-4 text-purple-500" /> },
  { value: 'images', label: 'Imagens', icon: <Image className="h-4 w-4 text-blue-500" /> },
  { value: 'videos', label: 'Vídeos', icon: <Video className="h-4 w-4 text-red-500" /> },
  { value: 'folders', label: 'Pastas', icon: <Folder className="h-4 w-4 text-yellow-500" /> },
]

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
  filter = 'all',
  onFilterChange,
}: DriveHeaderProps) {
  const currentProject =
    projects.find((project) => project.id === selectedProjectId) ?? null
  const currentFilter = FILTER_OPTIONS.find((f) => f.value === filter) ?? FILTER_OPTIONS[0]
  const hasActiveFilter = filter !== 'all'

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
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant={hasActiveFilter ? "default" : "outline"}
              className={cn(
                "rounded-full",
                hasActiveFilter && "bg-primary/90 hover:bg-primary"
              )}
            >
              {hasActiveFilter && currentFilter.icon ? (
                <span className="mr-2">{currentFilter.icon}</span>
              ) : (
                <Filter className="mr-2 h-4 w-4" />
              )}
              {hasActiveFilter ? currentFilter.label : 'Filtros'}
              {hasActiveFilter && (
                <Badge variant="secondary" className="ml-2 rounded-full text-[10px] bg-white/20 text-white">
                  1
                </Badge>
              )}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-48">
            <DropdownMenuLabel>Filtrar por tipo</DropdownMenuLabel>
            <DropdownMenuSeparator />
            {FILTER_OPTIONS.map((option) => (
              <DropdownMenuItem
                key={option.value}
                onClick={() => onFilterChange?.(option.value)}
                className="flex items-center justify-between"
              >
                <span className="flex items-center gap-2">
                  {option.icon}
                  {option.label}
                </span>
                {filter === option.value && (
                  <Check className="h-4 w-4 text-primary" />
                )}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  )
}
