import { Suspense } from 'react'
import { ProjectNav } from '@/components/projects/project-nav'

/**
 * Layout de `/projects/[id]/*` — existe para o MENU do projeto ficar no topo e
 * PERSISTIR entre as telas.
 *
 * Antes, a barra era a `TabsList` de dentro de `page.tsx`. Agenda e Bancada,
 * que são rotas próprias e não abas, trocavam a tela inteira e levavam a barra
 * junto: a navegação parecia quebrar exatamente nas duas telas de trabalho
 * diário. Com a barra no layout, elas abrem sob o mesmo menu e continuam com a
 * URL própria (a agenda guarda visão e data ali, e é isso que torna a semana
 * em discussão compartilhável).
 *
 * `Suspense` porque `ProjectNav` lê `useSearchParams` — sem ele o Next obriga
 * a página inteira a virar dinâmica.
 */
export default async function ProjectLayout({
  children,
  params,
}: {
  children: React.ReactNode
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const projectId = Number(id)

  return (
    <div className="space-y-3 md:space-y-4">
      {Number.isFinite(projectId) && (
        <Suspense fallback={<div className="h-9" />}>
          <ProjectNav projectId={projectId} />
        </Suspense>
      )}
      {children}
    </div>
  )
}
