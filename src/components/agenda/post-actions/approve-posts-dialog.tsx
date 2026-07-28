'use client'

/**
 * Confirmação de aprovação de rascunhos.
 *
 * Aprovar coloca o post na fila e ele sai no Instagram do cliente na hora
 * marcada — por isso o diálogo repete, por post, a conta e o horário exatos em
 * vez de um "tem certeza?" genérico. Em lote a pessoa pode desmarcar o que não
 * quer aprovar agora.
 */

import { useEffect, useMemo, useState } from 'react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import { CalendarCheck, Instagram, Loader2, AlertTriangle } from 'lucide-react'
import { toast } from 'sonner'
import { usePostApproval } from '@/hooks/use-post-approval'
import { formatPostDateTimeBR, getPostDate } from '../calendar/calendar-utils'
import { cn } from '@/lib/utils'
import type { SocialPost } from '../../../../prisma/generated/client'

interface ApprovePostsDialogProps {
  posts: SocialPost[]
  projectId: number
  /** @username do Instagram, ou o nome do projeto quando não houver */
  contaLabel: string
  open: boolean
  onClose: () => void
  /** Chamado quando ao menos um post foi aprovado. */
  onApproved?: () => void
}

const TIPO_LABEL: Record<string, string> = {
  STORY: 'Story',
  REEL: 'Reels',
  CAROUSEL: 'Carrossel',
  POST: 'Post de feed',
}

export function ApprovePostsDialog({
  posts,
  projectId,
  contaLabel,
  open,
  onClose,
  onApproved,
}: ApprovePostsDialogProps) {
  const { approvePosts } = usePostApproval(projectId)
  const [selecionados, setSelecionados] = useState<string[]>([])

  // Horário vencido é recusado pelo servidor: marcar aqui evita que a pessoa
  // confirme uma aprovação que já sai ignorada.
  const vencidos = useMemo(() => {
    const agora = Date.now()
    return new Set(
      posts
        .filter((post) => {
          const data = getPostDate(post)
          return !data || data.getTime() <= agora
        })
        .map((post) => post.id),
    )
  }, [posts])

  // Mesma lógica para rascunho sem arte: o servidor recusa, então já aparece
  // desmarcado e com o motivo, em vez de sumir num aviso genérico depois.
  const semArte = useMemo(
    () =>
      new Set(
        posts
          .filter((post) => (post.mediaUrls?.length ?? 0) === 0 && !post.pageId)
          .map((post) => post.id),
      ),
    [posts],
  )

  useEffect(() => {
    if (open) {
      setSelecionados(
        posts.filter((p) => !vencidos.has(p.id) && !semArte.has(p.id)).map((p) => p.id),
      )
    }
  }, [open, posts, vencidos, semArte])

  const isLote = posts.length > 1
  const total = selecionados.length

  const toggle = (postId: string) => {
    setSelecionados((atual) =>
      atual.includes(postId)
        ? atual.filter((id) => id !== postId)
        : [...atual, postId],
    )
  }

  const handleApprove = async () => {
    if (total === 0) return

    try {
      const resultado = await approvePosts.mutateAsync(selecionados)

      if (resultado.processados.length > 0) {
        toast.success(resultado.mensagem, {
          description: `Vai publicar no Instagram de ${contaLabel} no horário marcado.`,
        })
        onApproved?.()
      }

      if (resultado.ignorados.length > 0) {
        const primeiro = resultado.ignorados[0]
        toast.warning(
          resultado.ignorados.length === 1
            ? 'Um post não foi aprovado'
            : `${resultado.ignorados.length} posts não foram aprovados`,
          { description: primeiro.motivo },
        )
      }

      if (resultado.processados.length > 0) onClose()
    } catch (_error) {
      toast.error('Não foi possível aprovar agora. Tente de novo.')
    }
  }

  return (
    <Dialog open={open} onOpenChange={(aberto) => !aberto && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CalendarCheck className="w-5 h-5 text-emerald-600" />
            {isLote ? 'Aprovar rascunhos' : 'Aprovar rascunho'}
          </DialogTitle>
          <DialogDescription>
            Depois de aprovado, o post entra na fila e é publicado
            automaticamente no horário marcado. Até lá, rascunho não publica.
          </DialogDescription>
        </DialogHeader>

        <div className="rounded-lg border border-amber-400/50 bg-amber-50 dark:bg-amber-950/20 p-3">
          <div className="flex items-center gap-2 text-sm font-medium text-amber-900 dark:text-amber-200">
            <Instagram className="w-4 h-4 flex-shrink-0" />
            <span>
              Vai publicar no Instagram de <strong>{contaLabel}</strong>
            </span>
          </div>
        </div>

        <ScrollArea className={cn(isLote ? 'max-h-64' : 'max-h-40')}>
          <ul className="space-y-2 pr-3">
            {posts.map((post) => {
              const vencido = vencidos.has(post.id)
              const faltaArte = semArte.has(post.id)
              const bloqueado = vencido || faltaArte
              const marcado = selecionados.includes(post.id)

              return (
                <li
                  key={post.id}
                  className={cn(
                    'flex items-start gap-3 rounded-lg border p-3 text-sm',
                    bloqueado
                      ? 'border-red-300 bg-red-50 dark:bg-red-950/20'
                      : marcado
                        ? 'border-emerald-400/60 bg-emerald-50/60 dark:bg-emerald-950/20'
                        : 'border-border',
                  )}
                >
                  {isLote && (
                    <Checkbox
                      checked={marcado}
                      disabled={bloqueado}
                      onCheckedChange={() => toggle(post.id)}
                      className="mt-0.5"
                      aria-label={`Aprovar ${TIPO_LABEL[post.postType] ?? 'post'} de ${formatPostDateTimeBR(post)}`}
                    />
                  )}

                  <div className="flex-1 min-w-0 space-y-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <Badge variant="outline" className="text-[10px]">
                        {TIPO_LABEL[post.postType] ?? 'Post'}
                      </Badge>
                      <span className="font-medium">
                        {formatPostDateTimeBR(post)}
                      </span>
                    </div>

                    {post.caption && (
                      <p className="text-xs text-muted-foreground line-clamp-2">
                        {post.caption}
                      </p>
                    )}

                    {vencido && (
                      <p className="flex items-center gap-1 text-xs font-medium text-red-700 dark:text-red-300">
                        <AlertTriangle className="w-3 h-3 flex-shrink-0" />
                        O horário já passou. Reagende antes de aprovar.
                      </p>
                    )}

                    {!vencido && faltaArte && (
                      <p className="flex items-center gap-1 text-xs font-medium text-red-700 dark:text-red-300">
                        <AlertTriangle className="w-3 h-3 flex-shrink-0" />
                        Este rascunho está sem arte. Adicione a imagem antes de aprovar.
                      </p>
                    )}
                  </div>
                </li>
              )
            })}
          </ul>
        </ScrollArea>

        <DialogFooter className="gap-2 sm:gap-2">
          <Button variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button
            onClick={handleApprove}
            disabled={total === 0 || approvePosts.isPending}
            className="bg-emerald-600 hover:bg-emerald-700 text-white"
          >
            {approvePosts.isPending ? (
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            ) : (
              <CalendarCheck className="w-4 h-4 mr-2" />
            )}
            {total > 1 ? `Aprovar ${total} posts` : 'Aprovar e agendar'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
