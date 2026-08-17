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
 *
 * As miniaturas da grade têm 80px: cabem muitas de uma vez, mas dois modelos
 * parecidos ficam indistinguíveis nesse tamanho. Por isso o mouse parado sobre
 * uma delas abre a PRÉVIA AMPLIADA (2,5×) ao lado — ver o layout de perto é o
 * que permite escolher, e a grade continua inteira à vista (17/08/2026).
 */

import * as React from 'react'
import { createPortal } from 'react-dom'
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

/** A proporção (largura/altura) da arte de cada formato. */
const PROPORCAO_DO_FORMATO: Record<'story' | 'feed' | 'quadrado', number> = {
  story: 1080 / 1920,
  feed: 1080 / 1350,
  quadrado: 1,
}

/** Quanto a prévia amplia a miniatura da grade (80px → 200px). */
const FATOR_DE_AMPLIACAO = 2.5

/**
 * O atraso antes de abrir. Sem ele, varrer a grade com o mouse pisca uma
 * prévia por miniatura; fechar é imediato, porque prévia que insiste em ficar
 * é prévia que atrapalha.
 */
const ATRASO_PARA_ABRIR_MS = 120

/** Folga da borda da janela, e a altura reservada para a legenda da prévia. */
const MARGEM_DA_JANELA = 8
const ALTURA_DA_LEGENDA = 38

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

  const podeAmpliar = useSuportaHover()
  const { previa, abrir, fechar } = usePreviaAmpliada()
  // Fechar quando o painel colapsa: a prévia mora no `body` e sobreviveria à
  // grade que a originou.
  React.useEffect(() => {
    if (!aberto) fechar()
  }, [aberto, fechar])

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
                    onPrevia={
                      podeAmpliar && m.thumbnail
                        ? (alvo) =>
                            abrir(alvo, {
                              src: m.thumbnail!,
                              legenda: m.name,
                              nota: `${m.templateName} · ${usoEmPalavras(m.usedCount)}`,
                              proporcao: m.width / m.height,
                            })
                        : undefined
                    }
                    onFecharPrevia={fechar}
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
                    onMouseEnter={
                      podeAmpliar
                        ? (e) =>
                            abrir(e.currentTarget, {
                              src: r.url!,
                              legenda: 'Arte de referência',
                              nota: r.proximaDaFila
                                ? 'a próxima do rodízio'
                                : r.ultimoUso
                                  ? `usada por último em ${r.ultimoUso.slice(0, 10)}`
                                  : 'nunca usada',
                              proporcao: PROPORCAO_DO_FORMATO[formato],
                            })
                        : undefined
                    }
                    onMouseLeave={podeAmpliar ? fechar : undefined}
                    onFocus={
                      podeAmpliar
                        ? (e) =>
                            abrir(e.currentTarget, {
                              src: r.url!,
                              legenda: 'Arte de referência',
                              proporcao: PROPORCAO_DO_FORMATO[formato],
                            })
                        : undefined
                    }
                    onBlur={podeAmpliar ? fechar : undefined}
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

      {previa && <PreviaFlutuante dados={previa.dados} caixa={previa.caixa} />}
    </div>
  )
}

/** O que a prévia ampliada mostra. */
interface DadosDaPrevia {
  src: string
  legenda: string
  nota?: string
  /** largura/altura da ARTE — é o que faz a moldura abraçar o layout. */
  proporcao: number
}

/** Onde a prévia é desenhada, em coordenadas de viewport (`position: fixed`). */
interface CaixaDaPrevia {
  left: number
  top: number
  largura: number
  altura: number
}

/**
 * A prévia vai AO LADO da miniatura, do lado em que couber — sobre ela taparia
 * justamente a peça que a pessoa está comparando. Medida no momento de
 * mostrar, contra a janela.
 */
function medirCaixa(alvo: HTMLElement, proporcao: number): CaixaDaPrevia {
  const r = alvo.getBoundingClientRect()
  const largura = Math.round(r.width * FATOR_DE_AMPLIACAO)
  const altura = Math.round(largura / (proporcao > 0 ? proporcao : r.width / r.height))
  const total = altura + ALTURA_DA_LEGENDA

  const cabeADireita = r.right + MARGEM_DA_JANELA + largura <= window.innerWidth - MARGEM_DA_JANELA
  const left = cabeADireita
    ? r.right + MARGEM_DA_JANELA
    : Math.max(MARGEM_DA_JANELA, r.left - MARGEM_DA_JANELA - largura)

  const centralizada = r.top + r.height / 2 - total / 2
  const tetoInferior = Math.max(MARGEM_DA_JANELA, window.innerHeight - total - MARGEM_DA_JANELA)
  const top = Math.min(Math.max(MARGEM_DA_JANELA, centralizada), tetoInferior)

  return { left, top, largura, altura }
}

