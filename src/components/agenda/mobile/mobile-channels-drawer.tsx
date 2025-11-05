'use client'

import { useState } from 'react'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import { cn } from '@/lib/utils'
import { Search, Instagram, AlertCircle } from 'lucide-react'
import Image from 'next/image'
import type { ProjectResponse } from '@/hooks/use-project'

type ProjectWithCounts = ProjectResponse & {
  scheduledPostCount?: number
  Logo?: Array<{
    id: number
    fileUrl: string
  }>
}

interface MobileChannelsDrawerProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  projects: ProjectWithCounts[]
  selectedProjectId: number | null
  onSelectProject: (projectId: number | null) => void
}

export function MobileChannelsDrawer({
  open,
  onOpenChange,
  projects,
  selectedProjectId,
  onSelectProject,
}: MobileChannelsDrawerProps) {
  const [searchQuery, setSearchQuery] = useState('')

  const filteredProjects = projects.filter((project) =>
    project.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    project.instagramUsername?.toLowerCase().includes(searchQuery.toLowerCase())
  )

  const totalPosts = projects.reduce(
    (acc, project) => acc + (project.scheduledPostCount ?? 0),
    0
  )

  const handleSelectProject = (projectId: number | null) => {
    onSelectProject(projectId)
    onOpenChange(false) // Fecha o drawer ao selecionar
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="left" className="w-full sm:max-w-md">
        <SheetHeader>
          <SheetTitle>Canais</SheetTitle>
        </SheetHeader>

        <div className="mt-4 space-y-4">
          {/* Busca */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Buscar canais..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9"
            />
          </div>

          {/* Lista de canais */}
          <ScrollArea className="h-[calc(100vh-200px)]">
            <div className="space-y-2">
              {/* Todos os canais */}
              <button
                onClick={() => handleSelectProject(null)}
                className={cn(
                  'w-full flex items-center gap-3 p-3 rounded-lg transition-colors text-left',
                  selectedProjectId === null
                    ? 'bg-primary text-primary-foreground'
                    : 'hover:bg-muted/50'
                )}
              >
                <div className="w-12 h-12 rounded-full bg-gradient-to-br from-primary/20 to-primary/10 flex items-center justify-center">
                  <Instagram className="w-6 h-6" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-medium truncate">Todos os canais</p>
                  <p className="text-sm text-muted-foreground">
                    {projects.length} canais conectados
                  </p>
                </div>
                <Badge variant="secondary">
                  {totalPosts}
                </Badge>
              </button>

              {/* Canais individuais */}
              {filteredProjects.map((project) => {
                const isSelected = selectedProjectId === project.id
                const postCount = project.scheduledPostCount ?? 0
                const hasInstagram = Boolean(project.instagramAccountId)
                const logoUrl = project.logoUrl || project.Logo?.[0]?.fileUrl

                return (
                  <button
                    key={project.id}
                    onClick={() => handleSelectProject(project.id)}
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
                        'w-12 h-12 rounded-full flex items-center justify-center flex-shrink-0 relative overflow-hidden',
                        logoUrl ? 'bg-white border-2 border-border' : 'bg-gradient-to-br text-white font-bold',
                        !logoUrl && (hasInstagram ? 'from-pink-500 to-purple-500' : 'from-gray-400 to-gray-500')
                      )}
                    >
                      {logoUrl ? (
                        <Image
                          src={logoUrl}
                          alt={project.name}
                          fill
                          sizes="48px"
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
                      <p className="font-medium truncate">
                        {project.instagramUsername || project.name}
                      </p>
                      <p className="text-sm text-muted-foreground truncate">
                        {hasInstagram ? project.name : 'Instagram não configurado'}
                      </p>
                    </div>

                    <Badge variant={isSelected ? 'outline' : 'secondary'}>
                      {postCount}
                    </Badge>
                  </button>
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
      </SheetContent>
    </Sheet>
  )
}
