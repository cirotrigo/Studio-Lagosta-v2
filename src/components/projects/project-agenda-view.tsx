'use client'

import { useCallback, useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { AgendaWorkspace } from '@/components/agenda/agenda-workspace'
import { novoPostHref, postHref } from '@/lib/agenda-routes'
import type { ProjectResponse } from '@/hooks/use-project'

interface ProjectAgendaViewProps {
  project: ProjectResponse
  projectId: number
}

/**
 * A agenda de UM cliente — a casca da rota `/projects/[id]/agenda`.
 *
 * Todo o miolo é o `AgendaWorkspace`, o mesmo da agenda global. O que sobra
 * aqui é o que só existe nesta tela: o cliente já está definido, e os links
 * antigos com `?postId` precisam de redirecionamento.
 */
export function ProjectAgendaView({ project, projectId }: ProjectAgendaViewProps) {
  const router = useRouter()
  const searchParams = useSearchParams()

  /**
   * Deep-link antigo: `?tab=agenda&postId=X`, gerado pela skill arte-rápida,
   * pelos avisos de falha e pelos lembretes — links que vivem em conversas de
   * WhatsApp que ninguém apaga. Antes ele buscava o post e abria o COMPOSER;
   * hoje leva à tela do post, de onde editar é um toque. Para um link
   * recebido no celular, abrir o formulário de edição direto era a semântica
   * mais arriscada das duas.
   */
  const postIdParam = searchParams.get('postId')
  useEffect(() => {
    if (!postIdParam) return
    router.replace(postHref(projectId, postIdParam))
  }, [postIdParam, projectId, router])

  const criarPost = useCallback(
    (quando?: Date) => {
      const data = quando ? new Date(quando) : undefined
      if (data) data.setHours(10, 0, 0, 0)
      router.push(novoPostHref(projectId, data))
    },
    [router, projectId],
  )

  return <AgendaWorkspace projectId={projectId} project={project} onCreatePost={criarPost} />
}
