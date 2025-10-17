'use client'

import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  CalendarIcon,
  Grid3x3,
  List,
  ChevronLeft,
  ChevronRight,
  MapPin,
  Tag,
  MoreHorizontal,
  MessageCircle,
  Instagram,
  Plus,
  AlertCircle
} from 'lucide-react'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { toast } from 'sonner'
import { useRouter } from 'next/navigation'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import type { Project } from '../../../../prisma/generated/client'

type ViewMode = 'month' | 'week' | 'day'

interface CalendarHeaderProps {
  selectedDate: Date
  onDateChange: (date: Date) => void
  viewMode: ViewMode
  onViewModeChange: (mode: ViewMode) => void
  selectedProject?: Project
  onCreatePost?: () => void
}

export function CalendarHeader({
  selectedDate,
  onDateChange,
  viewMode,
  onViewModeChange,
  selectedProject,
  onCreatePost
}: CalendarHeaderProps) {
  const router = useRouter()

  const navigateMonth = (direction: 'prev' | 'next') => {
    const newDate = new Date(selectedDate)
    newDate.setMonth(newDate.getMonth() + (direction === 'next' ? 1 : -1))
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
    <div className="border-b border-border/40 bg-card/60 px-6 py-4 space-y-4">
      {/* Linha 1: Nome do canal + métricas + ações */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          {selectedProject ? (
            <>
              <div className="flex items-center gap-3">
                {/* Avatar do projeto */}
                <div className="w-10 h-10 rounded-full bg-gradient-to-br from-pink-500 to-purple-500 flex items-center justify-center text-white font-bold ring-2 ring-border">
                  {selectedProject.name.substring(0, 2).toUpperCase()}
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h1 className="text-2xl font-bold">
                      {selectedProject.instagramUsername || selectedProject.name}
                    </h1>
                    <Instagram className="w-5 h-5 text-pink-500" />
                  </div>
                  <p className="text-sm text-muted-foreground">
                    <span className="inline-flex items-center gap-1">
                      <span className="w-2 h-2 rounded-full bg-primary animate-pulse" />
                      1/3 posts sent this week
                    </span>
                  </p>
                </div>
              </div>
            </>
          ) : (
            <div>
              <h1 className="text-2xl font-bold">All Channels</h1>
              <p className="text-sm text-muted-foreground">
                <span className="inline-flex items-center gap-1">
                  <span className="w-2 h-2 rounded-full bg-primary animate-pulse" />
                  Viewing all scheduled posts
                </span>
              </p>
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
                      variant={!selectedProject.instagramAccountId ? 'outline' : 'default'}
                      className={!selectedProject.instagramAccountId ? 'opacity-60' : ''}
                    >
                      {!selectedProject.instagramAccountId && (
                        <AlertCircle className="w-4 h-4 mr-2 text-amber-500" />
                      )}
                      {selectedProject.instagramAccountId && (
                        <Plus className="w-4 h-4 mr-2" />
                      )}
                      Novo Post
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

          <Button variant="ghost" size="sm">
            <MessageCircle className="w-4 h-4 mr-2" />
            Share Feedback
          </Button>

          {/* View Mode Selector */}
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
        </div>
      </div>

      {/* Linha 2: Navegação + Filtros */}
      <div className="flex items-center justify-between">
        {/* Navegação de Data */}
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => navigateMonth('prev')}
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
            onClick={() => navigateMonth('next')}
          >
            <ChevronRight className="w-4 h-4" />
          </Button>

          <Button variant="outline" size="sm" onClick={goToToday}>
            Hoje
          </Button>

          <Select value="month">
            <SelectTrigger className="w-[140px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="month">Mês</SelectItem>
              <SelectItem value="week">Semana</SelectItem>
              <SelectItem value="day">Dia</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Filtros */}
        <div className="flex items-center gap-2">
          <Select>
            <SelectTrigger className="w-[140px]">
              <SelectValue placeholder="All Posts" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Posts</SelectItem>
              <SelectItem value="scheduled">Scheduled</SelectItem>
              <SelectItem value="published">Published</SelectItem>
              <SelectItem value="draft">Draft</SelectItem>
            </SelectContent>
          </Select>

          <Button variant="outline" size="sm">
            <Tag className="w-4 h-4 mr-2" />
            Tags
          </Button>

          <Button variant="outline" size="sm">
            <MapPin className="w-4 h-4 mr-2" />
            @Sao Paulo
          </Button>

          <Button variant="outline" size="sm">
            <MoreHorizontal className="w-4 h-4" />
          </Button>
        </div>
      </div>
    </div>
  )
}
