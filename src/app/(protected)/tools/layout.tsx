"use client"

import * as React from 'react'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'
import { ProjectProvider, useToolsProject } from '@/contexts/ProjectContext'
import { ToolsSidebar } from '@/components/tools/ToolsSidebar'
import { ProjectBadge } from '@/components/tools/ProjectBadge'

const TOOL_NAMES: Record<string, string> = {
  '/tools/scheduler': 'Agendador de Posts',
  '/tools/analytics': 'Analytics',
  '/tools/quick-creative': 'Criativo Rápido',
  '/tools/hashtags': 'Hashtag Manager',
  '/tools/settings': 'Configurações',
}

function getToolName(pathname: string): string {
  for (const [path, name] of Object.entries(TOOL_NAMES)) {
    if (pathname.startsWith(path)) return name
  }
  return 'Ferramentas'
}

function ToolsLayoutInner({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const { currentProject } = useToolsProject()

  const [collapsed, setCollapsed] = React.useState(() => {
    if (typeof window === 'undefined') return false
    try {
      return window.localStorage.getItem('tools.sidebarCollapsed') === 'true'
    } catch {
      return false
    }
  })

  const toggleCollapse = React.useCallback(() => {
    setCollapsed((c) => {
      const next = !c
      try {
        window.localStorage.setItem('tools.sidebarCollapsed', String(next))
      } catch { /* noop */ }
      return next
    })
  }, [])

  const toolName = getToolName(pathname)

  return (
    <div className="fixed inset-0 z-50 flex bg-[#0a0a0a]">
      <ToolsSidebar collapsed={collapsed} onToggle={toggleCollapse} />

      <div className="flex flex-1 flex-col min-w-0 overflow-hidden">
        {/* Header bar */}
        <header className="flex h-14 items-center gap-4 border-b border-[#1a1a1a] px-6 flex-shrink-0">
          <h1 className="text-sm font-semibold text-[#FAFAFA]">{toolName}</h1>
          <div className="h-4 w-px bg-[#27272A]" />
          <ProjectBadge project={currentProject} size="sm" />
        </header>

        {/* Main content */}
        <main className="flex-1 overflow-y-auto p-6">
          {children}
        </main>
      </div>
    </div>
  )
}

export default function ToolsLayout({ children }: { children: React.ReactNode }) {
  return (
    <ProjectProvider>
      <ToolsLayoutInner>{children}</ToolsLayoutInner>
    </ProjectProvider>
  )
}
