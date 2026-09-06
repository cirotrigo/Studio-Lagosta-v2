'use client'

/**
 * Aviso de rascunhos aguardando aprovação.
 *
 * Quem gera uma semana inteira pelo chat cai na agenda com vários rascunhos;
 * sem esta barra teria que abrir post por post para descobrir o que ainda não
 * publica. Fica no topo da agenda e leva direto para a aprovação em lote.
 *
 * Na visão de todos os canais não há botão de aprovar tudo de propósito: os
 * posts sairiam em contas de clientes diferentes, então a pessoa escolhe o
 * canal antes.
 */

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { FileEdit, CalendarCheck } from 'lucide-react'
import { ApprovePostsDialog } from './post-actions/approve-posts-dialog'
import { isRascunho } from './calendar/calendar-utils'
import type { SocialPost } from '../../../prisma/generated/client'

interface DraftsBannerProps {
  /** Posts do período carregado, antes dos filtros de status. */
  posts: SocialPost[]
  projectId: number | null
  contaLabel: string
  /** Já está filtrando por rascunho? Então o botão de filtrar não aparece. */
  filtroAtivo: boolean
  onVerRascunhos: () => void
}

export function DraftsBanner({
  posts,
  projectId,
  contaLabel,
  filtroAtivo,
  onVerRascunhos,
}: DraftsBannerProps) {
  const [dialogOpen, setDialogOpen] = useState(false)

  const rascunhos = posts.filter(isRascunho)
  if (rascunhos.length === 0) return null

  const total = rascunhos.length
  const plural = total === 1 ? 'rascunho' : 'rascunhos'

  return (
    <>
      {/*
        No celular o texto e os botões vão em LINHAS separadas. A versão
        anterior era `flex-wrap` com o texto em `flex-1 min-w-0`: `min-w-0`
        tira o piso de largura do texto, então em vez de quebrar os botões
        para a linha de baixo o navegador espremia o parágrafo até uma letra
        por linha — "21 rascunhos" virava uma coluna de 1.000px na agenda do
        iPhone (05/09/2026).
      */}
      <div className="border-b border-amber-400/40 bg-amber-50 px-4 py-2.5 dark:bg-amber-950/20 sm:px-6">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
          <div className="flex min-w-0 flex-1 items-start gap-2 sm:items-center">
            <FileEdit className="mt-0.5 h-4 w-4 flex-shrink-0 text-amber-600 dark:text-amber-400 sm:mt-0" />
            <p className="min-w-0 text-sm text-amber-900 dark:text-amber-200">
              <strong>
                {total} {plural}
              </strong>{' '}
              aguardando aprovação — não {total === 1 ? 'publica' : 'publicam'} enquanto isso.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {!filtroAtivo && (
              <Button variant="outline" size="sm" onClick={onVerRascunhos} className="flex-1 sm:flex-none">
                Ver {plural}
              </Button>
            )}

            {projectId !== null && (
              <Button
                size="sm"
                onClick={() => setDialogOpen(true)}
                className="flex-1 bg-emerald-600 text-white hover:bg-emerald-700 sm:flex-none"
              >
                <CalendarCheck className="mr-2 h-4 w-4" />
                Revisar e aprovar
              </Button>
            )}
          </div>
        </div>
      </div>

      {projectId !== null && dialogOpen && (
        <ApprovePostsDialog
          posts={rascunhos}
          projectId={projectId}
          contaLabel={contaLabel}
          open={dialogOpen}
          onClose={() => setDialogOpen(false)}
        />
      )}
    </>
  )
}
