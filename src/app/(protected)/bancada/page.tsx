'use client'

/**
 * Seletor de cliente da Bancada — a porta de entrada da aba "Bancada" no
 * celular (e funciona igual no desktop).
 *
 * A bancada de verdade vive em `/projects/[id]/bancada`; esta tela só escolhe
 * o cliente. O último projeto usado fica em
 * `localStorage['lagosta.bancada.ultimoProjeto']` e vira o card
 * "Continuar em {nome}" no topo — SEM redirect automático, de propósito:
 * quem cuida de vários clientes troca o tempo todo, e um redirect roubaria a
 * escolha.
 *
 * A logo vem de `Project.Logo[]` (tabela `Logo`), nunca de `Project.logoUrl` —
 * essa coluna está NULL nos projetos reais (regra registrada em
 * `use-project.ts`). O `<Image unoptimized>` segue o padrão da lista de
 * projetos, que já mostra as mesmas logos do Blob.
 */

import * as React from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { ArrowRight, Store } from 'lucide-react'
import { useProjects, type ProjectWithLogoResponse } from '@/hooks/use-project'
import { usePageConfig } from '@/hooks/use-page-config'
import { Card } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'

const CHAVE_ULTIMO_PROJETO = 'lagosta.bancada.ultimoProjeto'

type UltimoProjeto = { id: number; nome: string }

function lerUltimoProjeto(): UltimoProjeto | null {
  try {
    const bruto = window.localStorage.getItem(CHAVE_ULTIMO_PROJETO)
    if (!bruto) return null
    const valor = JSON.parse(bruto) as unknown
    if (
      valor &&
      typeof valor === 'object' &&
      typeof (valor as UltimoProjeto).id === 'number' &&
      typeof (valor as UltimoProjeto).nome === 'string'
    ) {
      return valor as UltimoProjeto
    }
    return null
  } catch {
    // Valor antigo ou corrompido não pode derrubar a tela.
    return null
  }
}

function guardarUltimoProjeto(projeto: UltimoProjeto) {
  try {
    window.localStorage.setItem(CHAVE_ULTIMO_PROJETO, JSON.stringify(projeto))
  } catch {
    // Sem localStorage (modo privado etc.) a tela segue funcionando.
  }
}

function logoDoProjeto(projeto: ProjectWithLogoResponse) {
  return projeto.Logo?.find((logo) => logo.isProjectLogo) ?? projeto.Logo?.[0] ?? null
}

function LogoDoCliente({
  projeto,
  tamanho,
}: {
  projeto: ProjectWithLogoResponse
  tamanho: 'md' | 'lg'
}) {
  const logo = logoDoProjeto(projeto)
  const caixa = tamanho === 'lg' ? 'h-14 w-14' : 'h-12 w-12'

  if (logo) {
    return (
      <div
        className={`relative ${caixa} shrink-0 overflow-hidden rounded-xl bg-muted ring-1 ring-border/40`}
      >
        <Image
          src={logo.fileUrl}
          alt={`Logo de ${projeto.name}`}
          fill
          sizes="56px"
          className="object-cover"
          unoptimized
        />
      </div>
    )
  }

  return (
    <div
      className={`flex ${caixa} shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-primary/20 to-primary/5 ring-1 ring-border/40`}
    >
      <Store className="h-6 w-6 text-primary" aria-hidden="true" />
    </div>
  )
}

export default function BancadaSelecionarProjetoPage() {
  usePageConfig('Bancada', 'Escolha o cliente para abrir a bancada de criação')

  const { data: projetos, isLoading, isError } = useProjects()

  // Lido num efeito (não no primeiro render) para o HTML do servidor e o do
  // cliente baterem — localStorage só existe no navegador.
  const [ultimo, setUltimo] = React.useState<UltimoProjeto | null>(null)
  React.useEffect(() => {
    setUltimo(lerUltimoProjeto())
  }, [])

  // O card "Continuar" só aparece se o projeto ainda está na lista (a pessoa
  // pode ter perdido acesso desde a última visita). O nome exibido é o da
  // lista, que é o atual — o guardado pode ter envelhecido.
  const projetoParaContinuar = React.useMemo(() => {
    if (!ultimo || !projetos) return null
    return projetos.find((p) => p.id === ultimo.id) ?? null
  }, [ultimo, projetos])

  const aoEscolher = React.useCallback((projeto: ProjectWithLogoResponse) => {
    guardarUltimoProjeto({ id: projeto.id, nome: projeto.name })
  }, [])

  if (isLoading) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-24 w-full rounded-xl" />
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-20 w-full rounded-xl" />
          ))}
        </div>
      </div>
    )
  }

  if (isError) {
    return (
      <Card className="border-destructive/40 bg-card/60 p-6 text-sm text-muted-foreground">
        Não foi possível carregar os clientes agora. Puxe para atualizar ou
        tente de novo em instantes.
      </Card>
    )
  }

  if (!projetos || projetos.length === 0) {
    return (
      <Card className="bg-card/60 p-6 text-sm text-muted-foreground">
        Nenhum cliente por aqui ainda. Crie um projeto em{' '}
        <Link href="/projects" className="text-primary underline-offset-4 hover:underline">
          Projetos
        </Link>{' '}
        para abrir a bancada.
      </Card>
    )
  }

  return (
    <div className="space-y-4">
      {projetoParaContinuar && (
        <Link
          href={`/projects/${projetoParaContinuar.id}/bancada`}
          onClick={() => aoEscolher(projetoParaContinuar)}
          className="block"
        >
          {/* `flex-row` explícito: a base do Card é `flex-col` e o cn faz merge */}
          <Card className="group flex-row items-center gap-4 border-primary/40 bg-primary/5 p-4 transition-colors hover:bg-primary/10">
            <LogoDoCliente projeto={projetoParaContinuar} tamanho="lg" />
            <div className="min-w-0 flex-1">
              <p className="text-xs font-medium uppercase tracking-wide text-primary">
                Continuar em
              </p>
              <p className="truncate text-base font-semibold">
                {projetoParaContinuar.name}
              </p>
            </div>
            <ArrowRight
              className="h-5 w-5 shrink-0 text-primary transition-transform group-hover:translate-x-0.5"
              aria-hidden="true"
            />
          </Card>
        </Link>
      )}

      <div>
        <h2 className="mb-2 text-sm font-medium text-muted-foreground">
          {projetoParaContinuar ? 'Todos os clientes' : 'Escolha o cliente'}
        </h2>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {projetos.map((projeto) => (
            <Link
              key={projeto.id}
              href={`/projects/${projeto.id}/bancada`}
              onClick={() => aoEscolher(projeto)}
              className="block"
            >
              <Card className="group flex-row items-center gap-3 border-border/40 bg-card/60 p-3 transition-colors hover:border-primary/40 hover:bg-accent/60">
                <LogoDoCliente projeto={projeto} tamanho="md" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold">{projeto.name}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    Abrir bancada
                  </p>
                </div>
                <ArrowRight
                  className="h-4 w-4 shrink-0 text-muted-foreground transition-colors group-hover:text-primary"
                  aria-hidden="true"
                />
              </Card>
            </Link>
          ))}
        </div>
      </div>
    </div>
  )
}
