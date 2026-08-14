'use client'

/**
 * "Base da arte" — o seletor do card da fila que decide COMO a peça nasce.
 *
 * Dois grupos, que são as duas vias do item (13/08/2026):
 *
 *  - **Modelo do editor** (sem custo): a arte é montada sobre uma página
 *    `isTemplate` pelo motor de render do Editor. Sem escolha, a ROTAÇÃO usa o
 *    modelo menos usado do formato.
 *  - **Arte de referência** (IA, 25 créditos): a peça é GERADA seguindo uma
 *    arte estrelada específica. Sem escolha, vale o rodízio que já existe (a
 *    menos usada entra sozinha) — o runner pula o rodízio quando o pedido já
 *    carrega uma referência de papel `style`, então escolher aqui é só mandar
 *    a estrelada junto.
 *
 * COLAPSADO por padrão: a linha resume a escolha atual E o custo dela. Trocar
 * de grupo troca a VIA do item — é o que faz o botão principal do card seguir
 * a escolha.
 */

import * as React from 'react'
import Image from 'next/image'
import { ChevronDown, RefreshCw, Star, Wand2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useModelosDoProjeto, type ModeloDoProjeto } from '@/hooks/use-modelos-do-projeto'
import { useArtesDeReferencia } from '@/hooks/use-artes-de-referencia'
import type { ViaDoItem } from '@/lib/planos/vocabulario'

