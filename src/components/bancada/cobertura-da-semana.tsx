'use client'

/**
 * Cobertura da semana (WP5) — o cartão "o que saiu, o que falta" da bancada.
 *
 * Responde de relance: "a Wine Vix postou o almoço executivo e o happy hour;
 * faltam quinta 19h e domingo 11h". Os horários em aberto vêm do ritmo
 * aprendido do cliente (`GET /slots`, mesma consulta do compositor), e o botão
 * "Completar a semana" chama `useProporSemana` — a leva chega à FILA abaixo
 * como proposta, pela invalidação que o hook já faz. Nada é produzido nem
 * cobrado por aqui.
 *
 * Erro ou demora deste cartão nunca atrapalha o resto da bancada: ele degrada
 * para uma linha discreta e a fila segue normal.
 */

import * as React from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { CalendarRange, ExternalLink, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { useCoberturaDoCliente, type ItemDaCobertura } from '@/hooks/use-cobertura-semana'
import { useProporSemana } from '@/hooks/use-planos'
import { useToast } from '@/hooks/use-toast'

/** Lista compacta: os últimos publicados; o resto vira "+ N" com a agenda. */
const MAX_PUBLICADOS_NO_RESUMO = 4

function contar(n: number, singular: string, plural: string): string {
  return `${n} ${n === 1 ? singular : plural}`
}

export function CoberturaDaSemana({
  projectId,
  nomeDoCliente,
}: {
  projectId: number
  nomeDoCliente?: string
}) {
  const { cobertura, carregando, erro, slotsResolvidos, slotsErro } =
    useCoberturaDoCliente(projectId)
  const propor = useProporSemana(projectId)
  const { toast } = useToast()

  const completarSemana = React.useCallback(() => {
    propor.mutate(undefined, {
      onSuccess: (r) => {
        toast({
          title: r.coldStart ? 'Semana montada como ponto de partida' : 'Semana proposta',
          description: [r.mensagem, r.avisos[0]].filter(Boolean).join(' '),
        })
      },
      onError: (e) => {
        toast({
          title: 'Não deu para montar a semana',
          description: e instanceof Error ? e.message : 'Tente de novo em instantes.',
          variant: 'destructive',
        })
      },
    })
  }, [propor, toast])

  const botaoCompletar = (
    <Button size="sm" variant="outline" onClick={completarSemana} disabled={propor.isPending}>
      {propor.isPending ? (
        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
      ) : (
        <CalendarRange className="mr-2 h-4 w-4" />
      )}
      {propor.isPending ? 'Montando a semana…' : 'Completar a semana'}
    </Button>
  )

  return (
    <Card className="gap-3 border-border/60 bg-card/40 p-4">
      <div className="flex items-center justify-between gap-2">
        <h2 className="min-w-0 truncate text-sm font-semibold">
          {nomeDoCliente ? `Esta semana no ${nomeDoCliente}` : 'Esta semana'}
        </h2>
        <Link
          href={`/projects/${projectId}/agenda`}
          className="inline-flex shrink-0 items-center gap-1 text-xs text-primary hover:underline"
        >
          ver agenda <ExternalLink className="h-3 w-3" />
        </Link>
      </div>

      {carregando && (
        <div className="space-y-2">
          <Skeleton className="h-4 w-64" />
          <Skeleton className="h-4 w-48" />
        </div>
      )}

      {!carregando && erro && (
        <p className="text-xs text-muted-foreground">
          Não deu para ler a agenda da semana agora — a bancada segue normal.
        </p>
      )}

      {!carregando && !erro && cobertura && (
        <>
          {/* Contadores da semana, em uma linha */}
          <p className="text-xs text-muted-foreground">
            {contar(cobertura.publicados.length, 'publicado', 'publicados')}
            {' · '}
            {contar(cobertura.agendados.length, 'agendado', 'agendados')}
            {' · '}
            {contar(cobertura.rascunhos.length, 'rascunho', 'rascunhos')}
            {cobertura.falharam > 0 && (
              <span className="text-amber-600 dark:text-amber-500">
                {' · '}
                {cobertura.falharam === 1
                  ? '1 não saiu — veja a agenda'
                  : `${cobertura.falharam} não saíram — veja a agenda`}
              </span>
            )}
          </p>

          {/* O que já saiu */}
          {cobertura.publicados.length > 0 ? (
            <ul className="space-y-1.5">
              {cobertura.publicados.slice(-MAX_PUBLICADOS_NO_RESUMO).map((item) => (
                <LinhaPublicada key={item.id} item={item} />
              ))}
              {cobertura.publicados.length > MAX_PUBLICADOS_NO_RESUMO && (
                <li className="text-[11px] text-muted-foreground">
                  + {cobertura.publicados.length - MAX_PUBLICADOS_NO_RESUMO} no começo da semana —{' '}
                  <Link
                    href={`/projects/${projectId}/agenda`}
                    className="text-primary hover:underline"
                  >
                    ver agenda
                  </Link>
                </li>
              )}
            </ul>
          ) : (
            <p className="text-xs text-muted-foreground">Nada publicado ainda nesta semana.</p>
          )}

          {/* O que falta, pelo ritmo aprendido do cliente */}
          <div className="space-y-2 border-t border-border/40 pt-3">
            <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
              Faltando pelo ritmo do cliente
            </p>

            {!slotsResolvidos && !slotsErro && <Skeleton className="h-6 w-48" />}

            {slotsErro && (
              <>
                <p className="text-xs text-muted-foreground">
                  Não deu para calcular os horários em aberto agora — dá para montar a semana
                  mesmo assim.
                </p>
                {botaoCompletar}
              </>
            )}

            {slotsResolvidos &&
              (cobertura.horariosEmAberto.length > 0 ? (
                <>
                  <div className="flex flex-wrap gap-1.5">
                    {cobertura.horariosEmAberto.map((slot) => (
                      <span
                        key={slot.scheduledDatetime}
                        title={slot.motivo}
                        className="rounded-full border border-border/60 bg-muted/30 px-2 py-0.5 text-[11px] tabular-nums"
                      >
                        {slot.rotulo}
                      </span>
                    ))}
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    {botaoCompletar}
                    <p className="text-[11px] text-muted-foreground">
                      A proposta chega à fila abaixo — nada é produzido nem cobrado.
                    </p>
                  </div>
                </>
              ) : cobertura.temRitmo ? (
                <p className="text-xs font-medium text-emerald-600 dark:text-emerald-400">
                  A semana está coberta ✓
                </p>
              ) : (
                <>
                  <p className="text-xs text-muted-foreground">
                    O Studio ainda não conhece o ritmo deste cliente — dá para montar a semana
                    como ponto de partida.
                  </p>
                  {botaoCompletar}
                </>
              ))}
          </div>
        </>
      )}
    </Card>
  )
}

/**
 * Uma linha do "o que já saiu": capa pequena INTEIRA (`object-contain`, regra
 * da casa — capa cortada mente sobre a arte), horário BRT, tipo e o trecho.
 */
function LinhaPublicada({ item }: { item: ItemDaCobertura }) {
  return (
    <li className="flex items-center gap-2 text-xs">
      {item.capa && (
        <span className="relative h-14 w-11 shrink-0 overflow-hidden rounded border border-border/40 bg-muted/40">
          <Image
            src={item.capa}
            alt=""
            fill
            sizes="44px"
            className="object-contain"
            unoptimized
          />
        </span>
      )}
      <span className="shrink-0 tabular-nums text-muted-foreground">{item.quandoCurto}</span>
      <span className="shrink-0 rounded-full border border-border/60 px-2 py-0.5 text-[10px] text-muted-foreground">
        {item.tipo}
      </span>
      <span className="min-w-0 truncate" title={item.resumo ?? undefined}>
        {item.resumo ?? 'Sem legenda registrada'}
      </span>
    </li>
  )
}
