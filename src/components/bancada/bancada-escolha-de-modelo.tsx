'use client'

/**
 * Escolha do modelo a seguir na via template — no card da fila da bancada.
 *
 * COLAPSADO por padrão (pedido do Ciro, 13/08/2026): a linha resume a escolha
 * atual e só quem quer trocar abre a grade. Sem escolha, quem decide é a
 * ROTAÇÃO no servidor (o modelo menos usado do formato) — por isso a opção
 * "rotação automática" existe como estado, não só como ausência.
 *
 * A lista vem ordenada pela própria rotação (menos usado primeiro), então o
 * primeiro modelo da grade é o que a rotação usaria agora.
 */

import * as React from 'react'
import Image from 'next/image'
import { ChevronDown, RefreshCw, Wand2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useModelosDoProjeto, type ModeloDoProjeto } from '@/hooks/use-modelos-do-projeto'

/** O `Template.type` que corresponde a cada formato de item da bancada. */
const TIPO_POR_FORMATO: Record<'story' | 'feed' | 'quadrado', ModeloDoProjeto['tipo']> = {
  story: 'STORY',
  feed: 'FEED',
  quadrado: 'SQUARE',
}

const ROTULO_DO_FORMATO: Record<'story' | 'feed' | 'quadrado', string> = {
  story: 'story',
  feed: 'feed',
  quadrado: 'quadrado',
}

export function BancadaEscolhaDeModelo({
  projectId,
  formato,
  escolhido,
  onEscolher,
  desabilitado,
}: {
  projectId: number
  formato: 'story' | 'feed' | 'quadrado'
  /** O modelo escolhido (id da página) — `null` = rotação automática. */
  escolhido: string | null
  onEscolher: (pageId: string | null) => void
  desabilitado?: boolean
}) {
  const [aberto, setAberto] = React.useState(false)
  // A consulta só roda quando é preciso: a grade aberta, ou um modelo já
  // escolhido cujo NOME a linha resumida precisa mostrar. É uma query por
  // projeto (cacheada), não por card.
  const { data: modelos, isLoading } = useModelosDoProjeto(projectId, {
    enabled: aberto || !!escolhido,
  })

  const doFormato = React.useMemo(
    () => (modelos ?? []).filter((m) => m.tipo === TIPO_POR_FORMATO[formato]),
    [modelos, formato],
  )
  const modeloEscolhido = escolhido ? (modelos ?? []).find((m) => m.id === escolhido) : undefined

  return (
    <div className="w-full">
      <button
        type="button"
        onClick={() => setAberto((v) => !v)}
        className="flex items-center gap-1.5 text-xs text-muted-foreground transition-colors hover:text-foreground"
      >
        <ChevronDown className={cn('h-3.5 w-3.5 transition-transform', aberto && 'rotate-180')} />
        <span>
          Modelo a seguir:{' '}
          <span className="font-medium text-foreground">
            {escolhido
              ? (modeloEscolhido?.name ?? 'modelo escolhido')
              : 'rotação automática'}
          </span>
        </span>
      </button>

      {aberto && (
        <div className="mt-2 space-y-2 rounded-lg border border-border/60 bg-muted/20 p-2">
          <p className="text-[11px] text-muted-foreground">
            Sem escolha, a rotação usa o modelo menos usado do formato{' '}
            {ROTULO_DO_FORMATO[formato]} — a grade abaixo está nessa ordem.
          </p>
          <div className="flex flex-wrap gap-2">
            <OpcaoRotacao
              selecionada={!escolhido}
              onClick={() => onEscolher(null)}
              desabilitado={desabilitado}
            />
            {isLoading && (
              <p className="self-center text-xs text-muted-foreground">Carregando os modelos…</p>
            )}
            {doFormato.map((m) => (
              <OpcaoModelo
                key={m.id}
                modelo={m}
                selecionada={escolhido === m.id}
                onClick={() => onEscolher(m.id)}
                desabilitado={desabilitado}
              />
            ))}
          </div>
          {!isLoading && doFormato.length === 0 && (
            <p className="text-[11px] text-amber-600 dark:text-amber-500">
              Este cliente não tem modelo cadastrado no formato {ROTULO_DO_FORMATO[formato]} — a
              arte só pode sair por IA.
            </p>
          )}
        </div>
      )}
    </div>
  )
}

function OpcaoRotacao({
  selecionada,
  onClick,
  desabilitado,
}: {
  selecionada: boolean
  onClick: () => void
  desabilitado?: boolean
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={desabilitado}
      title="Deixar a rotação escolher: o modelo menos usado do formato, variando a cada arte."
      className={cn(
        'flex h-28 w-20 flex-col items-center justify-center gap-1.5 rounded-md border border-dashed px-1 text-center transition-colors',
        selecionada
          ? 'border-primary bg-primary/10 text-foreground'
          : 'border-border/60 text-muted-foreground hover:border-primary/50',
        desabilitado && 'cursor-not-allowed opacity-50',
      )}
    >
      <RefreshCw className="h-4 w-4" />
      <span className="text-[10px] leading-tight">
        Rotação
        <br />
        automática
      </span>
    </button>
  )
}

function OpcaoModelo({
  modelo,
  selecionada,
  onClick,
  desabilitado,
}: {
  modelo: ModeloDoProjeto
  selecionada: boolean
  onClick: () => void
  desabilitado?: boolean
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={desabilitado}
      title={`${modelo.name} — ${modelo.templateName}`}
      className={cn(
        'w-20 overflow-hidden rounded-md border text-left transition-colors',
        selecionada
          ? 'border-primary ring-2 ring-primary/50'
          : 'border-border/60 hover:border-primary/50',
        desabilitado && 'cursor-not-allowed opacity-50',
      )}
    >
      {/* A miniatura na PROPORÇÃO real da página, inteira (`object-contain`):
          é uma escolha de layout — cortada, dois modelos parecidos ficam
          indistinguíveis. Proporção via estilo inline: classe arbitrária de
          Tailwind com valor dinâmico não gera CSS neste repo. */}
      <span
        className="relative block w-full bg-muted/60"
        style={{ aspectRatio: `${modelo.width} / ${modelo.height}` }}
      >
        {modelo.thumbnail ? (
          <Image
            src={modelo.thumbnail}
            alt={modelo.name}
            fill
            sizes="80px"
            className="object-contain"
            unoptimized
          />
        ) : (
          <span className="absolute inset-0 flex items-center justify-center text-muted-foreground">
            <Wand2 className="h-4 w-4" />
          </span>
        )}
      </span>
      <span className="block truncate px-1 py-0.5 text-[10px] leading-tight" title={modelo.name}>
        {modelo.name}
      </span>
    </button>
  )
}
