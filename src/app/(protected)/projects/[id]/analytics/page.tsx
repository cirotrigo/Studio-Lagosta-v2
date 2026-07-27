'use client'

import { use } from 'react'
import { useProject } from '@/hooks/use-project'
import { ProjectAnalyticsPanel } from '@/components/analytics/project-analytics-panel'

export default function ProjectAnalyticsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const projectId = parseInt(id, 10)
  const { data: project } = useProject(projectId)

  return (
    <div className="space-y-6 p-6">
      <div>
        <h1 className="text-3xl font-bold">Analytics</h1>
        <p className="text-muted-foreground">{project?.name}</p>
      </div>
      <ProjectAnalyticsPanel projectId={projectId} projectName={project?.name} showHeader={false} />
    </div>
  )
}
