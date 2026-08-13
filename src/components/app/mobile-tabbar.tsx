'use client'

/**
 * Barra de abas inferior do celular — o esqueleto de navegação do PWA.
 *
 * Só existe abaixo de `md` (`md:hidden`), onde a Sidebar não é renderizada
 * (`hidden md:block`): as duas nunca aparecem juntas. Três destinos, os do
 * trabalho diário: Bancada, Agenda e Criativos.
 *
 * Cada aba considera ativa também a variante DENTRO de um projeto
 * (`/projects/7/bancada` acende Bancada) — no celular a pessoa circula entre
 * as duas formas da mesma tela e a barra não pode apagar no meio do caminho.
 * Obs.: a rota de criativos por projeto se escreve `creativos` (sem o
 * primeiro "i") — é o nome real da pasta, não erro aqui.
 *
 * O padding inferior via `env(safe-area-inset-bottom)` vai em estilo inline:
 * depende do `viewportFit: 'cover'` do layout raiz e cobre a barra "home" do
 * iPhone. Quem monta esta barra precisa reservar o espaço dela no conteúdo
 * (padding-bottom no main em telas pequenas), senão ela cobre o fim da página.
 */

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Calendar, Layers, Sparkles } from 'lucide-react'
import { cn } from '@/lib/utils'

type Aba = {
  nome: string
  href: string
  icone: typeof Calendar
  estaAtiva: (pathname: string) => boolean
}

const ABAS: Aba[] = [
  {
    nome: 'Bancada',
    href: '/bancada',
    icone: Sparkles,
    estaAtiva: (p) => p === '/bancada' || /^\/projects\/[^/]+\/bancada/.test(p),
  },
  {
    nome: 'Agenda',
    href: '/agenda',
    icone: Calendar,
    estaAtiva: (p) => p.startsWith('/agenda') || /^\/projects\/[^/]+\/agenda/.test(p),
  },
  {
    nome: 'Criativos',
    href: '/criativos',
    icone: Layers,
    estaAtiva: (p) => p.startsWith('/criativos') || /^\/projects\/[^/]+\/creativos/.test(p),
  },
]

export function MobileTabbar() {
  const pathname = usePathname()

  return (
    <nav
      aria-label="Navegação inferior"
      className="fixed inset-x-0 bottom-0 z-40 border-t border-border/60 bg-background/90 backdrop-blur-lg md:hidden"
      style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
    >
      <div className="flex h-16 items-stretch">
        {ABAS.map((aba) => {
          const ativa = aba.estaAtiva(pathname)
          const Icone = aba.icone
          return (
            <Link
              key={aba.href}
              href={aba.href}
              aria-current={ativa ? 'page' : undefined}
              className={cn(
                'flex flex-1 flex-col items-center justify-center gap-1 text-xs font-medium transition-colors',
                ativa
                  ? 'text-primary'
                  : 'text-muted-foreground hover:text-foreground'
              )}
            >
              <Icone className="h-5 w-5" aria-hidden="true" />
              <span>{aba.nome}</span>
            </Link>
          )
        })}
      </div>
    </nav>
  )
}
