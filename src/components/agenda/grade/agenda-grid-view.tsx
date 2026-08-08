'use client'

import { useMemo } from 'react'
import { Skeleton } from '@/components/ui/skeleton'
import { groupPostsByDay } from '../calendar/calendar-utils'
import { PostArtCard, type PostComProjeto } from './post-art-card'

interface AgendaGridViewProps {
  posts: PostComProjeto[]
  isLoading: boolean
  onPostClick: (post: PostComProjeto) => void
  /** Mostra de quem é cada post. Ligado na agenda global. */
  showProject?: boolean
}

/** "Sexta, 8 de agosto" — com "Hoje"/"Amanhã" quando for o caso. */
function rotuloDoDia(date: Date): string {
  const hoje = new Date()
  hoje.setHours(0, 0, 0, 0)
  const dia = new Date(date)
  dia.setHours(0, 0, 0, 0)

  const diffEmDias = Math.round((dia.getTime() - hoje.getTime()) / 86_400_000)
  const porExtenso = dia.toLocaleDateString('pt-BR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  })

  if (diffEmDias === 0) return `Hoje — ${porExtenso}`
  if (diffEmDias === 1) return `Amanhã — ${porExtenso}`
  return porExtenso.charAt(0).toUpperCase() + porExtenso.slice(1)
}

/**
 * A visão GRADE: a arte grande, agrupada por dia.
 *
 * É o equivalente da visão LISTA do app desktop, e o que faltava na web — mês,
 * semana e dia mostram a arte em miniaturas de poucos pixels, boas para achar
 * um post e inúteis para aprovar um.
 *
 * Duas colunas no celular e até cinco no desktop: a mesma tela em larguras
 * diferentes, sem componente mobile paralelo. É esta visão que substituiu a
 * lista mobile da agenda global (`MobileAgendaListView` + `MobileDayGroup` +
 * `MobilePostCard`, removidos em 08/08/2026).
 */
export function AgendaGridView({
  posts,
  isLoading,
  onPostClick,
  showProject = false,
}: AgendaGridViewProps) {
  const porDia = useMemo(() => groupPostsByDay(posts), [posts])

  if (isLoading) {
    return (
      <div className="space-y-6 p-4 sm:p-6">
        {Array.from({ length: 2 }).map((_, grupo) => (
          <div key={grupo} className="space-y-3">
            <Skeleton className="h-5 w-48" />
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
              {Array.from({ length: 5 }).map((_, card) => (
                <Skeleton key={card} className="aspect-[4/5] w-full" />
              ))}
            </div>
          </div>
        ))}
      </div>
    )
  }

  if (porDia.length === 0) {
    return (
      <div className="flex h-full flex-col items-center justify-center p-8 text-center">
        <div className="mb-3 text-5xl">📅</div>
        <h3 className="mb-1 text-base font-semibold">Nada por aqui</h3>
        <p className="max-w-sm text-sm text-muted-foreground">
          {/* Num mês que já passou a grade fica vazia por definição — o aviso
              precisa dizer isso, senão parece que os posts sumiram. */}
          A grade mostra de hoje em diante. Para ver o que já foi publicado,
          troque para a visão de mês; para o que vem, avance o mês ou tire os
          filtros.
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-6 p-4 sm:p-6">
      {porDia.map((grupo) => (
        <section key={grupo.dateKey} className="space-y-3">
          {/* Sem `capitalize`: a classe põe maiúscula em TODA palavra
              ("Segunda-Feira, 27 De Julho"). A primeira letra já vem tratada
              de `rotuloDoDia`. */}
          <h3 className="sticky top-0 z-10 bg-background py-1 text-sm font-semibold backdrop-blur">
            {rotuloDoDia(grupo.date)}
            <span className="ml-2 font-normal text-muted-foreground">
              {grupo.posts.length} {grupo.posts.length === 1 ? 'post' : 'posts'}
            </span>
          </h3>

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
            {(grupo.posts as PostComProjeto[]).map((post) => (
              <PostArtCard
                key={post.id}
                post={post}
                onClick={() => onPostClick(post)}
                showProject={showProject}
              />
            ))}
          </div>
        </section>
      ))}
    </div>
  )
}
