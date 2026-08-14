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
import { CalendarRange, ChevronDown, ExternalLink, ImageOff, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'
import { useCoberturaDoCliente, type ItemDaCobertura } from '@/hooks/use-cobertura-semana'
import { useProporSemana } from '@/hooks/use-planos'
import { useToast } from '@/hooks/use-toast'

/** Trilho compacto: os últimos publicados; o resto vira "+ N" com a agenda. */
const MAX_PUBLICADOS_NO_RESUMO = 8

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

  /**
   * COLAPSADO por padrão (pedido do Ciro, 13/08/2026): o cartão aberto empurra
   * o compositor e a fila — o trabalho — para baixo da dobra. O cabeçalho
   * carrega o essencial de relance (contadores e o selo "faltam N"/"coberta"),
   * então fechado ele ainda responde a pergunta do dia; abrir é para VER as
   * artes e completar a semana.
   */
  const [aberto, setAberto] = React.useState(false)

  const faltando = cobertura?.horariosEmAberto.length ?? 0

  return (
    <Card className="gap-0 border-border/60 bg-card/40 p-0">
      <div className="flex items-center gap-2 p-4">
        <button
          type="button"
          onClick={() => setAberto((v) => !v)}
          aria-expanded={aberto}
          className="flex min-w-0 flex-1 items-center gap-2 text-left"
        >
          <ChevronDown
            className={cn(
              'h-4 w-4 shrink-0 text-muted-foreground transition-transform',
              aberto && 'rotate-180',
            )}
          />
          <h2 className="min-w-0 shrink-0 truncate text-sm font-semibold">
            {nomeDoCliente ? `Esta semana no ${nomeDoCliente}` : 'Esta semana'}
          </h2>
          {carregando && <Skeleton className="h-4 w-40" />}
          {!carregando && erro && (
            <span className="truncate text-xs text-muted-foreground">
              sem leitura da agenda agora
            </span>
          )}
          {!carregando && !erro && cobertura && (
            <>
              <span className="min-w-0 truncate text-xs text-muted-foreground">
                {contar(cobertura.publicados.length, 'publicado', 'publicados')}
                {' · '}
                {contar(cobertura.agendados.length, 'agendado', 'agendados')}
                {' · '}
                {contar(cobertura.rascunhos.length, 'rascunho', 'rascunhos')}
                {cobertura.falharam > 0 && (
                  <span className="text-amber-600 dark:text-amber-500">
                    {' · '}
                    {cobertura.falharam === 1 ? '1 não saiu' : `${cobertura.falharam} não saíram`}
                  </span>
                )}
              </span>
              {/* O selo que sobrevive ao colapso: é a resposta de relance. */}
              {slotsResolvidos && faltando > 0 && (
                <span className="shrink-0 rounded-full bg-amber-500/15 px-2 py-0.5 text-[11px] font-medium text-amber-600 dark:text-amber-500">
                  faltam {faltando}
                </span>
              )}
              {slotsResolvidos && faltando === 0 && cobertura.temRitmo && (
                <span className="shrink-0 rounded-full bg-emerald-500/15 px-2 py-0.5 text-[11px] font-medium text-emerald-600 dark:text-emerald-400">
                  coberta ✓
                </span>
              )}
            </>
          )}
        </button>
        <Link
          href={`/projects/${projectId}/agenda`}
          className="inline-flex shrink-0 items-center gap-1 text-xs text-primary hover:underline"
        >
          ver agenda <ExternalLink className="h-3 w-3" />
        </Link>
      </div>

      {aberto && (
        <div className="space-y-3 border-t border-border/40 p-4 pt-3">
          {carregando && (
            <div className="space-y-2">
              <Skeleton className="h-4 w-64" />
              <Skeleton className="h-28 w-full" />
            </div>
          )}

          {!carregando && erro && (
            <p className="text-xs text-muted-foreground">
              Não deu para ler a agenda da semana agora — a bancada segue normal.
            </p>
          )}

          {!carregando && !erro && cobertura && (
            <>
              {/* O que já saiu, como TRILHO de capas: a arte é o conteúdo desta
                  lista, e na lista vertical antiga ela tinha 44px. Capa inteira
                  (`object-contain`, regra da casa — capa cortada mente sobre a
                  arte), horário e trecho embaixo. */}
              {cobertura.publicados.length > 0 ? (
                <div className="flex gap-2 overflow-x-auto pb-1">
                  {cobertura.publicados.slice(-MAX_PUBLICADOS_NO_RESUMO).map((item) => (
                    <CapaPublicada key={item.id} item={item} />
                  ))}
                  {cobertura.publicados.length > MAX_PUBLICADOS_NO_RESUMO && (
                    <Link
                      href={`/projects/${projectId}/agenda`}
                      className="flex h-28 w-20 shrink-0 flex-col items-center justify-center gap-1 rounded-md border border-dashed border-border/60 text-center text-[11px] text-muted-foreground hover:border-primary/50 hover:text-foreground"
                    >
                      + {cobertura.publicados.length - MAX_PUBLICADOS_NO_RESUMO}
                      <span>ver agenda</span>
                    </Link>
                  )}
                </div>
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
                        O Studio ainda não conhece o ritmo deste cliente — dá para montar a
                        semana como ponto de partida.
                      </p>
                      {botaoCompletar}
                    </>
                  ))}
              </div>
            </>
          )}
        </div>
      )}
    </Card>
  )
}

/**
 * Uma capa do trilho "o que já saiu": a arte inteira em pé (story é o caso
 * comum), com horário/tipo e o trecho da legenda embaixo. Largura FIXA e sem
 * variante responsiva — classe morta de Tailwind é a armadilha nº 1 deste repo.
 */
function CapaPublicada({ item }: { item: ItemDaCobertura }) {
  return (
    <figure className="w-20 shrink-0" title={item.resumo ?? undefined}>
      <span className="relative block h-28 w-20 overflow-hidden rounded-md border border-border/40 bg-muted/40">
        {item.capa ? (
          <Image src={item.capa} alt="" fill sizes="80px" className="object-contain" unoptimized />
        ) : (
          <span className="absolute inset-0 flex items-center justify-center text-muted-foreground">
            <ImageOff className="h-4 w-4" />
          </span>
        )}
      </span>
      <figcaption className="mt-1 space-y-0.5">
        <span className="block truncate text-[10px] tabular-nums text-muted-foreground">
          {item.quandoCurto} · {item.tipo}
        </span>
        <span className="block truncate text-[10px]">
          {item.resumo ?? 'Sem legenda registrada'}
        </span>
      </figcaption>
    </figure>
  )
}
