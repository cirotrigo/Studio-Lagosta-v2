'use client'

import { Button } from '@/components/ui/button'
import {
  CalendarIcon,
  Grid3x3,
  List,
  ChevronLeft,
  ChevronRight,
  Instagram,
  Plus,
  AlertCircle,
  Menu,
  Filter
} from 'lucide-react'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { toast } from 'sonner'
import { useRouter } from 'next/navigation'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { cn } from '@/lib/utils'
import type { Project, PostType } from '../../../../prisma/generated/client'

type ViewMode = 'month' | 'week' | 'day'

interface CalendarHeaderProps {
  selectedDate: Date
  onDateChange: (date: Date) => void
  viewMode: ViewMode
  onViewModeChange: (mode: ViewMode) => void
  selectedProject?: Project
  onCreatePost?: () => void
  postTypeFilter: PostType | 'ALL'
  onPostTypeFilterChange: (postType: PostType | 'ALL') => void
  onOpenChannels?: () => void
  isMobile?: boolean
}

export function CalendarHeader({
  selectedDate,
  onDateChange,
  viewMode,
  onViewModeChange,
  selectedProject,
  onCreatePost,
  postTypeFilter,
  onPostTypeFilterChange,
  onOpenChannels,
  isMobile = false
}: CalendarHeaderProps) {
  const router = useRouter()

  const navigateDate = (direction: 'prev' | 'next') => {
    const newDate = new Date(selectedDate)
    const step = direction === 'next' ? 1 : -1

    if (viewMode === 'week') {
      newDate.setDate(newDate.getDate() + step * 7)
    } else if (viewMode === 'day') {
      newDate.setDate(newDate.getDate() + step)
    } else {
      newDate.setMonth(newDate.getMonth() + step)
    }

    onDateChange(newDate)
  }

  const goToToday = () => {
    onDateChange(new Date())
  }

  const handleCreatePost = () => {
    if (!selectedProject) {
      toast.error('Selecione um projeto para criar um post')
      return
    }

    if (!selectedProject.instagramAccountId) {
      toast.error('Configure o Instagram antes de criar posts', {
        description: 'Clique para ir às configurações',
        action: {
          label: 'Configurar',
          onClick: () => router.push(`/projects/${selectedProject.id}?tab=configuracoes`)
        }
      })
      return
    }

    onCreatePost?.()
  }

  return (
    <div className="border-b border-border/40 bg-card/60 px-4 sm:px-6 py-3 sm:py-4 space-y-3 sm:space-y-4">
      {/* Linha 1: Nome do canal + métricas + ações */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 sm:gap-4">
          {/* Botão Menu Mobile */}
          {isMobile && onOpenChannels && (
            <Button
              variant="ghost"
              size="icon"
              onClick={onOpenChannels}
              className="flex-shrink-0"
            >
              <Menu className="w-5 h-5" />
            </Button>
          )}

          {selectedProject ? (
            <>
              <div className="flex items-center gap-2 sm:gap-3">
                {/* Avatar do projeto */}
                <div className={cn(
                  "rounded-full bg-gradient-to-br from-pink-500 to-purple-500 flex items-center justify-center text-white font-bold ring-2 ring-border",
                  isMobile ? "w-8 h-8 text-xs" : "w-10 h-10"
                )}>
                  {selectedProject.name.substring(0, 2).toUpperCase()}
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h1 className={cn(
                      "font-bold",
                      isMobile ? "text-lg" : "text-2xl"
                    )}>
                      {selectedProject.instagramUsername || selectedProject.name}
                    </h1>
                    {!isMobile && <Instagram className="w-5 h-5 text-pink-500" />}
                  </div>
                  {!isMobile && (
                    <p className="text-sm text-muted-foreground">
                      <span className="inline-flex items-center gap-1">
                        <span className="w-2 h-2 rounded-full bg-primary animate-pulse" />
                        1/3 posts enviados nesta semana
                      </span>
                    </p>
                  )}
                </div>
              </div>
            </>
          ) : (
            <div>
              <h1 className={cn(
                "font-bold",
                isMobile ? "text-lg" : "text-2xl"
              )}>
                Todos os canais
              </h1>
              {!isMobile && (
                <p className="text-sm text-muted-foreground">
                  <span className="inline-flex items-center gap-1">
                    <span className="w-2 h-2 rounded-full bg-primary animate-pulse" />
                    Visualizando todos os agendamentos
                  </span>
                </p>
              )}
            </div>
          )}
        </div>

        <div className="flex items-center gap-2">
          {/* Botão Novo Post */}
          {selectedProject && onCreatePost && (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <div>
                    <Button
                      onClick={handleCreatePost}
                      size={isMobile ? "sm" : "default"}
                      variant={!selectedProject.instagramAccountId ? 'outline' : 'default'}
                      className={!selectedProject.instagramAccountId ? 'opacity-60' : ''}
                    >
                      {!selectedProject.instagramAccountId && (
                        <AlertCircle className="w-4 h-4 sm:mr-2 text-amber-500" />
                      )}
                      {selectedProject.instagramAccountId && (
                        <Plus className="w-4 h-4 sm:mr-2" />
                      )}
                      {!isMobile && "Novo Post"}
                    </Button>
                  </div>
                </TooltipTrigger>
                {!selectedProject.instagramAccountId && (
                  <TooltipContent>
                    <p className="text-xs">Configure o Instagram nas configurações do projeto</p>
                  </TooltipContent>
                )}
              </Tooltip>
            </TooltipProvider>
          )}
          {/* View Mode Selector - apenas desktop */}
          {!isMobile && (
            <div className="flex items-center gap-1 border border-border/40 rounded-lg p-1">
              <Button
                variant={viewMode === 'month' ? 'secondary' : 'ghost'}
                size="sm"
                onClick={() => onViewModeChange('month')}
              >
                <Grid3x3 className="w-4 h-4" />
              </Button>
              <Button
                variant={viewMode === 'week' ? 'secondary' : 'ghost'}
                size="sm"
                onClick={() => onViewModeChange('week')}
              >
                <List className="w-4 h-4" />
              </Button>
              <Button
                variant={viewMode === 'day' ? 'secondary' : 'ghost'}
                size="sm"
                onClick={() => onViewModeChange('day')}
              >
                <CalendarIcon className="w-4 h-4" />
              </Button>
            </div>
          )}
        </div>
      </div>

      {/* Linha 2: Navegação + Filtros - Desktop */}
      {!isMobile && (
        <div className="flex items-center justify-between">
        {/* Navegação de Data */}
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => navigateDate('prev')}
          >
            <ChevronLeft className="w-4 h-4" />
          </Button>

          <div className="min-w-[200px] text-center">
            <h2 className="text-lg font-semibold capitalize">
              {selectedDate.toLocaleDateString('pt-BR', {
                month: 'long',
                year: 'numeric'
              })}
            </h2>
          </div>

          <Button
            variant="ghost"
            size="icon"
            onClick={() => navigateDate('next')}
          >
            <ChevronRight className="w-4 h-4" />
          </Button>

          <Button variant="outline" size="sm" onClick={goToToday}>
            Hoje
          </Button>
        </div>

          {/* Filtros */}
          <div className="flex items-center gap-2">
            <Select
              value={postTypeFilter}
              onValueChange={(value) => onPostTypeFilterChange(value as PostType | 'ALL')}
            >
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="Todos os formatos" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">Todos os formatos</SelectItem>
                <SelectItem value="POST">Post de feed</SelectItem>
                <SelectItem value="STORY">Story</SelectItem>
                <SelectItem value="REEL">Reels</SelectItem>
                <SelectItem value="CAROUSEL">Carrossel</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      )}

      {/* Linha 2: Navegação simplificada - Mobile */}
      {isMobile && (
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => navigateDate('prev')}
            >
              <ChevronLeft className="w-4 h-4" />
            </Button>

            <div className="text-center">
              <h2 className="text-sm font-semibold capitalize">
                {selectedDate.toLocaleDateString('pt-BR', {
                  month: 'long',
                  year: 'numeric'
                })}
              </h2>
            </div>

            <Button
              variant="ghost"
              size="icon"
              onClick={() => navigateDate('next')}
            >
              <ChevronRight className="w-4 h-4" />
            </Button>

            <Button variant="outline" size="sm" onClick={goToToday}>
              Hoje
            </Button>
          </div>

          {/* Filtro compacto */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm">
                <Filter className="w-4 h-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => onPostTypeFilterChange('ALL')}>
                Todos os formatos
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => onPostTypeFilterChange('POST')}>
                Post de feed
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => onPostTypeFilterChange('STORY')}>
                Story
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => onPostTypeFilterChange('REEL')}>
                Reels
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => onPostTypeFilterChange('CAROUSEL')}>
                Carrossel
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      )}
    </div>
  )
}
