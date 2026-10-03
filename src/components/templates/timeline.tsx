'use client'

import * as React from 'react'
import { Plus, X } from 'lucide-react'
import { DndContext, PointerSensor, closestCenter, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core'
import { SortableContext, arrayMove, horizontalListSortingStrategy, useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { Button } from '@/components/ui/button'
import { useTemplateEditor } from '@/contexts/template-editor-context'
import { useMultiPageOpcional } from '@/contexts/multi-page-context'
import { BotaoPlayPause } from './botao-play-pause'
import { IconeDoMovimento } from './movimento-da-foto'
import { TransicaoDaJuncao } from './transicao-da-juncao'
import { DURACAO_MAX_DO_CLIPE, DURACAO_MIN_DO_CLIPE, fatiaDaMusica, paginaEVideo } from '@/lib/video/camadas-de-video'
import { linhaDoTempo, normalizarClipes, type Clipe } from '@/lib/video/linha-do-tempo'
import { useRelogioDaPagina } from '@/lib/video/relogio-da-pagina'
import { duracoesDosVideosMontados } from '@/lib/video/videos-montados'
import { armarInsercaoDeClipe, desarmarInsercaoDeClipe } from '@/lib/video/insercao-de-clipe'
import type { Layer } from '@/types/template'

const PASSO = 0.1
const fmt = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`
const arredondar = (v: number) => Math.round(v / PASSO) * PASSO
const prender = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v))

/**
 * A linha do tempo sob o canvas (Fase 3); página estática ganha só o "Montar
 * sequência". Play/pause,
 * tempo, régua clicável, clipes em proporção (bordas arrastáveis, reordenar,
 * tirar), a transição de cada junção e a barra da música. Tudo desabilitado durante a gravação. No celular
 * fica só play/pause e a duração.
 */
export function Timeline({ onAdicionar, painelAberto }: { onAdicionar: () => void; painelAberto: boolean }) {
  const { design, updateLayer, reorderLayers, setPageAudio, selectLayer } = useTemplateEditor()
  const { relogio, estado } = useRelogioDaPagina(useMultiPageOpcional()?.currentPageId)
  const ehVideo = paginaEVideo(design.layers, design.audio)
  const linha = React.useMemo(
    () => linhaDoTempo(design.layers, design.audio, duracoesDosVideosMontados()),
    [design.layers, design.audio],
  )
  const duracao = linha.duracao ?? 0
  const gravando = estado.modo === 'gravacao'
  const tempoRef = React.useRef<HTMLSpanElement>(null)
  const cursorRef = React.useRef<HTMLDivElement>(null)

  // O "+" arma a aba Imagens/Vídeos; fechá-la sem inserir desarma
  React.useEffect(() => {
    if (!painelAberto) desarmarInsercaoDeClipe()
  }, [painelAberto])

  // O tempo corre por rAF direto no DOM: nenhum re-render por quadro
  React.useEffect(() => {
    if (!ehVideo && linha.clipes.length === 0) return
    let quadro = 0
    const tique = () => {
      quadro = requestAnimationFrame(tique)
      const t = relogio.agora()
      if (tempoRef.current) tempoRef.current.textContent = `${fmt(t)} / ${fmt(duracao)}`
      if (cursorRef.current) cursorRef.current.style.left = `${duracao > 0 ? Math.min(100, (t / duracao) * 100) : 0}%`
    }
    quadro = requestAnimationFrame(tique)
    return () => cancelAnimationFrame(quadro)
  }, [relogio, duracao, ehVideo, linha.clipes.length])

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }))
  const montar = () => {
    armarInsercaoDeClipe()
    onAdicionar()
  }
  // Página estática (fotos, sem vídeo nem música) também monta sequência: o
  // "+" é a porta de entrada, e o primeiro clipe pode ser a própria foto de fundo
  if (!ehVideo && linha.clipes.length === 0) {
    return (
      <div className="hidden items-center border-t border-border/40 bg-card/80 px-3 py-1.5 backdrop-blur-sm md:flex">
        <Button size="sm" variant="ghost" className="h-7 w-fit gap-1 px-2 text-xs" onClick={montar}>
          <Plus className="h-3.5 w-3.5" /> Montar sequência de fotos e vídeos
        </Button>
      </div>
    )
  }

  const ir = (e: React.PointerEvent<HTMLDivElement>) => {
    if (gravando || duracao <= 0) return
    const r = e.currentTarget.getBoundingClientRect()
    relogio.ir(((e.clientX - r.left) / r.width) * duracao)
  }

  const aoReordenar = (ev: DragEndEvent) => {
    const { active, over } = ev
    if (gravando || !over || active.id === over.id) return
    const ids = linha.clipes.map((c) => c.id)
    const novos = arrayMove(ids, ids.indexOf(String(active.id)), ids.indexOf(String(over.id)))
    reorderLayers(normalizarClipes(design.layers, novos).map((l) => l.id))
  }

  const tirar = (id: string) =>
    updateLayer(id, (l) => {
      const { clipe: _c, ...resto } = l
      return resto as Layer
    })

  // Escala: a faixa inteira é o total dos clipes (ou a música, sem clipes)
  const total = Math.max(linha.total ?? duracao, duracao, 0.001)
  const fatia = fatiaDaMusica(design.audio)

  return (
    <div className="flex items-center gap-3 border-t border-border/40 bg-card/80 px-3 py-2 backdrop-blur-sm">
      <BotaoPlayPause compacto />
      <span ref={tempoRef} className="w-24 shrink-0 font-mono text-xs tabular-nums text-muted-foreground">
        {`${fmt(0)} / ${fmt(duracao)}`}
      </span>

      <div className={`hidden min-w-0 flex-1 flex-col gap-1 md:flex ${gravando ? 'pointer-events-none opacity-50' : ''}`}>
        {/* Régua + cursor */}
        <div className="relative h-3 cursor-pointer rounded bg-muted/60" onPointerDown={ir} title="Ir para o instante">
          <div ref={cursorRef} className="pointer-events-none absolute top-0 h-full w-px bg-primary" style={{ left: 0 }} />
          {duracao < total && (
            <div
              className="absolute right-0 top-0 h-full rounded-r opacity-60"
              style={{
                width: `${((total - duracao) / total) * 100}%`,
                backgroundImage: 'repeating-linear-gradient(135deg, transparent 0 4px, currentColor 4px 6px)',
              }}
              title="Fora do vídeo (cortado pela música)"
            />
          )}
        </div>

        {/* Clipes */}
        {linha.clipes.length > 0 && (
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={aoReordenar}>
            <SortableContext items={linha.clipes.map((c) => c.id)} strategy={horizontalListSortingStrategy}>
              <div className="flex h-12 w-full gap-0.5">
                {linha.clipes.map((c, i) => (
                  <React.Fragment key={c.id}>
                    {i > 0 && (
                      // A junção: o botão da transição, por cima das duas pontas
                      // (-mx-px desconta o gap que este item a mais criaria)
                      <div className="relative -mx-px w-0 shrink-0">
                        <TransicaoDaJuncao clipes={linha.clipes} indice={i} desabilitado={gravando} />
                      </div>
                    )}
                    <ClipeNaFaixa
                      clipe={c}
                      camada={design.layers.find((l) => l.id === c.id)}
                      fracao={c.duracao / total}
                      desabilitado={gravando}
                      onTirar={() => tirar(c.id)}
                      onSelecionar={() => selectLayer(c.id)}
                      onAjustar={(patch, gesto) =>
                        // Uma entrada de desfazer por arraste, delimitada pelo GESTO
                        // (não por tempo). Desfazer no meio reabre uma entrada nova.
                        updateLayer(c.id, (l) => ({ ...l, ...patch }), { coalesceKey: gesto, gesto: true })
                      }
                      onMostrar={(t) => relogio.ir(t)}
                    />
                  </React.Fragment>
                ))}
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-12 w-8 shrink-0 p-0"
                  title="Adicionar foto ou vídeo à linha do tempo"
                  aria-label="Adicionar clipe"
                  disabled={gravando}
                  onClick={montar}
                >
                  <Plus className="h-4 w-4" />
                </Button>
              </div>
            </SortableContext>
          </DndContext>
        )}
        {linha.clipes.length === 0 && (
          <Button
            size="sm"
            variant="ghost"
            className="h-7 w-fit gap-1 px-2 text-xs"
            disabled={gravando}
            onClick={montar}
          >
            <Plus className="h-3.5 w-3.5" /> Montar sequência de fotos e vídeos
          </Button>
        )}

        {/* Música */}
        {fatia !== null && design.audio && (
          <BarraDaMusica
            fracao={Math.min(1, fatia / total)}
            inicio={design.audio.startTime ?? 0}
            fim={design.audio.endTime ?? fatia}
            nome={design.audio.musicName ?? 'Música'}
            onCommit={(startTime, endTime) => setPageAudio({ ...design.audio!, startTime, endTime })}
          />
        )}
        {linha.avisos.map((a) => (
          <p key={a} className="text-[11px] text-amber-600">
            {a}
          </p>
        ))}
      </div>
    </div>
  )
}

function ClipeNaFaixa({
  clipe,
  camada,
  fracao,
  desabilitado,
  onTirar,
  onSelecionar,
  onAjustar,
  onMostrar,
}: {
  clipe: Clipe
  camada: Layer | undefined
  fracao: number
  desabilitado: boolean
  onTirar: () => void
  /** Clique no bloco: seleciona a camada (a barra da foto mostra o Movimento). */
  onSelecionar: () => void
  /** `gesto`: chave única do arraste — todas as escritas dele são UMA entrada de desfazer. */
  onAjustar: (patch: Partial<Layer>, gesto: string) => void
  /** Leva o relógio da página ao instante `t` (o quadro da borda arrastada). */
  onMostrar: (t: number) => void
}) {
  const { attributes, listeners, setNodeRef, transform, transition } = useSortable({ id: clipe.id, disabled: desabilitado })
  const ref = React.useRef<HTMLDivElement>(null)
  // Rascunho durante o arraste da borda; commit (uma entrada de histórico) no release
  const [rascunho, setRascunho] = React.useState<number | null>(null)

  const arrastarBorda = (lado: 'esq' | 'dir') => (e: React.PointerEvent) => {
    if (desabilitado || !camada) return
    e.stopPropagation()
    e.preventDefault()
    const largura = ref.current?.getBoundingClientRect().width ?? 1
    const pxPorSeg = largura / Math.max(clipe.duracao, 0.1)
    const x0 = e.clientX
    const meta = camada.videoMetadata ?? {}
    const duracaoFonte = meta.duration ?? duracoesDosVideosMontados().get(clipe.id) ?? Infinity
    const ts0 = meta.trimStart ?? 0
    const te0 = meta.trimEnd ?? Math.min(duracaoFonte, ts0 + clipe.duracao)
    let ultimo: number | null = null
    const gesto = `clipe-borda:${clipe.id}:${performance.now()}`
    const aplicar = (patch: Partial<Layer>) => onAjustar(patch, gesto)
    const mover = (ev: PointerEvent) => {
      const dx = (ev.clientX - x0) / pxPorSeg
      ultimo = arredondar(
        clipe.tipo === 'foto'
          ? prender(clipe.duracao + dx, DURACAO_MIN_DO_CLIPE, DURACAO_MAX_DO_CLIPE)
          : lado === 'dir'
            ? prender(te0 + dx, ts0 + DURACAO_MIN_DO_CLIPE, duracaoFonte)
            : prender(ts0 + dx, 0, te0 - DURACAO_MIN_DO_CLIPE),
      )
      setRascunho(ultimo)
      // Vídeo: aplica o corte já e mostra o quadro da borda que anda (o início
      // do trecho, ou o último quadro). Foto não tem quadro a mostrar.
      if (clipe.tipo === 'video') {
        if (lado === 'dir') {
          aplicar({ videoMetadata: { ...meta, trimEnd: ultimo } })
          onMostrar(clipe.inicio + Math.max(0, ultimo - ts0 - 0.05))
        } else {
          aplicar({ videoMetadata: { ...meta, trimStart: ultimo } })
          onMostrar(clipe.inicio)
        }
      }
    }
    const soltar = () => {
      window.removeEventListener('pointermove', mover)
      window.removeEventListener('pointerup', soltar)
      setRascunho(null)
      if (ultimo === null) return
      if (clipe.tipo === 'foto') aplicar({ clipe: { ...camada.clipe, duracao: ultimo } })
      else if (lado === 'dir') aplicar({ videoMetadata: { ...meta, trimEnd: ultimo } })
      else aplicar({ videoMetadata: { ...meta, trimStart: ultimo } })
    }
    window.addEventListener('pointermove', mover)
    window.addEventListener('pointerup', soltar)
  }

  const url = camada?.fileUrl ?? ''
  const rotulo = rascunho !== null ? `${rascunho.toFixed(1)}s` : `${clipe.duracao.toFixed(1)}s`

  return (
    <div
      ref={(el) => {
        setNodeRef(el)
        ;(ref as React.MutableRefObject<HTMLDivElement | null>).current = el
      }}
      style={{ width: `${Math.max(fracao * 100, 4)}%`, transform: CSS.Transform.toString(transform), transition }}
      className="group relative h-full min-w-[40px] overflow-hidden rounded border border-border/60 bg-muted"
      title={camada?.name ?? clipe.id}
    >
      <div className="h-full w-full cursor-grab" {...attributes} {...listeners} onClick={onSelecionar}>
        {clipe.tipo === 'foto' ? (
          <img src={url} alt="" className="h-full w-full object-cover" draggable={false} />
        ) : (
          <video src={url} muted playsInline preload="metadata" className="h-full w-full object-cover" />
        )}
      </div>
      <span className="pointer-events-none absolute bottom-0 left-1 text-[10px] font-medium text-white drop-shadow">{rotulo}</span>
      {camada?.type === 'image' && camada.movimento && (
        <span className="pointer-events-none absolute left-0.5 top-0.5 rounded bg-background/80 p-0.5" title="Foto com movimento">
          <IconeDoMovimento movimento={camada.movimento} className="h-3 w-3" />
        </span>
      )}
      {clipe.tipo === 'video' && (
        <div
          className="absolute inset-y-0 left-0 w-1.5 cursor-ew-resize bg-primary/70 opacity-0 group-hover:opacity-100"
          onPointerDown={arrastarBorda('esq')}
          title="Início do trecho"
        />
      )}
      <div
        className="absolute inset-y-0 right-0 w-1.5 cursor-ew-resize bg-primary/70 opacity-0 group-hover:opacity-100"
        onPointerDown={arrastarBorda('dir')}
        title={clipe.tipo === 'foto' ? 'Duração da foto' : 'Fim do trecho'}
      />
      <button
        type="button"
        className="absolute right-0.5 top-0.5 rounded bg-background/80 p-0.5 opacity-0 group-hover:opacity-100"
        title="Tirar da linha do tempo"
        aria-label="Tirar da linha do tempo"
        onPointerDown={(e) => e.stopPropagation()}
        onClick={onTirar}
      >
        <X className="h-3 w-3" />
      </button>
    </div>
  )
}

function BarraDaMusica({
  fracao,
  inicio,
  fim,
  nome,
  onCommit,
}: {
  fracao: number
  inicio: number
  fim: number
  nome: string
  onCommit: (inicio: number, fim: number) => void
}) {
  const ref = React.useRef<HTMLDivElement>(null)
  const [rascunho, setRascunho] = React.useState<{ inicio: number; fim: number } | null>(null)
  const atual = rascunho ?? { inicio, fim }

  const arrastar = (lado: 'esq' | 'dir') => (e: React.PointerEvent) => {
    e.preventDefault()
    const largura = ref.current?.getBoundingClientRect().width ?? 1
    const pxPorSeg = largura / Math.max(fim - inicio, 0.1)
    const x0 = e.clientX
    let ultimo = { inicio, fim }
    const mover = (ev: PointerEvent) => {
      const dx = (ev.clientX - x0) / pxPorSeg
      ultimo =
        lado === 'esq'
          ? { inicio: arredondar(prender(inicio + dx, 0, fim - 1)), fim }
          : { inicio, fim: arredondar(Math.max(inicio + 1, fim + dx)) }
      setRascunho(ultimo)
    }
    const soltar = () => {
      window.removeEventListener('pointermove', mover)
      window.removeEventListener('pointerup', soltar)
      setRascunho(null)
      if (ultimo.inicio !== inicio || ultimo.fim !== fim) onCommit(ultimo.inicio, ultimo.fim)
    }
    window.addEventListener('pointermove', mover)
    window.addEventListener('pointerup', soltar)
  }

  return (
    <div className="relative h-5 w-full">
      <div
        ref={ref}
        className="relative h-full rounded bg-primary/25 px-2 text-[10px] leading-5 text-foreground/80"
        style={{ width: `${fracao * 100}%` }}
        title={`${nome}: ${fmt(atual.inicio)} a ${fmt(atual.fim)} da faixa`}
      >
        <span className="truncate">{nome} · {atual.inicio.toFixed(1)}s–{atual.fim.toFixed(1)}s</span>
        <div className="absolute inset-y-0 left-0 w-1.5 cursor-ew-resize rounded-l bg-primary/80" onPointerDown={arrastar('esq')} title="Início na música" />
        <div className="absolute inset-y-0 right-0 w-1.5 cursor-ew-resize rounded-r bg-primary/80" onPointerDown={arrastar('dir')} title="Fim na música" />
      </div>
    </div>
  )
}
