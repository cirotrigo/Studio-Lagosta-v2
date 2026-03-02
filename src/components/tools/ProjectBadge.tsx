"use client"

import * as React from 'react'
import type { ToolsProject } from '@/hooks/tools/useToolsProjects'
import { cn } from '@/lib/utils'

interface ProjectBadgeProps {
  project: ToolsProject | null
  className?: string
  size?: 'sm' | 'md'
}

export function ProjectBadge({ project, className, size = 'md' }: ProjectBadgeProps) {
  if (!project) {
    return (
      <div
        className={cn(
          'inline-flex items-center gap-2 rounded-full border border-amber-500/40 bg-amber-500/5 px-3 py-1',
          size === 'sm' && 'px-2 py-0.5 text-xs',
          className
        )}
      >
        <div className="h-2 w-2 rounded-full bg-amber-500/60 animate-pulse" />
        <span className="text-amber-400 text-xs font-medium">Nenhum projeto</span>
      </div>
    )
  }

  const initial = project.name.charAt(0).toUpperCase()

  return (
    <div
      className={cn(
        'inline-flex items-center gap-2 rounded-full border border-amber-500/40 bg-amber-500/5 px-3 py-1 transition-colors duration-200',
        size === 'sm' && 'px-2 py-0.5',
        className
      )}
    >
      {project.logoUrl ? (
        <img
          src={project.logoUrl}
          alt={project.name}
          className={cn(
            'rounded-full object-cover',
            size === 'md' ? 'h-4 w-4' : 'h-3 w-3'
          )}
        />
      ) : (
        <div
          className={cn(
            'flex items-center justify-center rounded-full bg-amber-500/20 text-amber-400 font-semibold',
            size === 'md' ? 'h-4 w-4 text-[10px]' : 'h-3 w-3 text-[8px]'
          )}
        >
          {initial}
        </div>
      )}
      <span
        className={cn(
          'font-medium text-[#FAFAFA] truncate max-w-[140px]',
          size === 'md' ? 'text-xs' : 'text-[10px]'
        )}
      >
        {project.name}
      </span>
      {project.instagramUsername && (
        <span
          className={cn(
            'text-[#71717A] truncate max-w-[100px]',
            size === 'md' ? 'text-[10px]' : 'text-[8px]'
          )}
        >
          @{project.instagramUsername}
        </span>
      )}
    </div>
  )
}
