'use client'

import { useCallback, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useQuery } from '@tanstack/react-query'
import { toast } from 'sonner'
import { api } from '@/lib/api-client'
import { useScheduledPostCounts } from '@/hooks/use-scheduled-counts'
import { useIsMobile } from '@/hooks/use-media-query'
import { AgendaWorkspace } from '../agenda-workspace'
import { ChannelsSidebar } from '../channels-sidebar/channels-list'
import { MobileChannelsDrawer } from '../mobile/mobile-channels-drawer'
import { novoPostHref } from '@/lib/agenda-routes'
import type { ProjectResponse } from '@/hooks/use-project'

type ProjectWithCounts = ProjectResponse & { scheduledPostCount: number }

/**
 * A agenda de TODOS os clientes — `/agenda`.
 *
 * Casca fina sobre o `AgendaWorkspace`, o mesmo miolo da agenda do cliente
 * (unificados em 08/08/2026: eram duas implementações com ~80% do mesmo
 * código, que já tinham divergido em silêncio na semana e no range do mês).
 *
 * O que só existe aqui: a lista de canais com a contagem de agendados, a
 * gaveta equivalente no celular, e o fato de que "criar post" precisa
 * escolher um cliente antes.
 */
export function AgendaCalendarView() {
  const isMobile = useIsMobile()
  const router = useRouter()
  const [selectedProjectId, setSelectedProjectId] = useState<number | null>(null)
  const [mobileDrawerOpen, setMobileDrawerOpen] = useState(false)
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(true) // colapsada por padrão

  const { data: projectsData } = useQuery<ProjectResponse[]>({
    queryKey: ['projects'],
    queryFn: () => api.get('/api/projects'),
  })

  // Contagem separada da lista, por desempenho
  const { data: scheduledCounts } = useScheduledPostCounts()

  const projectList = useMemo<ProjectWithCounts[]>(() => {
    if (!projectsData) return []
    return projectsData.map(project => ({
      ...project,
      scheduledPostCount: scheduledCounts?.[project.id] ?? 0,
    }))
  }, [projectsData, scheduledCounts])

  const selectedProject = projectList.find(p => p.id === selectedProjectId)

  /**
   * Criar post pertence a UM cliente, e a tela nova exige saber qual. Sem
   * canal escolhido cai no primeiro da lista — é o que o composer já fazia.
   */
  const criarPost = useCallback(
    (quando?: Date) => {
      const alvo = selectedProjectId ?? projectList[0]?.id
      if (!alvo) {
        toast.error('Escolha um cliente antes de criar um post')
        return
      }

      const data = quando ? new Date(quando) : undefined
      if (data) data.setHours(10, 0, 0, 0)

      router.push(novoPostHref(alvo, data))
    },
    [router, selectedProjectId, projectList],
  )

  return (
    <div className="flex h-dvh overflow-hidden bg-background">
      {!isMobile && (
        <ChannelsSidebar
          projects={projectList}
          selectedProjectId={selectedProjectId}
          onSelectProject={setSelectedProjectId}
          isCollapsed={isSidebarCollapsed}
          onToggleCollapse={() => setIsSidebarCollapsed(!isSidebarCollapsed)}
        />
      )}

      {isMobile && (
        <MobileChannelsDrawer
          open={mobileDrawerOpen}
          onOpenChange={setMobileDrawerOpen}
          projects={projectList}
          selectedProjectId={selectedProjectId}
          onSelectProject={setSelectedProjectId}
        />
      )}

      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <AgendaWorkspace
          projectId={selectedProjectId}
          project={selectedProject}
          onCreatePost={criarPost}
          onOpenChannels={isMobile ? () => setMobileDrawerOpen(true) : undefined}
          // Mistura clientes: sem o logo não se sabe de quem é cada arte.
          showProjectOnCards
        />
      </div>
    </div>
  )
}
