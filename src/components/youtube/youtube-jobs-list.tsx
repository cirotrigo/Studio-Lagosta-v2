'use client'

import { Loader2 } from 'lucide-react'
import { useYoutubeJobs } from '@/hooks/use-youtube-download'
import { YoutubeDownloadProgress } from './youtube-download-progress'

export function YoutubeJobsList() {
  const { data: jobs, isLoading } = useYoutubeJobs()

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="h-5 w-5 animate-spin text-gray-400" />
      </div>
    )
  }

  if (!jobs || jobs.length === 0) {
    return null
  }

  const activeJobs = jobs.filter((job) =>
    ['pending', 'downloading', 'uploading'].includes(job.status)
  )

  if (activeJobs.length === 0) {
    return null
  }

  return (
    <div className="mb-8 space-y-3 rounded-lg border border-blue-100 bg-blue-50 p-4">
      <p className="text-sm font-semibold text-blue-900">
        Downloads do YouTube em andamento
      </p>
      {activeJobs.map((job) => (
        <YoutubeDownloadProgress key={job.id} jobId={job.id} />
      ))}
    </div>
  )
}
