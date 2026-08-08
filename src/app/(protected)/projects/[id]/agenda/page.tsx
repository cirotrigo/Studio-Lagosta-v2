'use client'

import { use, useEffect } from 'react'
import Link from 'next/link'
import { ArrowLeft, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useProject } from '@/hooks/use-project'
import { usePageMetadata } from '@/contexts/page-metadata'
import { ProjectAgendaView } from '@/components/projects/project-agenda-view'

/**
 * A agenda do cliente em tela cheia — `/projects/[id]/agenda`.
 *
 * Saiu de dentro de uma aba (`/projects/[id]?tab=agenda`). A aba continua
 * existindo como atalho: clicar nela redireciona para cá, e os links antigos
 * também — inclusive os que vivem em conversas de WhatsApp, geradas pelos
 * avisos de falha, pelos lembretes e pelo MCP.
 *
 * O que a rota traz que a aba não tinha: a visão e a data ficam na URL
 * (`?visao=grade&data=2026-08-08`), então dá para recarregar, voltar pelo
 * navegador e mandar para alguém o link da semana em discussão.
 */
export default function ProjectAgendaPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const projectId = parseInt(id, 10)
  const { data: project, isLoading, isError } = useProject(projectId)

  /*
    A trilha do layout monta os rótulos a partir do caminho e não acrescenta
    nada aqui ("Início > Projects > 7 > Agenda"), enquanto come altura que a
    agenda usa melhor. Restaurar no unmount é obrigatório: `useSetPageMetadata`
    não tem limpeza própria.
  */
  const { updateMetadata } = usePageMetadata()
  useEffect(() => {
    updateMetadata({ showBreadcrumbs: false })
    return () => updateMetadata({ showBreadcrumbs: true })
  }, [updateMetadata])

  if (isLoading) {
    return (
      <div className="flex min-h-[60dvh] flex-col items-center justify-center gap-3 text-muted-foreground">
        <Loader2 className="h-6 w-6 animate-spin" />
        <p className="text-sm">Carregando a agenda…</p>
      </div>
    )
  }

  if (isError || !project) {
    return (
      <div className="flex min-h-[60dvh] flex-col items-center justify-center gap-3 px-6 text-center">
        <h1 className="text-lg font-semibold">Não foi possível carregar a agenda</h1>
        <p className="max-w-sm text-sm text-muted-foreground">
          O cliente pode ter sido removido, ou o link pertence a outra conta.
        </p>
        <Button variant="outline" asChild>
          <Link href="/projects">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Ver os clientes
          </Link>
        </Button>
      </div>
    )
  }

  return (
    /*
      Mesma casca da tela do post: altura definida e margem negativa para
      cancelar o padding do `glass-panel`, ambas em `style` inline porque
      `-m-4` e `h-[calc(…)]` com valores novos não geram CSS nesta build
      (medido no navegador — ver o plano da Fase 2, § 4.1).
    */
    <div className="flex flex-col" style={{ height: 'calc(100dvh - 10rem)', margin: '-1rem' }}>
      <ProjectAgendaView project={project} projectId={projectId} />
    </div>
  )
}
