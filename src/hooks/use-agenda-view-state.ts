'use client'

import { useCallback, useMemo } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import {
  createDateKey,
  isViewMode,
  type ViewMode,
} from '@/components/agenda/calendar/calendar-utils'
import type { StatusFilter } from '@/components/agenda/calendar/calendar-header'
import type { PostType } from '../../prisma/generated/client'

export type TimingFilter = 'ALL' | 'UPCOMING' | 'OVERDUE'

const POST_TYPES: ReadonlyArray<PostType | 'ALL'> = ['ALL', 'POST', 'STORY', 'REEL', 'CAROUSEL']
const STATUS_FILTERS: ReadonlyArray<StatusFilter> = ['ALL', 'DRAFT', 'FAILED', 'POSTING']
const TIMING_FILTERS: ReadonlyArray<TimingFilter> = ['ALL', 'UPCOMING', 'OVERDUE']

/** "2026-08-08" → Date local à meia-noite. Inválido volta como hoje. */
function parseDateKey(value: string | null): Date {
  if (!value) return new Date()
  const [ano, mes, dia] = value.split('-').map(Number)
  if (!ano || !mes || !dia) return new Date()
  const data = new Date(ano, mes - 1, dia)
  return Number.isNaN(data.getTime()) ? new Date() : data
}

/**
 * O estado da agenda mora na URL — `?visao=grade&data=2026-08-08&formato=STORY`.
 *
 * É o que a Fase 2 veio buscar: dá para recarregar a página e cair no mesmo
 * lugar, voltar pelo botão do navegador e mandar para alguém o link da semana
 * que se está discutindo. Antes tudo isso era `useState` dentro do componente
 * e morria a cada navegação.
 *
 * Escreve com `replace`, não `push`: trocar de mês não é um passo de história
 * que mereça um "voltar" — senão sair da agenda exigiria dez cliques.
 */
export function useAgendaViewState(defaultViewMode: ViewMode = 'month') {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()

  const viewMode: ViewMode = isViewMode(searchParams.get('visao'))
    ? (searchParams.get('visao') as ViewMode)
    : defaultViewMode

  // A string da URL é a dependência, não o Date: sem isso um objeto novo seria
  // criado a cada render e derrubaria os memos de range que dependem dele.
  const dataParam = searchParams.get('data')
  const selectedDate = useMemo(() => parseDateKey(dataParam), [dataParam])

  const postTypeFilter = (POST_TYPES.includes(searchParams.get('formato') as PostType | 'ALL')
    ? searchParams.get('formato')
    : 'ALL') as PostType | 'ALL'

  const statusFilter = (STATUS_FILTERS.includes(searchParams.get('situacao') as StatusFilter)
    ? searchParams.get('situacao')
    : 'ALL') as StatusFilter

  const timingFilter = (TIMING_FILTERS.includes(searchParams.get('prazo') as TimingFilter)
    ? searchParams.get('prazo')
    : 'ALL') as TimingFilter

  const escrever = useCallback(
    (mudancas: Record<string, string | null>) => {
      const params = new URLSearchParams(searchParams.toString())
      for (const [chave, valor] of Object.entries(mudancas)) {
        // Valor padrão não polui a URL — o link fica curto e legível.
        if (valor === null) params.delete(chave)
        else params.set(chave, valor)
      }
      const query = params.toString()
      router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false })
    },
    [router, pathname, searchParams],
  )

  return {
    viewMode,
    setViewMode: useCallback(
      (modo: ViewMode) => escrever({ visao: modo === defaultViewMode ? null : modo }),
      [escrever, defaultViewMode],
    ),

    selectedDate,
    setSelectedDate: useCallback(
      (data: Date) => escrever({ data: createDateKey(data) }),
      [escrever],
    ),

    postTypeFilter,
    setPostTypeFilter: useCallback(
      (formato: PostType | 'ALL') => escrever({ formato: formato === 'ALL' ? null : formato }),
      [escrever],
    ),

    statusFilter,
    setStatusFilter: useCallback(
      (situacao: StatusFilter) => escrever({ situacao: situacao === 'ALL' ? null : situacao }),
      [escrever],
    ),

    timingFilter,
    setTimingFilter: useCallback(
      (prazo: TimingFilter) => escrever({ prazo: prazo === 'ALL' ? null : prazo }),
      [escrever],
    ),
  }
}
