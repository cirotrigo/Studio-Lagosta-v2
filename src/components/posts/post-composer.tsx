'use client'

import { useCallback } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import { isPhotoSwipeOpen, wasPhotoSwipeJustClosed } from '@/hooks/use-photoswipe'
import { PostComposerForm, type PostFormData } from './post-composer-form'

export type { PostFormData, RecurringConfigValue } from './post-composer-form'
export { parseRecurringConfig } from './post-composer-form'

interface PostComposerProps {
  projectId: number
  open: boolean
  onClose: () => void
  initialData?: Partial<PostFormData>
  postId?: string
}

/**
 * O composer num Dialog — casca fina sobre `PostComposerForm`.
 *
 * Desde 08/08/2026 criar e editar post têm rotas próprias
 * (`/projects/[id]/agenda/novo` e `.../[postId]/editar`), com prévia viva ao
 * lado. Este modal sobrou para o painel de agenda dentro do editor de
 * templates, onde navegar sairia do editor e perderia o que não foi salvo —
 * o mesmo motivo pelo qual `PostPreviewModal` continua existindo.
 *
 * O formulário só é MONTADO quando o modal abre: é o que zera o estado entre
 * aberturas, no lugar dos efeitos que faziam essa limpeza à mão.
 */
export function PostComposer({
  projectId,
  open,
  onClose,
  initialData,
  postId,
}: PostComposerProps) {
  // O lightbox se fecha com Esc/clique fora, os mesmos gestos que fecham o
  // Dialog — sem este guard, fechar a foto fechava o composer atrás dela.
  const handleDialogOpenChange = useCallback(
    (next: boolean) => {
      if (next) return
      if (isPhotoSwipeOpen() || wasPhotoSwipeJustClosed()) return
      onClose()
    },
    [onClose],
  )

  return (
    <Dialog open={open} onOpenChange={handleDialogOpenChange}>
      {/*
        `sm:max-w-*` e `sm:p-*`, não os sem prefixo: o DialogContent base
        declara `sm:max-w-lg` e `sm:p-6`, e regra com media query vence regra
        sem — este modal já saiu com 512px por causa disso.
      */}
      <DialogContent className="max-h-[90vh] overflow-hidden p-0 sm:max-w-[1400px] sm:p-0">
        <DialogHeader className="border-b px-6 pt-6 pb-4">
          <DialogTitle>{postId ? 'Editar Post' : 'Criar Novo Post'}</DialogTitle>
          <DialogDescription>Crie e agende posts para Instagram</DialogDescription>
        </DialogHeader>

        {open && (
          <div className="flex max-h-[75vh] flex-col">
            <PostComposerForm
              projectId={projectId}
              postId={postId}
              initialData={initialData}
              onDone={onClose}
              onCancel={onClose}
            />
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
