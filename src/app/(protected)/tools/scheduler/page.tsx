"use client"

import * as React from 'react'
import Link from 'next/link'
import { useToolsProject } from '@/contexts/ProjectContext'
import { CalendarView } from '@/components/tools/scheduler/CalendarView'
import { ListView } from '@/components/tools/scheduler/ListView'
import { cn } from '@/lib/utils'
import { CalendarDays, LayoutGrid, Plus, FolderOpen } from 'lucide-react'

type ViewMode = 'calendar' | 'list'

export default function SchedulerPage() {
  const { currentProject } = useToolsProject()

  const [view, setView] = React.useState<ViewMode>(() => {
    if (typeof window === 'undefined') return 'calendar'
    try {
      return (window.localStorage.getItem('tools.schedulerView') as ViewMode) || 'calendar'
    } catch {
      return 'calendar'
    }
  })

  const [month, setMonth] = React.useState(new Date())

  const handleViewChange = (v: ViewMode) => {
    setView(v)
    try {
      window.localStorage.setItem('tools.schedulerView', v)
    } catch { /* noop */ }
  }

  // No project selected guard
  if (!currentProject) {
    return (
      <div className="flex flex-col items-center justify-center py-32 gap-4">
        <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-amber-500/10">
          <FolderOpen className="h-8 w-8 text-amber-500" />
        </div>
        <h2 className="text-lg font-semibold text-[#FAFAFA]">Selecione um projeto</h2>
        <p className="text-sm text-[#71717A] text-center max-w-md">
          Escolha um projeto na barra lateral para visualizar o agendador de posts.
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Page header with actions */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h2 className="text-lg font-semibold text-[#FAFAFA]">Agendador</h2>

        <div className="flex items-center gap-2">
          {/* View toggle */}
          <div className="flex items-center rounded-lg border border-[#27272A] bg-[#1a1a1a] p-0.5">
            <button
              onClick={() => handleViewChange('calendar')}
              className={cn(
                'flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors duration-200',
                view === 'calendar'
                  ? 'bg-amber-500/20 text-amber-400'
                  : 'text-[#71717A] hover:text-[#A1A1AA]'
              )}
            >
              <CalendarDays className="h-3.5 w-3.5" />
              Calendário
            </button>
            <button
              onClick={() => handleViewChange('list')}
              className={cn(
                'flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors duration-200',
                view === 'list'
                  ? 'bg-amber-500/20 text-amber-400'
                  : 'text-[#71717A] hover:text-[#A1A1AA]'
              )}
            >
              <LayoutGrid className="h-3.5 w-3.5" />
              Lista
            </button>
          </div>

          {/* New post button */}
          <Link
            href="/tools/scheduler/new"
            className="flex items-center gap-1.5 rounded-lg bg-amber-500 px-4 py-2 text-xs font-semibold text-black hover:bg-amber-400 transition-colors duration-200"
          >
            <Plus className="h-3.5 w-3.5" />
            Novo Post
          </Link>
        </div>
      </div>

      {/* Content */}
      {view === 'calendar' ? (
        <CalendarView
          projectId={currentProject.id}
          month={month}
          onMonthChange={setMonth}
        />
      ) : (
        <ListView projectId={currentProject.id} />
      )}
    </div>
  )
}
