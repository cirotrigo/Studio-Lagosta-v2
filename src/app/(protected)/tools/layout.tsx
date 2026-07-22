"use client"

import * as React from 'react'
import { usePathname } from 'next/navigation'
import { Menu } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from '@/components/ui/sheet'
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

  const [mobileNavOpen, setMobileNavOpen] = React.useState(false)

  // Fecha o drawer mobile ao navegar
  React.useEffect(() => {
    setMobileNavOpen(false)
  }, [pathname])

  return (
    <div className="fixed inset-0 z-50 flex bg-[#0a0a0a] pt-safe">
      <ToolsSidebar collapsed={collapsed} onToggle={toggleCollapse} />

      <div className="flex flex-1 flex-col min-w-0 overflow-hidden">
        {/* Header bar */}
        <header className="flex h-14 items-center gap-3 border-b border-[#1a1a1a] px-4 md:gap-4 md:px-6 flex-shrink-0">
          <Sheet open={mobileNavOpen} onOpenChange={setMobileNavOpen}>
            <SheetTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="md:hidden h-9 w-9 text-[#A1A1AA] hover:text-[#FAFAFA]"
                aria-label="Abrir menu de ferramentas"
              >
                <Menu className="h-5 w-5" />
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="w-[280px] max-w-[85vw] p-0 border-[#1a1a1a] bg-[#111111]">
              <SheetTitle className="sr-only">Menu de ferramentas</SheetTitle>
              <ToolsSidebar collapsed={false} onToggle={toggleCollapse} variant="mobile" />
            </SheetContent>
          </Sheet>
          <h1 className="text-sm font-semibold text-[#FAFAFA] truncate">{toolName}</h1>
          <div className="h-4 w-px bg-[#27272A] hidden sm:block" />
          <ProjectBadge project={currentProject} size="sm" />
        </header>

        {/* Main content */}
        <main className="flex-1 overflow-y-auto p-4 pb-[calc(1rem+env(safe-area-inset-bottom))] md:p-6">
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