/** O que o card decide quando alguém mexe no seletor. */
export type BaseDaArte =
  | { via: 'template'; sourcePageId: string | null }
  | { via: 'ia'; referencia: { generationId: string; url: string } | null }

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
  via,
  sourcePageId,
  refGenerationId,
  onEscolher,
  desabilitado,
}: {
  projectId: number
  formato: 'story' | 'feed' | 'quadrado'
  /** O grupo ativo — a via do item. */
  via: ViaDoItem
  /** Escolha do grupo "modelo do editor" (`null` = rotação automática). */
  sourcePageId: string | null
  /** Escolha do grupo "arte de referência" (`null` = rodízio automático). */
  refGenerationId: string | null
  onEscolher: (base: BaseDaArte) => void
  desabilitado?: boolean
}) {
  const [aberto, setAberto] = React.useState(false)
  // As consultas só rodam quando é preciso: a grade aberta, ou uma escolha já
  // feita cujo NOME/estado a linha resumida precisa mostrar. Uma query por
  // projeto (cacheada), não por card.
  const { data: modelos, isLoading: carregandoModelos } = useModelosDoProjeto(projectId, {
    enabled: aberto || (via === 'template' && !!sourcePageId),
  })
  const { data: refs, isLoading: carregandoRefs } = useArtesDeReferencia(projectId, {
    enabled: aberto || via === 'ia',
  })

  const doFormato = React.useMemo(
    () => (modelos ?? []).filter((m) => m.tipo === TIPO_POR_FORMATO[formato]),
    [modelos, formato],
  )
  const referencias = React.useMemo(
    () => (refs?.referencias ?? []).filter((r) => !!r.url),
    [refs],
  )
  const modeloEscolhido = sourcePageId
    ? (modelos ?? []).find((m) => m.id === sourcePageId)
    : undefined

  const resumo =
    via === 'template'
      ? `modelo do editor — ${sourcePageId ? (modeloEscolhido?.name ?? 'modelo escolhido') : 'rotação automática'} · sem custo`
      : `IA com referência — ${refGenerationId ? 'arte escolhida' : 'rodízio automático'} · 25 créditos`

  return (
    <div className="w-full">
      <button
        type="button"
        onClick={() => setAberto((v) => !v)}
        className="flex items-center gap-1.5 text-xs text-muted-foreground transition-colors hover:text-foreground"
      >
        <ChevronDown className={cn('h-3.5 w-3.5 transition-transform', aberto && 'rotate-180')} />
        <span>
          Base da arte: <span className="font-medium text-foreground">{resumo}</span>
        </span>
      </button>

      {aberto && (
        <div className="mt-2 space-y-2 rounded-lg border border-border/60 bg-muted/20 p-2">
          {/* O grupo É a via do item: trocar aqui troca o custo e o botão
              principal do card. */}
          <div className="flex flex-wrap gap-1">
            <button
              type="button"
              onClick={() => onEscolher({ via: 'template', sourcePageId })}
              disabled={desabilitado}
              className={cn(
                'rounded-full border px-3 py-1 text-xs transition-colors',
                via === 'template'
                  ? 'border-primary bg-primary/10 text-foreground'
                  : 'border-border/60 text-muted-foreground hover:border-primary/50',
              )}
            >
              Modelo do editor · sem custo
            </button>
            <button
              type="button"
              onClick={() =>
                onEscolher({
                  via: 'ia',
                  referencia: referenciaEscolhida(referencias, refGenerationId),
                })
              }
              disabled={desabilitado}
              className={cn(
                'rounded-full border px-3 py-1 text-xs transition-colors',
                via === 'ia'
                  ? 'border-primary bg-primary/10 text-foreground'
                  : 'border-border/60 text-muted-foreground hover:border-primary/50',
              )}
            >
              Arte de referência · IA, 25 créditos
            </button>
          </div>

          {via === 'template' && (
            <>
              <p className="text-[11px] text-muted-foreground">
                A arte é montada sobre o modelo, sem gastar crédito de imagem. Sem escolha, a
                rotação usa o menos usado do formato {ROTULO_DO_FORMATO[formato]} — a grade está
                nessa ordem.
              </p>
              <div className="flex flex-wrap gap-2">
                <OpcaoAutomatica
                  rotulo={'Rotação\nautomática'}
                  ajuda="Deixar a rotação escolher: o modelo menos usado do formato, variando a cada arte."
                  selecionada={!sourcePageId}
                  onClick={() => onEscolher({ via: 'template', sourcePageId: null })}
                  desabilitado={desabilitado}
                />
                {carregandoModelos && (
                  <p className="self-center text-xs text-muted-foreground">
                    Carregando os modelos…
                  </p>
                )}
                {doFormato.map((m) => (
                  <OpcaoModelo
                    key={m.id}
                    modelo={m}
                    selecionada={sourcePageId === m.id}
                    onClick={() => onEscolher({ via: 'template', sourcePageId: m.id })}
                    desabilitado={desabilitado}
                  />
                ))}
              </div>
              {!carregandoModelos && doFormato.length === 0 && (
                <p className="text-[11px] text-amber-600 dark:text-amber-500">
                  Este cliente não tem modelo cadastrado no formato{' '}
                  {ROTULO_DO_FORMATO[formato]} — a arte só pode sair por IA.
                </p>
              )}
            </>
          )}

          {via === 'ia' && (
            <>
              <p className="text-[11px] text-muted-foreground">
                A IA gera a peça seguindo a arte escolhida (25 créditos). Sem escolha, o rodízio
                manda a menos usada — a grade está nessa ordem, com a próxima marcada.
              </p>
              <div className="flex flex-wrap gap-2">
                <OpcaoAutomatica
                  rotulo={'Rodízio\nautomático'}
                  ajuda="Deixar o rodízio escolher: a arte de referência menos usada, variando a cada geração."
                  selecionada={!refGenerationId}
                  onClick={() => onEscolher({ via: 'ia', referencia: null })}
                  desabilitado={desabilitado}
                />
                {carregandoRefs && (
                  <p className="self-center text-xs text-muted-foreground">
                    Carregando as referências…
                  </p>
                )}
                {referencias.map((r) => (
                  <button
                    key={r.generationId}
                    type="button"
                    onClick={() =>
                      onEscolher({
                        via: 'ia',
                        referencia: { generationId: r.generationId, url: r.url! },
                      })
                    }
                    disabled={desabilitado}
                    title="Gerar seguindo esta arte de referência"
                    className={cn(
                      'relative h-28 w-20 overflow-hidden rounded-md border bg-muted/60 transition-colors',
                      refGenerationId === r.generationId
                        ? 'border-primary ring-2 ring-primary/50'
                        : 'border-border/60 hover:border-primary/50',
                      desabilitado && 'cursor-not-allowed opacity-50',
                    )}
                  >
                    <Image
                      src={r.url!}
                      alt=""
                      fill
                      sizes="80px"
                      className="object-contain"
                      unoptimized
                    />
                    {r.proximaDaFila && (
                      <span className="absolute left-1 top-1 inline-flex items-center gap-0.5 rounded bg-amber-500/90 px-1 text-[9px] font-medium text-black">
                        <Star className="h-2.5 w-2.5 fill-current" />
                        próxima
                      </span>
                    )}
                  </button>
                ))}
              </div>
              {!carregandoRefs && referencias.length === 0 && (
                <p className="text-[11px] text-muted-foreground">
                  Nenhuma arte marcada como referência ainda — marque com a estrela na aba
                  Criativos. A IA gera mesmo assim, guiada pela identidade da marca.
                </p>
              )}
            </>
          )}
        </div>
      )}
    </div>
  )
}

/** A referência atualmente escolhida, no shape que `onEscolher` espera. */
function referenciaEscolhida(
  referencias: Array<{ generationId: string; url: string | null }>,
  refGenerationId: string | null,
): { generationId: string; url: string } | null {
  if (!refGenerationId) return null
  const r = referencias.find((x) => x.generationId === refGenerationId)
  return r?.url ? { generationId: r.generationId, url: r.url } : null
}

function OpcaoAutomatica({
  rotulo,
  ajuda,
  selecionada,
  onClick,
  desabilitado,
}: {
  rotulo: string
  ajuda: string
  selecionada: boolean
  onClick: () => void
  desabilitado?: boolean
}) {
  const [linha1, linha2] = rotulo.split('\n')
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={desabilitado}
      title={ajuda}
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
        {linha1}
        <br />
        {linha2}
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
