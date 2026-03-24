import { useQuery } from '@tanstack/react-query'
import { CalendarClock, AlertTriangle } from 'lucide-react'
import { api } from '@/lib/api-client'

interface ScheduledPost {
  id: string
  pageId: string | null
  status: string
  renderStatus: string
  scheduledDatetime: string | null
  renderedImageUrl: string | null
  caption: string
}

interface ScheduledPostsBannerProps {
  templateId: number | undefined
}

export function ScheduledPostsBanner({ templateId }: ScheduledPostsBannerProps) {
  const { data: posts } = useQuery<ScheduledPost[]>({
    queryKey: ['template-scheduled-posts', templateId],
    queryFn: () => api.get(`/api/templates/${templateId}/scheduled-posts`),
    enabled: !!templateId,
    staleTime: 30_000,
    refetchInterval: 60_000,
  })

  if (!posts || posts.length === 0) return null

  const scheduledCount = posts.filter((p) => p.status === 'SCHEDULED').length
  const failedRender = posts.filter((p) => p.renderStatus === 'RENDER_FAILED').length

  if (scheduledCount === 0) return null

  return (
    <div className="mx-4 mb-2 flex items-center gap-3 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-2.5 text-sm">
      <CalendarClock size={16} className="shrink-0 text-amber-400" />
      <div className="flex-1">
        <span className="font-medium text-amber-300">
          {scheduledCount} {scheduledCount === 1 ? 'post agendado' : 'posts agendados'}
        </span>
        <span className="text-amber-400/70">
          {' '}usa este template. Edições serão refletidas nos posts ainda não renderizados.
        </span>
      </div>
      {failedRender > 0 && (
        <div className="flex items-center gap-1 text-red-400">
          <AlertTriangle size={14} />
          <span className="text-xs">{failedRender} falha{failedRender > 1 ? 's' : ''}</span>
        </div>
      )}
    </div>
  )
}
