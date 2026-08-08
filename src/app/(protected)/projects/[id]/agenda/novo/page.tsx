'use client'

import { use, useCallback, useEffect, useMemo } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { ArrowLeft } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { usePageMetadata } from '@/contexts/page-metadata'
import { useProject } from '@/hooks/use-project'
import { PostComposerForm, type PostFormData } from '@/components/posts/post-composer-form'
import { agendaHref } from '@/lib/agenda-routes'

/**
 * Criar post — `/projects/[id]/agenda/novo`.
 *
 * Segmento estático, então o Next resolve esta rota antes de `[postId]`: não
 * existe post com id "novo".
 *
 * Aceita `?data=2026-08-11T10:00` para já vir com o horário preenchido — é o
 * que o botão "+" de um dia da agenda manda.
 */
export default function NovoPostPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const projectId = parseInt(id, 10)
  const router = useRouter()
  const searchParams = useSearchParams()
  const { data: project } = useProject(projectId)

  const { updateMetadata } = usePageMetadata()
  useEffect(() => {
    updateMetadata({ showBreadcrumbs: false })
    return () => updateMetadata({ showBreadcrumbs: true })
  }, [updateMetadata])

  const voltar = useCallback(() => {
    if (typeof window !== 'undefined' && window.history.length > 1) {
      router.back()
      return
    }
    router.push(agendaHref(projectId))
  }, [router, projectId])

  const initialData: Partial<PostFormData> | undefined = useMemo(() => {
    const dataParam = searchParams.get('data')
    if (!dataParam) return undefined

    const quando = new Date(dataParam)
    if (Number.isNaN(quando.getTime())) return undefined

    return { scheduleType: 'SCHEDULED', scheduledDatetime: quando }
  }, [searchParams])

  return (
    <div className="flex flex-col" style={{ height: 'calc(100dvh - 10rem)', margin: '-1rem' }}>
      <header className="flex shrink-0 items-center gap-3 border-b bg-background px-4 py-3 sm:px-6">
        <Button
          variant="ghost"
          size="icon"
          onClick={voltar}
          aria-label="Voltar para a agenda"
          className="shrink-0"
        >
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div className="min-w-0">
          <h1 className="truncate text-sm font-semibold leading-tight">Novo post</h1>
          <p className="truncate text-xs text-muted-foreground">
            {project ? `Para ${project.instagramUsername || project.name}` : 'Carregando…'}
          </p>
        </div>
      </header>

      <PostComposerForm
        projectId={projectId}
        initialData={initialData}
        onDone={() => router.push(agendaHref(projectId))}
        onCancel={voltar}
      />
    </div>
  )
}
