"use client"

import * as React from 'react'
import { useToolsProject } from '@/contexts/ProjectContext'
import { cn } from '@/lib/utils'
import { ChevronDown, Search, ExternalLink } from 'lucide-react'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import Link from 'next/link'

interface ProjectSelectorProps {
  collapsed?: boolean
}

export function ProjectSelector({ collapsed = false }: ProjectSelectorProps) {
  const { currentProject, setCurrentProject, projects, isLoading } = useToolsProject()
  const [search, setSearch] = React.useState('')
  const [open, setOpen] = React.useState(false)

  const filtered = React.useMemo(() => {
    if (!search.trim()) return projects
    const q = search.toLowerCase()
    return projects.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        p.instagramUsername?.toLowerCase().includes(q)
    )
  }, [projects, search])

  const initial = currentProject?.name?.charAt(0).toUpperCase() ?? '?'

  if (collapsed) {
    return (
      <DropdownMenu open={open} onOpenChange={setOpen}>
        <DropdownMenuTrigger asChild>
          <button
            className={cn(
              'flex h-9 w-9 items-center justify-center rounded-lg transition-colors duration-200 mx-auto',
              currentProject
                ? 'bg-amber-500/10 text-amber-400 border border-amber-500/30'
                : 'bg-amber-500/5 text-amber-500/60 border border-amber-500/20 animate-pulse'
            )}
          >
            {currentProject?.logoUrl ? (
              <img src={currentProject.logoUrl} alt="" className="h-5 w-5 rounded-full object-cover" />
            ) : (
              <span className="text-xs font-bold">{initial}</span>
            )}
          </button>
        </DropdownMenuTrigger>
        <ProjectDropdownContent
          projects={filtered}
          search={search}
          onSearchChange={setSearch}
          currentProject={currentProject}
          onSelect={(p) => { setCurrentProject(p); setOpen(false); setSearch('') }}
          isLoading={isLoading}
        />
      </DropdownMenu>
    )
  }

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        <button
          className={cn(
            'flex w-full items-center gap-2 rounded-lg px-3 py-2.5 text-left transition-all duration-200',
            currentProject
              ? 'bg-amber-500/5 border-l-[3px] border-amber-500'
              : 'bg-amber-500/5 border border-amber-500/20 border-dashed animate-pulse'
          )}
        >
          {currentProject?.logoUrl ? (
            <img src={currentProject.logoUrl} alt="" className="h-7 w-7 rounded-full object-cover flex-shrink-0" />
          ) : (
            <div className="flex h-7 w-7 items-center justify-center rounded-full bg-amber-500/20 text-amber-400 text-xs font-bold flex-shrink-0">
              {initial}
            </div>
          )}
          <div className="flex-1 min-w-0">
            <p className="text-xs font-medium text-[#FAFAFA] truncate">
              {currentProject ? currentProject.name : 'Selecione um projeto'}
            </p>
            {currentProject?.instagramUsername && (
              <p className="text-[10px] text-[#71717A] truncate">
                @{currentProject.instagramUsername}
              </p>
            )}
          </div>
          <ChevronDown className="h-3.5 w-3.5 text-[#71717A] flex-shrink-0" />
        </button>
      </DropdownMenuTrigger>
      <ProjectDropdownContent
        projects={filtered}
        search={search}
        onSearchChange={setSearch}
        currentProject={currentProject}
        onSelect={(p) => { setCurrentProject(p); setOpen(false); setSearch('') }}
        isLoading={isLoading}
      />
    </DropdownMenu>
  )
}

function ProjectDropdownContent({
  projects,
  search,
  onSearchChange,
  currentProject,
  onSelect,
  isLoading,
}: {
  projects: { id: number; name: string; logoUrl: string | null; instagramUsername: string | null }[]
  search: string
  onSearchChange: (v: string) => void
  currentProject: { id: number } | null
  onSelect: (p: any) => void
  isLoading: boolean
}) {
  return (
    <DropdownMenuContent align="start" sideOffset={8} className="w-64 bg-[#161616] border-[#27272A]">
      <div className="px-2 py-1.5">
        <div className="relative">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-[#71717A]" />
          <input
            type="text"
            placeholder="Buscar projeto..."
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
            className="w-full rounded-md bg-[#1a1a1a] border border-[#27272A] pl-7 pr-2 py-1.5 text-xs text-[#FAFAFA] placeholder:text-[#71717A] outline-none focus:border-amber-500/50"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      </div>
      <DropdownMenuSeparator className="bg-[#27272A]" />
      <div className="max-h-[240px] overflow-y-auto py-1">
        {isLoading ? (
          <div className="px-3 py-4 text-center text-xs text-[#71717A]">Carregando...</div>
        ) : projects.length === 0 ? (
          <div className="px-3 py-4 text-center text-xs text-[#71717A]">Nenhum projeto encontrado</div>
        ) : (
          projects.map((project) => {
            const isActive = currentProject?.id === project.id
            return (
              <DropdownMenuItem
                key={project.id}
                onClick={() => onSelect(project)}
                className={cn(
                  'flex items-center gap-2 px-3 py-2 cursor-pointer text-xs',
                  isActive && 'bg-amber-500/10'
                )}
              >
                {project.logoUrl ? (
                  <img src={project.logoUrl} alt="" className="h-6 w-6 rounded-full object-cover flex-shrink-0" />
                ) : (
                  <div className="flex h-6 w-6 items-center justify-center rounded-full bg-amber-500/20 text-amber-400 text-[10px] font-bold flex-shrink-0">
                    {project.name.charAt(0).toUpperCase()}
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-[#FAFAFA] truncate">{project.name}</p>
                  {project.instagramUsername && (
                    <p className="text-[10px] text-[#71717A] truncate">@{project.instagramUsername}</p>
                  )}
                </div>
                {isActive && <div className="h-1.5 w-1.5 rounded-full bg-amber-500 flex-shrink-0" />}
              </DropdownMenuItem>
            )
          })
        )}
      </div>
      <DropdownMenuSeparator className="bg-[#27272A]" />
      <DropdownMenuItem asChild>
        <Link href="/projects" className="flex items-center gap-2 px-3 py-2 text-xs text-[#A1A1AA]">
          <ExternalLink className="h-3 w-3" />
          Ver todos os projetos
        </Link>
      </DropdownMenuItem>
    </DropdownMenuContent>
  )
}
