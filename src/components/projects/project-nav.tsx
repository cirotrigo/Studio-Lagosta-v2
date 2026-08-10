'use client'

/**
 * Menu de navegação do projeto — a barra que antes era a `TabsList` de dentro
 * da página.
 *
 * Ela subiu para o layout de `/projects/[id]/*` por um motivo concreto: Agenda
 * e Bancada NÃO são abas, são rotas próprias (a agenda guarda visão e data na
 * URL, o que torna a semana em discussão compartilhável — ver o cabeçalho de
 * `agenda/page.tsx`). Enquanto a barra vivia dentro da página, clicar nelas
 * trocava a tela inteira e a barra sumia: a navegação parecia quebrar
 * justamente nas duas telas onde mais se trabalha.
 *
 * Sendo do layout, a barra persiste — e Agenda e Bancada passam a abrir
 * "dentro" da aba sem perder a URL própria. É o mesmo conserto para os dois
 * problemas.
 *
 * São LINKS, não botões de aba: middle-click, ⌘-click e "abrir em nova guia"
 * passam a funcionar, o que numa barra de trabalho diário importa.
 */

import * as React from 'react'
import Link from 'next/link'
import { usePathname, useSearchParams } from 'next/navigation'
import { cn } from '@/lib/utils'

type ItemDeMenu = {
  /** Identidade do item — casa com `?tab=` ou com o fim do caminho. */
  chave: string
  rotulo: string
  /** Rota própria; ausente = é uma aba da página do projeto. */
  rota?: string
}

const ITENS: ItemDeMenu[] = [
  { chave: 'drive', rotulo: 'Drive' },
  { chave: 'templates', rotulo: 'Templates' },
  { chave: 'modelos', rotulo: 'Modelos' },
  { chave: 'bancada', rotulo: 'Bancada', rota: 'bancada' },
  { chave: 'criativos', rotulo: 'Criativos' },
  { chave: 'agenda', rotulo: 'Agenda', rota: 'agenda' },
  { chave: 'metricas', rotulo: 'Métricas' },
  // A chave continua 'assets' de propósito: os links `?tab=assets` espalhados
  // (e o hábito) seguem funcionando — só o rótulo virou Marca.
  { chave: 'assets', rotulo: 'Marca' },
  { chave: 'configuracoes', rotulo: 'Configurações' },
]

export function ProjectNav({ projectId }: { projectId: number }) {
  const pathname = usePathname()
  const searchParams = useSearchParams()

  const ativo = React.useMemo(() => {
    // Rota própria primeiro: `/projects/7/agenda` não tem `?tab=`, e cair no
    // default marcaria "Drive" enquanto a agenda está na tela.
    const porRota = ITENS.find((i) => i.rota && pathname.endsWith(`/${i.rota}`))
    if (porRota) return porRota.chave
    const tab = searchParams.get('tab')
    // O default precisa ser o MESMO da página (`?tab` ausente → 'templates').
    // Divergir aqui acenderia um item enquanto outro conteúdo está na tela.
    return ITENS.some((i) => i.chave === tab && !i.rota) ? tab! : 'templates'
  }, [pathname, searchParams])

  return (
    <nav
      aria-label="Seções do projeto"
      // `overflow-x-auto` e não wrap: nove itens quebrariam em duas linhas no
      // celular e empurrariam o conteúdo para baixo da dobra.
      className="-mx-1 flex items-center gap-1 overflow-x-auto px-1 pb-1"
    >
      {ITENS.map((item) => {
        const href = item.rota
          ? `/projects/${projectId}/${item.rota}`
          : `/projects/${projectId}?tab=${item.chave}`
        const estaAtivo = ativo === item.chave
        return (
          <Link
            key={item.chave}
            href={href}
            aria-current={estaAtivo ? 'page' : undefined}
            className={cn(
              'shrink-0 whitespace-nowrap rounded-md px-3 py-1.5 text-sm font-medium transition-colors',
              estaAtivo
                ? 'bg-background text-foreground shadow-sm'
                : 'text-muted-foreground hover:bg-background/60 hover:text-foreground',
            )}
          >
            {item.rotulo}
          </Link>
        )
      })}
    </nav>
  )
}
