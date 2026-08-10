'use client'

/**
 * Troca de projeto SEM sair da tela em que se está.
 *
 * O problema que resolve: para ver a agenda de outro cliente, o caminho era
 * Projetos → abrir o projeto → clicar em Agenda de novo. Três passos para
 * repetir a mesma tela com outro dono.
 *
 * Por que aqui, no menu do projeto, e não na barra global ao lado de
 * "Gerenciar créditos": a barra global aparece em telas que não têm projeto
 * nenhum (`/criativos`, `/knowledge`, o painel), e um seletor de projeto ali
 * ou fica sem função ou finge um contexto que a página não usa. No menu ele
 * só existe onde significa alguma coisa — e fica encostado exatamente na
 * navegação que ele reconfigura.
 *
 * A troca PRESERVA a sub-rota: de `/projects/7/bancada` para o projeto 6 vai
 * a `/projects/6/bancada`; de `?tab=modelos` vai a `?tab=modelos`. É isso que
 * transforma o seletor em "mesma tela, outro cliente" em vez de só um atalho
 * para a home do projeto.
 */

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { Check, ChevronsUpDown, Search } from 'lucide-react'
import { useProjects } from '@/hooks/use-project'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { cn } from '@/lib/utils'

interface Props {
  projectId: number
  /**
   * Para onde ir no projeto escolhido, relativo a `/projects/[id]`:
   * `/bancada`, `/agenda`, ou `?tab=modelos`. Vazio = a home do projeto.
   */
  sufixoDaRota: string
}

export function ProjectSwitcher({ projectId, sufixoDaRota }: Props) {
  const router = useRouter()
  const { data: projetos, isLoading } = useProjects()
  const [aberto, setAberto] = React.useState(false)
  const [busca, setBusca] = React.useState('')

  const atual = projetos?.find((p) => p.id === projectId)

  const filtrados = React.useMemo(() => {
    const lista = projetos ?? []
    const termo = busca.trim().toLowerCase()
    if (!termo) return lista
    return lista.filter((p) => p.name.toLowerCase().includes(termo))
  }, [projetos, busca])

  const trocar = (destinoId: number) => {
    setAberto(false)
    setBusca('')
    if (destinoId === projectId) return
    router.push(`/projects/${destinoId}${sufixoDaRota}`)
  }

  return (
    <Popover
      open={aberto}
      onOpenChange={(v) => {
        setAberto(v)
        if (!v) setBusca('')
      }}
    >
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className="h-8 max-w-[190px] shrink-0 gap-1.5 px-2 font-semibold"
          title="Trocar de cliente sem sair desta tela"
        >
          <span className="truncate">{atual?.name ?? (isLoading ? 'Carregando…' : 'Cliente')}</span>
          <ChevronsUpDown className="h-3.5 w-3.5 shrink-0 opacity-60" />
        </Button>
      </PopoverTrigger>

      <PopoverContent align="start" className="w-64 p-0">
        {/* Input próprio em vez do Command: a lista é curta (10-15 clientes) e
            o Command traria navegação por teclado que aqui ninguém pediu. */}
        <div className="relative border-b border-border/60">
          <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            autoFocus
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar cliente…"
            className="h-9 border-0 pl-8 focus-visible:ring-0"
          />
        </div>

        <div className="max-h-72 overflow-y-auto py-1">
          {filtrados.length === 0 ? (
            <p className="px-3 py-4 text-center text-xs text-muted-foreground">
              {isLoading ? 'Carregando clientes…' : 'Nenhum cliente com esse nome.'}
            </p>
          ) : (
            filtrados.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => trocar(p.id)}
                className={cn(
                  'flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm transition-colors hover:bg-muted',
                  p.id === projectId && 'font-medium',
                )}
              >
                <Check
                  className={cn('h-3.5 w-3.5 shrink-0', p.id === projectId ? 'opacity-100' : 'opacity-0')}
                />
                <span className="truncate">{p.name}</span>
              </button>
            ))
          )}
        </div>
      </PopoverContent>
    </Popover>
  )
}
