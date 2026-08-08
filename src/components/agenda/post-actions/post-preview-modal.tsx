'use client'

import { useCallback } from 'react'
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog'
import { VisuallyHidden } from '@radix-ui/react-visually-hidden'
import { isPhotoSwipeOpen, wasPhotoSwipeJustClosed } from '@/hooks/use-photoswipe'
import { PostDetailView } from './post-detail-view'
import type { SocialPost } from '../../../../prisma/generated/client'

interface PostPreviewModalProps {
  post: SocialPost
  open: boolean
  onClose: () => void
  onEdit?: (post: SocialPost) => void
}

/**
 * O post num Dialog — casca fina sobre `PostDetailView`.
 *
 * Desde 08/08/2026 a agenda abre o post em rota
 * (`/projects/[id]/agenda/[postId]`), e este modal sobrou para UM lugar: o
 * painel de agenda dentro do editor de templates. Ali navegar não é opção —
 * sairia do editor e perderia o que não foi salvo.
 *
 * O corpo (923 linhas de regra: janela de congelamento, melhoria com IA,
 * aprovação, verificação no Instagram) é o MESMO da rota. Duas cópias dessa
 * lógica é justamente o que a Fase 2 existe para não deixar acontecer.
 */
export function PostPreviewModal({ post, open, onClose, onEdit }: PostPreviewModalProps) {
  // O lightbox se fecha com Esc/clique fora, os mesmos gestos que fecham o
  // Dialog — sem este guard, fechar a foto fechava o modal atrás dela.
  const handleDialogOpenChange = useCallback(
    (isOpen: boolean) => {
      if (isOpen) return
      if (isPhotoSwipeOpen() || wasPhotoSwipeJustClosed()) return
      onClose()
    },
    [onClose],
  )

  return (
    <Dialog open={open} onOpenChange={handleDialogOpenChange}>
      {/* Duas classes precisam do prefixo `sm:` para valer: o DialogContent
          base declara `sm:max-w-lg` E `sm:p-6`, e regra com media query vence
          regra sem. Um `max-w-3xl`/`p-0` cru sairia com 512px e com 24px de
          padding em qualquer tela ≥640px — o padding estragaria as barras
          grudadas no topo e no rodapé, que precisam encostar na borda. */}
      <DialogContent className="max-h-[85vh] overflow-hidden p-0 sm:max-w-3xl sm:p-0">
        <VisuallyHidden>
          <DialogTitle>Detalhes do post</DialogTitle>
        </VisuallyHidden>

        {/* Altura definida e coluna flex: é o que a tela precisa do pai para
            deixar o cabeçalho e as ações fixos e rolar só o meio.
            O X de fechar do Dialog fica em top-4 right-4, por cima do badge
            de tipo do cabeçalho — abrir espaço para ele é problema de quem
            monta o modal; na rota esse X não existe. */}
        <div className="flex max-h-[85vh] flex-col [&>div>header]:pr-12">
          <PostDetailView post={post} onBack={onClose} onEdit={onEdit} />
        </div>
      </DialogContent>
    </Dialog>
  )
}
