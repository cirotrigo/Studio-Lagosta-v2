'use client'

import { use, useCallback, useEffect, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { usePageMetadata } from '@/contexts/page-metadata'
import { usePost } from '@/hooks/use-post'
import {
  PostComposerForm,
  parseRecurringConfig,
  type PostFormData,
} from '@/components/posts/post-composer-form'
import { agendaHref, postHref } from '@/lib/agenda-routes'

/**
 * Editar post — `/projects/[id]/agenda/[postId]/editar`.
 *
 * Chega-se aqui pelo botão "Editar" da tela do post. Salvar volta para lá, e
 * não para a agenda: quem edita normalmente quer conferir o resultado antes
 * de sair.
 */
export default function EditarPostPage({
  params,
}: {
  params: Promise<{ id: string; postId: string }>
}) {
  const { id, postId } = use(params)
  const projectId = parseInt(id, 10)
  const router = useRouter()
  const { data: post, isLoading, isError } = usePost(projectId, postId)

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
    router.push(postHref(projectId, postId))
  }, [router, projectId, postId])

  const initialData: Partial<PostFormData> | undefined = useMemo(() => {
    if (!post) return undefined

    const scheduled = post.scheduledDatetime ? new Date(post.scheduledDatetime) : undefined

    return {
      postType: post.postType,
      caption: post.caption || '',
      mediaUrls: (post.mediaUrls ?? []) as string[],
      generationIds: post.generationId ? [post.generationId] : [],
      scheduleType: post.scheduleType,
      scheduledDatetime: scheduled && !Number.isNaN(scheduled.getTime()) ? scheduled : undefined,
      recurringConfig: parseRecurringConfig(post.recurringConfig),
      altText: (post.altText ?? []) as string[],
      firstComment: post.firstComment ?? '',
      publishType: (post.publishType ?? 'DIRECT') as PostFormData['publishType'],
    }
  }, [post])

  if (isLoading) {
    return (
      <div className="flex min-h-[60dvh] flex-col items-center justify-center gap-3 text-muted-foreground">
        <Loader2 className="h-6 w-6 animate-spin" />
        <p className="text-sm">Carregando o post…</p>
      </div>
    )
  }

  if (isError || !post) {
    return (
      <div className="flex min-h-[60dvh] flex-col items-center justify-center gap-3 px-6 text-center">
        <h1 className="text-lg font-semibold">Este post não está mais aqui</h1>
        <p className="max-w-sm text-sm text-muted-foreground">
          Ele pode ter sido excluído, ou o link pertence a outro cliente.
        </p>
        <Button variant="outline" asChild>
          <Link href={agendaHref(projectId)}>
            <ArrowLeft className="mr-2 h-4 w-4" />
            Ver a agenda
          </Link>
        </Button>
      </div>
    )
  }

  return (
    <div className="flex flex-col" style={{ height: 'calc(100dvh - 10rem)', margin: '-1rem' }}>
      <header className="flex shrink-0 items-center gap-3 border-b bg-background px-4 py-3 sm:px-6">
        <Button
          variant="ghost"
          size="icon"
          onClick={voltar}
          aria-label="Voltar para o post"
          className="shrink-0"
        >
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div className="min-w-0">
          <h1 className="truncate text-sm font-semibold leading-tight">Editar post</h1>
          <p className="truncate text-xs text-muted-foreground">
            As mudanças valem a partir de agora
          </p>
        </div>
      </header>

      <PostComposerForm
        projectId={projectId}
        postId={postId}
        initialData={initialData}
        // Salvou: volta para a tela do post, onde a mudança se confere.
        onDone={() => router.push(postHref(projectId, postId))}
        onCancel={voltar}
      />
    </div>
  )
}
