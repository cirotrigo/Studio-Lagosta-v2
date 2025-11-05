'use client'

import { useState } from 'react'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'
import { Search, Instagram, AlertCircle, ChevronLeft, ChevronRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import Image from 'next/image'
import type { ProjectResponse } from '@/hooks/use-project'

type ProjectWithCounts = ProjectResponse & {
  scheduledPostCount?: number
  Logo?: Array<{
    id: number
    fileUrl: string
  }>
}

interface ChannelsSidebarProps {
  projects: ProjectWithCounts[]
  selectedProjectId: number | null
  onSelectProject: (projectId: number | null) => void
  isCollapsed?: boolean
  onToggleCollapse?: () => void
}

export function ChannelsSidebar({
  projects,
  selectedProjectId,
  onSelectProject,
  isCollapsed = false,
  onToggleCollapse,
}: ChannelsSidebarProps) {
  const [searchQuery, setSearchQuery] = useState('')

  const filteredProjects = projects.filter((project) =>
    project.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    project.instagramUsername?.toLowerCase().includes(searchQuery.toLowerCase())
  )

  const totalPosts = projects.reduce(
    (acc, project) => acc + (project.scheduledPostCount ?? 0),
    0
  )

  // Versão colapsada
  if (isCollapsed) {
    return (
      <div className="w-20 border-r border-border/40 bg-card/30 flex flex-col">
        {/* Botão de toggle */}
        <div className="p-2 border-b border-border/40 flex justify-center">
          <Button
            variant="ghost"
            size="icon"
            onClick={onToggleCollapse}
            className="h-8 w-8"
          >
            <ChevronRight className="w-4 h-4" />
          </Button>
        </div>

        <ScrollArea className="flex-1">
          <TooltipProvider>
            <div className="p-2 space-y-2">
              {/* Botão "Todos os canais" */}
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    onClick={() => onSelectProject(null)}
                    className={cn(
                      'w-full flex items-center justify-center p-2 rounded-lg transition-colors relative',
                      selectedProjectId === null
                        ? 'bg-primary text-primary-foreground'
                        : 'hover:bg-muted/50'
                    )}
                  >
                    <div className="relative w-10 h-10">
                      <div className="w-10 h-10 rounded-full bg-gradient-to-br from-primary/20 to-primary/10 flex items-center justify-center">
                        <Instagram className="w-5 h-5" />
                      </div>
                      {totalPosts > 0 && (
                        <div className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 bg-red-500 rounded-full flex items-center justify-center z-10">
                          <span className="text-[9px] font-bold text-white leading-none">
                            {totalPosts > 99 ? '99+' : totalPosts}
                          </span>
                        </div>
                      )}
                    </div>
                  </button>
                </TooltipTrigger>
                <TooltipContent side="right">
                  <p className="text-xs font-medium">Todos os canais</p>
                  <p className="text-xs text-muted-foreground">
                    {projects.length} canais conectados
                  </p>
                </TooltipContent>
              </Tooltip>

              {/* Lista de projetos */}
              {projects.map((project) => {
                const postCount = project.scheduledPostCount ?? 0
                const isSelected = selectedProjectId === project.id
                const hasInstagram = Boolean(project.instagramAccountId)
                const logoUrl = project.logoUrl || project.Logo?.[0]?.fileUrl

                return (
                  <Tooltip key={project.id}>
                    <TooltipTrigger asChild>
                      <button
                        onClick={() => onSelectProject(project.id)}
                        className={cn(
                          'w-full flex items-center justify-center p-2 rounded-lg transition-colors relative',
                          isSelected
                            ? 'bg-primary text-primary-foreground'
                            : 'hover:bg-muted/50',
                          !hasInstagram && 'opacity-60'
                        )}
                      >
                        <div className="relative w-10 h-10">
                          <div
                            className={cn(
                              'w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 overflow-hidden',
                              logoUrl ? 'bg-white border-2 border-border' : 'bg-gradient-to-br text-white font-bold text-sm',
                              !logoUrl && (hasInstagram ? 'from-pink-500 to-purple-500' : 'from-gray-400 to-gray-500')
                            )}
                          >
                            {logoUrl ? (
                              <Image
                                src={logoUrl}
                                alt={project.name}
                                fill
                                sizes="40px"
                                className="object-contain p-1"
                                unoptimized
                              />
                            ) : (
                              project.name.substring(0, 2).toUpperCase()
                            )}
                          </div>
                          {!hasInstagram && (
                            <div className="absolute -top-1 -right-1 w-4 h-4 bg-amber-500 rounded-full flex items-center justify-center z-10">
                              <AlertCircle className="w-3 h-3 text-white" />
                            </div>
                          )}
                          {hasInstagram && postCount > 0 && (
                            <div className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 bg-red-500 rounded-full flex items-center justify-center z-10">
                              <span className="text-[9px] font-bold text-white leading-none">
                                {postCount > 99 ? '99+' : postCount}
                              </span>
                            </div>
                          )}
                        </div>
                      </button>
                    </TooltipTrigger>
                    <TooltipContent side="right">
                      <p className="text-xs font-medium">
                        {project.instagramUsername || project.name}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {hasInstagram ? project.name : 'Instagram não configurado'}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {postCount} {postCount === 1 ? 'post' : 'posts'}
                      </p>
                    </TooltipContent>
                  </Tooltip>
                )
              })}

              {filteredProjects.length === 0 && (
                <div className="py-8 text-center text-sm text-muted-foreground">
                  Nenhum canal encontrado
                </div>
              )}
            </div>
          </TooltipProvider>
        </ScrollArea>
      </div>
    )
  }

  // Versão expandida (original)
  return (
    <div className="w-80 border-r border-border/40 bg-card/30 flex flex-col">
      <div className="p-4 border-b border-border/40">
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-semibold text-lg">Canais</h2>
          <Button
            variant="ghost"
            size="icon"
            onClick={onToggleCollapse}
            className="h-8 w-8"
          >
            <ChevronLeft className="w-4 h-4" />
          </Button>
        </div>

        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Buscar canais..."
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
            className="pl-9"
          />
        </div>
      </div>

      <ScrollArea className="flex-1">
        <div className="p-2 space-y-1">
          <button
            onClick={() => onSelectProject(null)}
            className={cn(
              'w-full flex items-center gap-3 p-3 rounded-lg transition-colors text-left',
              selectedProjectId === null
                ? 'bg-primary text-primary-foreground'
                : 'hover:bg-muted/50'
            )}
          >
            <div className="w-10 h-10 rounded-full bg-gradient-to-br from-primary/20 to-primary/10 flex items-center justify-center">
              <Instagram className="w-5 h-5" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-medium truncate">Todos os canais</p>
              <p className="text-xs text-muted-foreground">
                {projects.length} canais conectados
              </p>
            </div>
            <Badge variant="secondary" className="ml-auto">
              {totalPosts}
            </Badge>
          </button>

          {filteredProjects.map((project) => {
            const postCount = project.scheduledPostCount ?? 0
            const isSelected = selectedProjectId === project.id
            const hasInstagram = Boolean(project.instagramAccountId)
            const logoUrl = project.logoUrl || project.Logo?.[0]?.fileUrl

            return (
              <TooltipProvider key={project.id}>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      onClick={() => onSelectProject(project.id)}
                      className={cn(
                        'w-full flex items-center gap-3 p-3 rounded-lg transition-colors text-left',
                        isSelected
                          ? 'bg-primary text-primary-foreground'
                          : 'hover:bg-muted/50',
                        !hasInstagram && 'opacity-60'
                      )}
                    >
                      <div
                        className={cn(
                          'w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 relative overflow-hidden',
                          logoUrl ? 'bg-white border-2 border-border' : 'bg-gradient-to-br text-white font-bold text-sm',
                          !logoUrl && (hasInstagram ? 'from-pink-500 to-purple-500' : 'from-gray-400 to-gray-500')
                        )}
                      >
                        {logoUrl ? (
                          <Image
                            src={logoUrl}
                            alt={project.name}
                            fill
                            sizes="40px"
                            className="object-contain p-1"
                            unoptimized
                          />
                        ) : (
                          project.name.substring(0, 2).toUpperCase()
                        )}
                        {!hasInstagram && (
                          <div className="absolute -top-1 -right-1 w-4 h-4 bg-amber-500 rounded-full flex items-center justify-center">
                            <AlertCircle className="w-3 h-3 text-white" />
                          </div>
                        )}
                      </div>

                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="font-medium truncate">
                            {project.instagramUsername || project.name}
                          </p>
                          {hasInstagram && (
                            <Instagram className="w-3 h-3 flex-shrink-0 text-pink-500" />
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground truncate">
                          {hasInstagram ? project.name : 'Instagram não configurado'}
                        </p>
                      </div>

                      <Badge
                        variant={isSelected ? 'outline' : 'secondary'}
                        className="ml-auto"
                      >
                        {postCount}
                      </Badge>
                    </button>
                  </TooltipTrigger>
                  {!hasInstagram && (
                    <TooltipContent side="right">
                      <p className="text-xs">
                        Configure o Instagram nas configurações do projeto
                      </p>
                    </TooltipContent>
                  )}
                </Tooltip>
              </TooltipProvider>
            )
          })}

          {filteredProjects.length === 0 && (
            <div className="py-8 text-center text-sm text-muted-foreground">
              Nenhum canal encontrado
            </div>
          )}
        </div>
      </ScrollArea>
    </div>
  )
}