/**
 * Só em aparelho com mouse de verdade. Em tela de toque o `mouseenter` dispara
 * no TAP — a prévia abriria junto com a escolha e ficaria pendurada, tapando a
 * grade sem nada para fechá-la.
 */
function useSuportaHover() {
  const [suporta, setSuporta] = React.useState(false)
  React.useEffect(() => {
    const mq = window.matchMedia('(hover: hover) and (pointer: fine)')
    const aplicar = () => setSuporta(mq.matches)
    aplicar()
    mq.addEventListener('change', aplicar)
    return () => mq.removeEventListener('change', aplicar)
  }, [])
  return suporta
}

function usePreviaAmpliada() {
  const [previa, setPrevia] = React.useState<{
    dados: DadosDaPrevia
    caixa: CaixaDaPrevia
  } | null>(null)
  const agendada = React.useRef<ReturnType<typeof setTimeout> | null>(null)

  const cancelar = React.useCallback(() => {
    if (agendada.current) {
      clearTimeout(agendada.current)
      agendada.current = null
    }
  }, [])

  const fechar = React.useCallback(() => {
    cancelar()
    setPrevia(null)
  }, [cancelar])

  const abrir = React.useCallback(
    (alvo: HTMLElement, dados: DadosDaPrevia) => {
      cancelar()
      agendada.current = setTimeout(
        () => setPrevia({ dados, caixa: medirCaixa(alvo, dados.proporcao) }),
        ATRASO_PARA_ABRIR_MS,
      )
    },
    [cancelar],
  )

  React.useEffect(() => {
    if (!previa) return
    // A caixa foi medida contra a janela: rolar ou redimensionar a invalida, e
    // o `mouseleave` não é garantido quando a página se move por baixo do
    // cursor. Fechar é mais honesto que reposicionar uma prévia que a pessoa
    // já deixou para trás.
    const sair = () => setPrevia(null)
    window.addEventListener('scroll', sair, true)
    window.addEventListener('resize', sair)
    return () => {
      window.removeEventListener('scroll', sair, true)
      window.removeEventListener('resize', sair)
    }
  }, [previa])

  React.useEffect(() => cancelar, [cancelar])

  return { previa, abrir, fechar }
}

/**
 * A prévia é IRMÃ do app no `body`, não filha do painel: a regra
 * `[class*="container"]` do `globals.css` e o `overflow-x-hidden` do layout
 * protegido recortariam uma caixa ampliada dentro do fluxo. Posição e z-index
 * em estilo INLINE — valor dinâmico em classe arbitrária não gera CSS aqui.
 *
 * `pointerEvents: 'none'` é o que a mantém inofensiva: mesmo cobrindo as
 * miniaturas vizinhas, o mouse continua chegando nelas.
 */
function PreviaFlutuante({
  dados,
  caixa,
}: {
  dados: DadosDaPrevia
  caixa: CaixaDaPrevia
}) {
  if (typeof document === 'undefined') return null
  return createPortal(
    <div
      aria-hidden
      style={{
        position: 'fixed',
        left: caixa.left,
        top: caixa.top,
        width: caixa.largura,
        zIndex: 60,
        pointerEvents: 'none',
      }}
      className="overflow-hidden rounded-lg border border-primary/50 bg-popover shadow-2xl"
    >
      <span
        className="relative block w-full bg-muted/60"
        style={{ height: caixa.altura }}
      >
        <Image
          src={dados.src}
          alt=""
          fill
          sizes={`${caixa.largura}px`}
          className="object-contain"
          unoptimized
        />
      </span>
      <span className="block px-2 py-1">
        <span className="block truncate text-xs font-medium text-foreground">{dados.legenda}</span>
        {dados.nota && (
          <span className="block truncate text-[10px] text-muted-foreground">{dados.nota}</span>
        )}
      </span>
    </div>,
    document.body,
  )
}

/** Quantas vezes o modelo já foi usado, em palavras. */
function usoEmPalavras(usedCount: number) {
  if (usedCount <= 0) return 'nunca usado'
  return usedCount === 1 ? 'usado 1 vez' : `usado ${usedCount} vezes`
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
  onPrevia,
  onFecharPrevia,
}: {
  modelo: ModeloDoProjeto
  selecionada: boolean
  onClick: () => void
  desabilitado?: boolean
  /** Ausente quando não há como ampliar (sem mouse, ou modelo sem miniatura). */
  onPrevia?: (alvo: HTMLElement) => void
  onFecharPrevia?: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={desabilitado}
      title={`${modelo.name} — ${modelo.templateName}`}
      onMouseEnter={onPrevia ? (e) => onPrevia(e.currentTarget) : undefined}
      onMouseLeave={onFecharPrevia}
      onFocus={onPrevia ? (e) => onPrevia(e.currentTarget) : undefined}
      onBlur={onFecharPrevia}
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
