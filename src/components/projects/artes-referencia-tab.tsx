'use client'

/**
 * Gestão das ARTES DE REFERÊNCIA do projeto — as peças aprovadas que servem de
 * inspiração para as próximas gerações.
 *
 * Por que uma tela própria, e não só a estrela na galeria: marcar é fácil,
 * conferir o conjunto é que não. Uma referência esquecida lá atrás continua
 * puxando o estilo de tudo que se gera, e a única forma de perceber isso é
 * vendo as marcadas juntas.
 *
 * A ORDEM é o conteúdo desta tela. A primeira é a que entra na próxima arte
 * (rodízio: menos usada primeiro) — sem isso a lista seria só uma galeria
 * filtrada.
 */

import * as React from 'react'
import Image from 'next/image'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Star, StarOff, Info } from 'lucide-react'
import { api } from '@/lib/api-client'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { useToast } from '@/hooks/use-toast'

interface ReferenciaDeEstilo {
  generationId: string
  url: string | null
  marcadaEm: string | null
  ultimoUso: string | null
  proximaDaFila: boolean
}

function quando(iso: string | null): string {
  if (!iso) return 'nunca usada'
  return new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(
    new Date(iso),
  )
}

export function ArtesReferenciaTab({ projectId }: { projectId: number }) {
  const queryClient = useQueryClient()
  const { toast } = useToast()

  const { data, isLoading } = useQuery<{ referencias: ReferenciaDeEstilo[] }>({
    queryKey: ['style-references', projectId],
    queryFn: () => api.get(`/api/projects/${projectId}/style-references`),
    staleTime: 30_000,
  })

  const desmarcar = useMutation({
    mutationFn: (generationId: string) =>
      api.patch(`/api/generations/${generationId}`, { styleRef: false }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['style-references', projectId] })
      queryClient.invalidateQueries({ queryKey: ['generations', projectId] })
      toast({
        title: 'Saiu das referências',
        description: 'Ela não será mais enviada como inspiração das próximas artes.',
      })
    },
    onError: () =>
      toast({
        title: 'Não deu para tirar',
        description: 'Tente de novo em instantes.',
        variant: 'destructive',
      }),
  })

  const referencias = data?.referencias ?? []

  if (isLoading) {
    return (
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-52 w-full rounded-xl" />
        ))}
      </div>
    )
  }

  if (referencias.length === 0) {
    return (
      <Card className="p-6 text-sm text-muted-foreground">
        <p className="flex items-start gap-2">
          <Info className="mt-0.5 h-4 w-4 shrink-0" />
          <span>
            Nenhuma arte marcada ainda. Na aba <strong>Criativos</strong>, clique na estrela de uma
            arte que ficou boa: ela passa a inspirar as próximas gerações desta marca.
          </span>
        </p>
      </Card>
    )
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        {referencias.length === 1
          ? 'Uma arte marcada — ela vai inspirar todas as próximas.'
          : `${referencias.length} artes marcadas. A cada nova arte, o sistema envia UMA delas como referência, sempre a menos usada — é o que dá parentesco à marca sem fazer tudo sair igual.`}
      </p>

      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        {referencias.map((ref) => (
          <Card key={ref.generationId} className="overflow-hidden">
            <div className="relative aspect-[4/5] bg-muted">
              {ref.url && (
                <Image
                  src={ref.url}
                  alt=""
                  fill
                  sizes="(max-width: 768px) 50vw, 25vw"
                  className="object-cover"
                />
              )}
              {ref.proximaDaFila && (
                <Badge className="absolute left-2 top-2 bg-amber-500/90 text-black hover:bg-amber-500/90">
                  <Star className="mr-1 h-3 w-3 fill-current" />
                  próxima
                </Badge>
              )}
            </div>
            <div className="space-y-2 p-3">
              <p className="text-xs text-muted-foreground">Último uso: {quando(ref.ultimoUso)}</p>
              <Button
                size="sm"
                variant="outline"
                className="w-full"
                disabled={desmarcar.isPending}
                onClick={() => desmarcar.mutate(ref.generationId)}
              >
                <StarOff className="mr-2 h-3.5 w-3.5" />
                Tirar
              </Button>
            </div>
          </Card>
        ))}
      </div>
    </div>
  )
}
