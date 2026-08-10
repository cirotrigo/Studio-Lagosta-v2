'use client'

/**
 * Fila de cards da bancada — o que está sendo produzido agora, mais recente
 * primeiro (é fila, não grade semanal).
 *
 * Cada card mostra a ação seguinte do seu estado, e só ela: rascunho gera,
 * pronto agenda, erro tenta de novo. Card gerando não oferece nada — a página
 * se atualiza sozinha.
 */

import * as React from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { Loader2, Sparkles, Trash2, Calendar, RefreshCw, ExternalLink } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import { useBancada } from '@/hooks/use-bancada'
import type { BancadaItem } from '@/stores/bancada-store'

const ROTULO: Record<BancadaItem['status'], string> = {
  rascunho: 'na fila',
  gerando: 'gerando…',
  pronto: 'pronta',
  erro: 'falhou',
  agendado: 'na agenda',
}

const COR: Record<BancadaItem['status'], string> = {
  rascunho: 'bg-slate-500/15 text-slate-300',
  gerando: 'bg-primary/15 text-primary',
  pronto: 'bg-emerald-500/15 text-emerald-400',
  erro: 'bg-destructive/15 text-destructive',
  agendado: 'bg-amber-500/15 text-amber-400',
}

export function BancadaFila({ projectId }: { projectId: number }) {
  const { itens, gerar, agendar, remover } = useBancada(projectId)

  if (itens.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-border/60 py-12 text-center">
        <p className="text-sm text-muted-foreground">
          A fila está vazia. Monte um item acima para começar.
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {itens.map((item) => (
        <Card
          key={item.id}
          item={item}
          projectId={projectId}
          onGerar={() => gerar(item)}
          onAgendar={(quando, situacao) => agendar(item, quando, situacao)}
          onRemover={() => remover(item.id)}
        />
      ))}
    </div>
  )
}

function Card({
  item,
  projectId,
  onGerar,
  onAgendar,
  onRemover,
}: {
  item: BancadaItem
  projectId: number
  onGerar: () => void
  onAgendar: (quando: string, situacao: 'rascunho' | 'agendado') => void
  onRemover: () => void
}) {
  const [quando, setQuando] = React.useState(() => paraInputs(item.quando))
  const capa = item.resultUrl ?? item.referencias.find((r) => r.papel === 'subject')?.thumbUrl

  const quandoTexto = quando.data && quando.hora ? `${quando.data} ${quando.hora}` : ''

  return (
    <div className="flex gap-3 rounded-xl border border-border/60 bg-card/40 p-3">
      {/* Miniatura em largura FIXA, sem variante responsiva: `sm:w-28` e
          `w-[7rem]` não geram CSS neste repo (medido em 09/08/2026 — a imagem
          ficava `w-full` e engolia o card). `w-28`/`h-36` geram. */}
      <div className="relative h-36 w-28 flex-shrink-0 overflow-hidden rounded-lg bg-muted/40">
        {capa ? (
          <Image src={capa} alt="" fill sizes="112px" className="object-cover" unoptimized />
        ) : null}
        {item.status === 'gerando' && (
          <div className="absolute inset-0 flex items-center justify-center bg-background/70">
            <Loader2 className="h-5 w-5 animate-spin text-primary" />
          </div>
        )}
        {!item.resultUrl && item.status !== 'gerando' && capa && (
          <span className="absolute bottom-1 left-1 rounded bg-background/80 px-1.5 py-0.5 text-[10px]">
            📷 referência
          </span>
        )}
      </div>

      <div className="min-w-0 flex-1 space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <span className={cn('rounded-full px-2 py-0.5 text-[11px] font-medium', COR[item.status])}>
            {ROTULO[item.status]}
          </span>
          <span className="text-[11px] text-muted-foreground">
            {item.formato === 'story' ? 'Story' : item.formato === 'feed' ? 'Feed' : 'Quadrado'}
          </span>
          {item.quando && (
            <span className="text-[11px] text-muted-foreground">· {item.quando}</span>
          )}
        </div>

        <p className="truncate text-sm font-medium">{item.copy[0] ?? '(sem copy)'}</p>
        {item.copy.length > 1 && (
          <p className="truncate text-xs text-muted-foreground">{item.copy.slice(1).join(' · ')}</p>
        )}
        {item.motivoDoSlot && item.status === 'rascunho' && (
          <p className="text-[11px] text-muted-foreground">🎯 {item.motivoDoSlot}</p>
        )}
        {item.erro && <p className="text-xs text-destructive">{item.erro}</p>}

        <div className="flex flex-wrap items-center gap-2 pt-1">
          {(item.status === 'rascunho' || item.status === 'erro') && (
            <Button size="sm" onClick={onGerar}>
              {item.status === 'erro' ? (
                <RefreshCw className="mr-2 h-4 w-4" />
              ) : (
                <Sparkles className="mr-2 h-4 w-4" />
              )}
              {item.status === 'erro' ? 'Tentar de novo' : 'Gerar arte (25 créditos)'}
            </Button>
          )}

          {item.status === 'gerando' && (
            <span className="text-xs text-muted-foreground">
              A página atualiza sozinha quando ficar pronta.
            </span>
          )}

          {item.status === 'pronto' && (
            <>
              <Input
                type="date"
                value={quando.data}
                onChange={(e) => setQuando((q) => ({ ...q, data: e.target.value }))}
                className="h-8 w-36"
              />
              <Input
                type="time"
                value={quando.hora}
                onChange={(e) => setQuando((q) => ({ ...q, hora: e.target.value }))}
                className="h-8 w-24"
              />
              <Button
                size="sm"
                variant="outline"
                disabled={!quandoTexto}
                onClick={() => onAgendar(quandoTexto, 'rascunho')}
              >
                <Calendar className="mr-2 h-4 w-4" />
                Rascunho na agenda
              </Button>
              <Button size="sm" disabled={!quandoTexto} onClick={() => onAgendar(quandoTexto, 'agendado')}>
                Agendar
              </Button>
            </>
          )}

          {item.status === 'agendado' && (
            <Link
              href={`/projects/${projectId}/agenda`}
              className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
            >
              Ver na agenda <ExternalLink className="h-3 w-3" />
            </Link>
          )}

          {item.status !== 'gerando' && (
            <Button
              size="icon"
              variant="ghost"
              className="h-8 w-8"
              title="Tirar da fila"
              onClick={onRemover}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          )}
        </div>
      </div>
    </div>
  )
}

/** "YYYY-MM-DD HH:mm" → campos de data e hora do formulário. */
function paraInputs(quando?: string | null): { data: string; hora: string } {
  if (!quando) return { data: '', hora: '' }
  const [data, hora] = quando.split(' ')
  return { data: data ?? '', hora: (hora ?? '').slice(0, 5) }
}
