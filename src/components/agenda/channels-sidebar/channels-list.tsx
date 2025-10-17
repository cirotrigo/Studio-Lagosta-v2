'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
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
import { Search, Plus, Settings, Tag, Instagram, AlertCircle } from 'lucide-react'
import type { Project } from '../../../../prisma/generated/client'

interface ChannelsSidebarProps {
  projects: Project[]
  selectedProjectId: number | null
  onSelectProject: (projectId: number | null) => void
}

export function ChannelsSidebar({
  projects,
  selectedProjectId,
  onSelectProject
}: ChannelsSidebarProps) {
  const [searchQuery, setSearchQuery] = useState('')

  // Filter projects by search
  const filteredProjects = projects.filter(project =>
    project.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    project.instagramUsername?.toLowerCase().includes(searchQuery.toLowerCase())
  )

  // Count posts for each project (simulated for now)
  const getPostCount = (_projectId: number) => {
    // TODO: Implement actual post count from API
    return Math.floor(Math.random() * 10)
  }

  const totalPosts = projects.reduce((acc, p) => acc + getPostCount(p.id), 0)

  return (
    <div className="w-80 border-r border-border/40 bg-card/30 flex flex-col">
      {/* Header */}
      <div className="p-4 border-b border-border/40">
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-semibold text-lg">Channels</h2>
          <Button size="icon" variant="ghost">
            <Plus className="w-4 h-4" />
          </Button>
        </div>

        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Search channels..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9"
          />
        </div>
      </div>

      {/* Channels List */}
      <ScrollArea className="flex-1">
        <div className="p-2 space-y-1">
          {/* All Channels */}
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
              <p className="font-medium truncate">All Channels</p>
              <p className="text-xs text-muted-foreground">
                {projects.length} channels
              </p>
            </div>
            <Badge variant="secondary" className="ml-auto">
              {totalPosts}
            </Badge>
          </button>

          {/* Individual Projects */}
          {filteredProjects.map((project) => {
            const postCount = getPostCount(project.id)
            const isSelected = selectedProjectId === project.id
            const hasInstagram = Boolean(project.instagramAccountId)

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
                      {/* Avatar */}
                      <div className={cn(
                        "w-10 h-10 rounded-full bg-gradient-to-br flex items-center justify-center text-white font-bold text-sm flex-shrink-0 relative",
                        hasInstagram ? "from-pink-500 to-purple-500" : "from-gray-400 to-gray-500"
                      )}>
                        {project.name.substring(0, 2).toUpperCase()}
                        {!hasInstagram && (
                          <div className="absolute -top-1 -right-1 w-4 h-4 bg-amber-500 rounded-full flex items-center justify-center">
                            <AlertCircle className="w-3 h-3 text-white" />
                          </div>
                        )}
                      </div>

                      {/* Info */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="font-medium truncate">
                            {project.instagramUsername || project.name}
                          </p>
                          {hasInstagram && <Instagram className="w-3 h-3 flex-shrink-0 text-pink-500" />}
                        </div>
                        <p className="text-xs text-muted-foreground truncate">
                          {hasInstagram ? project.name : 'Instagram não configurado'}
                        </p>
                      </div>

                      {/* Post count */}
                      {postCount > 0 && (
                        <Badge
                          variant={isSelected ? 'outline' : 'secondary'}
                          className="ml-auto"
                        >
                          {postCount}
                        </Badge>
                      )}
                    </button>
                  </TooltipTrigger>
                  {!hasInstagram && (
                    <TooltipContent side="right">
                      <p className="text-xs">Configure o Instagram nas configurações do projeto</p>
                    </TooltipContent>
                  )}
                </Tooltip>
              </TooltipProvider>
            )
          })}

          {/* Empty state */}
          {filteredProjects.length === 0 && (
            <div className="py-8 text-center text-sm text-muted-foreground">
              No channels found
            </div>
          )}
        </div>
      </ScrollArea>

      {/* Footer Actions */}
      <div className="p-3 border-t border-border/40 space-y-2">
        <Button variant="outline" size="sm" className="w-full justify-start">
          <Plus className="w-4 h-4 mr-2" />
          New Channel
        </Button>
        <div className="grid grid-cols-2 gap-2">
          <Button variant="ghost" size="sm" className="justify-start">
            <Tag className="w-4 h-4 mr-2" />
            Tags
          </Button>
          <Button variant="ghost" size="sm" className="justify-start">
            <Settings className="w-4 h-4 mr-2" />
            Manage
          </Button>
        </div>
      </div>
    </div>
  )
}
