'use client'

/**
 * Toggle de DESTAQUE de uma foto do acervo ("prata da casa", F1.4).
 *
 * Atualização otimista sobre TODAS as consultas de acervo do projeto — a
 * queryKey do `useAcervo` varia por tema/pasta/limite, então o prefixo
 * `['projeto', id, 'acervo']` pega todas as variantes em cache. A estrela
 * responde no toque; a invalidação ao concluir traz a verdade do servidor
 * (reemitir a busca não duplica sinal: `sugestoesJaEmitidas` é idempotente).
 *
 * 403 vira aviso em linguagem simples: destacar é curadoria, e curadoria é
 * de quem administra o cliente (mesmo gate dos modelos).
 */

import { useMutation, useQueryClient } from '@tanstack/react-query'
import { api, ApiError } from '@/lib/api-client'
import { useToast } from '@/hooks/use-toast'
import type { ImagemDoAcervo, RespostaDoAcervo } from '@/hooks/use-acervo'

interface ToggleDestaque {
  driveFileId: string
  destaque: boolean
}

/** O campo que a API do acervo passa a devolver; opcional — ausente = false. */
type ImagemComDestaque = ImagemDoAcervo & { destaque?: boolean }

export function useDestaqueDeFoto(projectId: number) {
  const queryClient = useQueryClient()
  const { toast } = useToast()
  const prefixoDoAcervo = ['projeto', projectId, 'acervo']

  return useMutation({
    mutationFn: ({ driveFileId, destaque }: ToggleDestaque) =>
      api.post<{ ok: boolean; destaque: boolean }>(
        `/api/projects/${projectId}/acervo/destaque`,
        { driveFileId, destaque },
      ),
    onMutate: async ({ driveFileId, destaque }) => {
      await queryClient.cancelQueries({ queryKey: prefixoDoAcervo })
      const anteriores = queryClient.getQueriesData<RespostaDoAcervo>({
        queryKey: prefixoDoAcervo,
      })
      queryClient.setQueriesData<RespostaDoAcervo>(
        { queryKey: prefixoDoAcervo },
        (atual) =>
          atual
            ? {
                ...atual,
                images: atual.images.map((img): ImagemComDestaque =>
                  img.driveFileId === driveFileId ? { ...img, destaque } : img,
                ),
              }
            : atual,
      )
      return { anteriores }
    },
    onError: (error, _variaveis, contexto) => {
      for (const [chave, dado] of contexto?.anteriores ?? []) {
        queryClient.setQueryData(chave, dado)
      }
      if (error instanceof ApiError && error.status === 403) {
        toast({
          title: 'Só quem administra o cliente pode destacar',
          description:
            'Marcar foto como destaque é coisa de administrador deste cliente. Peça a quem administra a conta.',
          variant: 'destructive',
        })
      } else {
        toast({
          title: 'Não deu para salvar o destaque',
          description: 'Tente de novo em instantes.',
          variant: 'destructive',
        })
      }
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: prefixoDoAcervo })
    },
  })
}
