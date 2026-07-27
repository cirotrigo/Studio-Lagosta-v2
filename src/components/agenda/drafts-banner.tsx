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
      <div className="flex flex-wrap items-center gap-3 border-b border-amber-400/40 bg-amber-50 dark:bg-amber-950/20 px-4 sm:px-6 py-2.5">
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <FileEdit className="w-4 h-4 flex-shrink-0 text-amber-600 dark:text-amber-400" />
          <p className="text-sm text-amber-900 dark:text-amber-200">
            <strong>
              {total} {plural}
            </strong>{' '}
            {total === 1 ? 'aguardando' : 'aguardando'} aprovação — não{' '}
            {total === 1 ? 'publica' : 'publicam'} enquanto isso.
          </p>
        </div>

        <div className="flex items-center gap-2">
          {!filtroAtivo && (
            <Button variant="outline" size="sm" onClick={onVerRascunhos}>
              Ver {plural}
            </Button>
          )}

          {projectId !== null && (
            <Button
              size="sm"
              onClick={() => setDialogOpen(true)}
              className="bg-emerald-600 hover:bg-emerald-700 text-white"
            >
              <CalendarCheck className="w-4 h-4 mr-2" />
              Revisar e aprovar
            </Button>
          )}
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
