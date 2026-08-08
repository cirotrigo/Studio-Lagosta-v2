'use client'

import { use, useCallback, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { usePageMetadata } from '@/contexts/page-metadata'
import Link from 'next/link'
import { ArrowLeft, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { usePost } from '@/hooks/use-post'
import { PostDetailView } from '@/components/agenda/post-actions/post-detail-view'
import { agendaHref, editarPostHref } from '@/lib/agenda-routes'
import type { SocialPost } from '../../../../../../../prisma/generated/client'

/**
 * A tela de um post — `/projects/[id]/agenda/[postId]`.
 *
 * Substitui o `PostPreviewModal`, que era um Dialog com até três outros
 * empilhados por cima (reagendar, aprovar, melhorar com IA) — no celular, tudo
 * isso dentro de 375px de largura. Aqui o post tem tela inteira, endereço
 * próprio (dá para recarregar, voltar pelo navegador e mandar o link no
 * WhatsApp) e uma seta de voltar em vez de um X.
 *
 * O composer continua sendo modal — vira rota na entrega 2.3.
 */
export default function PostDetailPage({
  params,
}: {
  params: Promise<{ id: string; postId: string }>
}) {
  const { id, postId } = use(params)
  const projectId = parseInt(id, 10)
  const router = useRouter()

  const { data: post, isLoading, isError } = usePost(projectId, postId)

  /*
    Fora a trilha automática do layout. Ela monta os rótulos a partir do
    caminho, então o último vira o cuid do post capitalizado
    ("Cmni7lsi7000xswt24j5lulpc") — no celular isso quebra em três linhas e
    come 200px antes de a arte aparecer. Esta tela já diz de quem é o post e
    quando sai, e tem seta de voltar.

    A restauração no unmount é obrigatória: `useSetPageMetadata` não tem
    limpeza, e sem ela a trilha sumiria também das telas seguintes que não
    definem metadados próprios.
  */
  const { updateMetadata } = usePageMetadata()
  useEffect(() => {
    updateMetadata({ showBreadcrumbs: false })
    return () => updateMetadata({ showBreadcrumbs: true })
  }, [updateMetadata])

  /**
   * Voltar segue o histórico quando existe (preserva a rolagem e a visão em
   * que a agenda estava) e cai na agenda quando a pessoa chegou por link
   * direto — o caso do link de WhatsApp, onde não há para onde voltar.
   */
  const handleBack = useCallback(() => {
    if (typeof window !== 'undefined' && window.history.length > 1) {
      router.back()
      return
    }
    router.push(agendaHref(projectId))
  }, [router, projectId])

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
    /*
      Tela cheia dentro do painel do layout.

        A margem negativa cancela o `p-4` do `glass-panel`: esta tela já tem
        cabeçalho e barra de ações com o padding deles, e o do painel só
        empurrava tudo para dentro (medido: a tela começava a 124px do topo).
        O painel tem `overflow: clip`, então as pontas quadradas do cabeçalho
        continuam recortadas pelo canto arredondado dele.

        Vai em `style` inline porque `-m-4`, `sm:-m-6` e
        `h-[calc(100dvh-10rem)]` NÃO geram CSS nesta build — medido no
        navegador: margem 0 e altura vinda do conteúdo. Só
        `h-[calc(100dvh-12rem)]` funciona, e apenas porque essa string exata
        já existe em `project-agenda-view.tsx`. É a mesma armadilha que a
      Fase 1 registrou (inset negativo, `dvh` em valor arbitrário) e que lá
      também foi resolvida virando `style` inline.
    */
    <div className="flex flex-col" style={{ height: 'calc(100dvh - 10rem)', margin: '-1rem' }}>
      <PostDetailView
        post={post as SocialPost}
        onBack={handleBack}
        // Editar tem tela própria desde 08/08/2026, com prévia viva ao lado.
        onEdit={() => router.push(editarPostHref(projectId, postId))}
      />
    </div>
  )
}
