'use client'

import * as React from 'react'
import { MoreHorizontal } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import type { LinhasDaMarca } from '@/lib/canvas-margin'
import { cairForaDaPagina, gerarGuias, marcasDaRegua, MAX_COLUNAS, type Guia } from '@/lib/guias-manuais'
import type { GuiasApi } from '@/hooks/use-guias-da-pagina'
import type { RectInfo } from '@/lib/konva-smart-guides'

/** A espessura das réguas, em px de tela. */
export const REGUA = 20
const COR_DA_GUIA = '#8B5CF6'

interface Props {
  largura: number
  altura: number
  zoom: number
  /** Onde a página começa, em px de tela, relativo ao pai `relative` que envolve o stage. */
  origem: { left: number; top: number }
  marca: LinhasDaMarca
  /** A caixa da seleção (px do design) — a faixa que ela ocupa fica sombreada nas réguas. */
  selecao: RectInfo | null
  api: GuiasApi
}

type Arrasto = { id: string | null; orientacao: Guia['orientacao']; posicao: number; tela: { x: number; y: number }; pointerId: number }

/**
 * Réguas em px do design e guias manuais (L4 das linhas-guia, 29/10/2026), em HTML por cima do stage — fora da
 * `guides-layer` e de qualquer export. A guia nasce arrastada da régua (a de cima faz guia horizontal, a da esquerda
 * faz vertical), mostra a posição num selo e some se for solta de volta fora da página. Travadas não arrastam.
 */
export function ReguasEGuias({ largura, altura, zoom, origem, marca, selecao, api }: Props) {
  const raiz = React.useRef<HTMLDivElement | null>(null)
  const [arrasto, setArrasto] = React.useState<Arrasto | null>(null)
  const [dialogo, setDialogo] = React.useState(false)
  const { estado } = api
  const W = largura * zoom
  const H = altura * zoom

  /** px de tela (clientX/clientY) → px do design, relativo ao canto da página. */
  const noDesign = React.useCallback(
    (clientX: number, clientY: number) => {
      const r = raiz.current?.getBoundingClientRect()
      if (!r) return { x: NaN, y: NaN }
      return { x: (clientX - r.left - origem.left) / zoom, y: (clientY - r.top - origem.top) / zoom }
    },
    [origem.left, origem.top, zoom],
  )

  const comecar = React.useCallback(
    (e: React.PointerEvent, orientacao: Guia['orientacao'], id: string | null) => {
      if (e.button !== 0) return
      if (id && estado.travadas) return
      e.preventDefault()
      e.stopPropagation()
      const p = noDesign(e.clientX, e.clientY)
      setArrasto({ id, orientacao, posicao: orientacao === 'vertical' ? p.x : p.y, tela: { x: e.clientX, y: e.clientY }, pointerId: e.pointerId })
    },
    [estado.travadas, noDesign],
  )

  React.useEffect(() => {
    if (!arrasto) return
    const mover = (e: PointerEvent) => {
      if (e.pointerId !== arrasto.pointerId) return
      const p = noDesign(e.clientX, e.clientY)
      setArrasto((a) => (a ? { ...a, posicao: a.orientacao === 'vertical' ? p.x : p.y, tela: { x: e.clientX, y: e.clientY } } : a))
    }
    // O navegador pode cancelar o ponteiro (pointercancel) ou a janela perder o foco sem entregar o pointerup: o
    // gesto termina sem gravar nada (Codex R1 do L4)
    const cancelar = () => setArrasto(null)
    const soltar = (e: PointerEvent) => {
      if (e.pointerId !== arrasto.pointerId) return
      const p = noDesign(e.clientX, e.clientY)
      const posicao = arrasto.orientacao === 'vertical' ? p.x : p.y
      const comprimento = arrasto.orientacao === 'vertical' ? largura : altura
      if (cairForaDaPagina(posicao, comprimento)) {
        if (arrasto.id) api.remover(arrasto.id)
      } else if (arrasto.id) api.mover(arrasto.id, posicao)
      else api.adicionar(arrasto.orientacao, posicao)
      setArrasto(null)
    }
    window.addEventListener('pointermove', mover)
    window.addEventListener('pointerup', soltar)
    window.addEventListener('pointercancel', cancelar)
    window.addEventListener('blur', cancelar)
    return () => {
      window.removeEventListener('pointermove', mover)
      window.removeEventListener('pointerup', soltar)
      window.removeEventListener('pointercancel', cancelar)
      window.removeEventListener('blur', cancelar)
    }
  }, [arrasto, noDesign, largura, altura, api])

  const guiasVisiveis = estado.ocultas ? [] : estado.guias.filter((g) => g.id !== arrasto?.id)
  const r = raiz.current?.getBoundingClientRect()

  return (
    <div ref={raiz} className="pointer-events-none absolute inset-0 z-30 select-none">
      {/* o canto: menu das guias */}
      <div className="pointer-events-auto absolute flex items-center justify-center border border-border/60 bg-card" style={{ left: origem.left - REGUA, top: origem.top - REGUA, width: REGUA, height: REGUA }}>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button type="button" className="flex h-full w-full items-center justify-center text-muted-foreground hover:text-foreground" title="Guias" aria-label="Menu das guias">
              <MoreHorizontal className="h-3.5 w-3.5" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-56">
            <DropdownMenuItem onSelect={() => setDialogo(true)}>Adicionar guias…</DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={() => api.setOcultas(!estado.ocultas)}>{estado.ocultas ? 'Mostrar guias' : 'Ocultar guias'}</DropdownMenuItem>
            <DropdownMenuItem onSelect={() => api.setTravadas(!estado.travadas)}>{estado.travadas ? 'Destravar guias' : 'Travar guias'}</DropdownMenuItem>
            <DropdownMenuItem disabled={estado.guias.length === 0} onSelect={() => api.limpar()}>
              Limpar guias ({estado.guias.length})
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <Regua orientacao="horizontal" comprimento={largura} zoom={zoom} style={{ left: origem.left, top: origem.top - REGUA, width: W, height: REGUA }} selecao={selecao ? [selecao.x, selecao.x + selecao.width] : null} onPointerDown={(e) => comecar(e, 'horizontal', null)} />
      <Regua orientacao="vertical" comprimento={altura} zoom={zoom} style={{ left: origem.left - REGUA, top: origem.top, width: REGUA, height: H }} selecao={selecao ? [selecao.y, selecao.y + selecao.height] : null} onPointerDown={(e) => comecar(e, 'vertical', null)} />

      {/* as guias: linha de 1 px com área de pegar de 7 px; travadas não pegam */}
      {guiasVisiveis.map((g) =>
        g.orientacao === 'vertical' ? (
          <div
            key={g.id}
            className={estado.travadas ? 'absolute' : 'pointer-events-auto absolute cursor-ew-resize'}
            style={{ left: origem.left + g.posicao * zoom - 3, top: origem.top, width: 7, height: H }}
            onPointerDown={(e) => comecar(e, 'vertical', g.id)}
            title={`${g.posicao} px${estado.travadas ? ' (travada)' : ''}`}
          >
            <div className="h-full w-px" style={{ marginLeft: 3, background: COR_DA_GUIA, opacity: 0.9 }} />
          </div>
        ) : (
          <div
            key={g.id}
            className={estado.travadas ? 'absolute' : 'pointer-events-auto absolute cursor-ns-resize'}
            style={{ left: origem.left, top: origem.top + g.posicao * zoom - 3, width: W, height: 7 }}
            onPointerDown={(e) => comecar(e, 'horizontal', g.id)}
            title={`${g.posicao} px${estado.travadas ? ' (travada)' : ''}`}
          >
            <div className="h-px w-full" style={{ marginTop: 3, background: COR_DA_GUIA, opacity: 0.9 }} />
          </div>
        ),
      )}

      {/* a guia em arrasto e o selo com a posição em px */}
      {arrasto && r && (
        <>
          {arrasto.orientacao === 'vertical' ? (
            <div className="absolute w-px" style={{ left: origem.left + arrasto.posicao * zoom, top: origem.top, height: H, background: COR_DA_GUIA }} />
          ) : (
            <div className="absolute h-px" style={{ left: origem.left, top: origem.top + arrasto.posicao * zoom, width: W, background: COR_DA_GUIA }} />
          )}
          <div className="absolute rounded px-1.5 py-0.5 text-[11px] font-medium text-white shadow" style={{ left: arrasto.tela.x - r.left + 10, top: arrasto.tela.y - r.top + 10, background: COR_DA_GUIA }}>
            {Math.round(arrasto.posicao)} px{cairForaDaPagina(arrasto.posicao, arrasto.orientacao === 'vertical' ? largura : altura) ? (arrasto.id ? ' · solte para apagar' : ' · fora da página') : ''}
          </div>
        </>
      )}

      <DialogoAdicionarGuias aberto={dialogo} aoFechar={() => setDialogo(false)} marca={marca} aoAdicionar={(guias) => api.acrescentar(guias)} />
    </div>
  )
}

function Regua({
  orientacao,
  comprimento,
  zoom,
  style,
  selecao,
  onPointerDown,
}: {
  orientacao: 'horizontal' | 'vertical'
  comprimento: number
  zoom: number
  style: React.CSSProperties
  selecao: [number, number] | null
  onPointerDown: (e: React.PointerEvent) => void
}) {
  const canvas = React.useRef<HTMLCanvasElement | null>(null)
  const w = Number(style.width)
  const h = Number(style.height)
  React.useEffect(() => {
    const c = canvas.current
    if (!c) return
    const dpr = window.devicePixelRatio || 1
    c.width = Math.max(1, Math.round(w * dpr))
    c.height = Math.max(1, Math.round(h * dpr))
    const ctx = c.getContext('2d')
    if (!ctx) return
    ctx.scale(dpr, dpr)
    ctx.clearRect(0, 0, w, h)
    ctx.fillStyle = 'rgba(24,24,27,0.92)'
    ctx.fillRect(0, 0, w, h)
    if (selecao) {
      ctx.fillStyle = 'rgba(139,92,246,0.35)'
      if (orientacao === 'horizontal') ctx.fillRect(selecao[0] * zoom, 0, (selecao[1] - selecao[0]) * zoom, h)
      else ctx.fillRect(0, selecao[0] * zoom, w, (selecao[1] - selecao[0]) * zoom)
    }
    ctx.strokeStyle = 'rgba(255,255,255,0.45)'
    ctx.fillStyle = 'rgba(255,255,255,0.7)'
    ctx.font = '9px Inter, -apple-system, Helvetica, Arial, sans-serif'
    ctx.lineWidth = 1
    for (const m of marcasDaRegua(comprimento, zoom)) {
      const p = Math.round(m.posicao * zoom) + 0.5
      const tam = m.maior ? REGUA : REGUA / 2
      ctx.beginPath()
      if (orientacao === 'horizontal') {
        ctx.moveTo(p, REGUA - tam)
        ctx.lineTo(p, REGUA)
      } else {
        ctx.moveTo(REGUA - tam, p)
        ctx.lineTo(REGUA, p)
      }
      ctx.stroke()
      if (m.maior) {
        if (orientacao === 'horizontal') ctx.fillText(String(m.posicao), p + 2, 9)
        else {
          ctx.save()
          ctx.translate(9, p + 2)
          ctx.rotate(Math.PI / 2)
          ctx.fillText(String(m.posicao), 0, 0)
          ctx.restore()
        }
      }
    }
  }, [orientacao, comprimento, zoom, w, h, selecao])
  return (
    <canvas
      ref={canvas}
      className={`pointer-events-auto absolute ${orientacao === 'horizontal' ? 'cursor-ns-resize' : 'cursor-ew-resize'}`}
      style={style}
      onPointerDown={onPointerDown}
      title={orientacao === 'horizontal' ? 'Arraste para baixo para criar uma guia horizontal' : 'Arraste para a direita para criar uma guia vertical'}
    />
  )
}

function DialogoAdicionarGuias({ aberto, aoFechar, marca, aoAdicionar }: { aberto: boolean; aoFechar: () => void; marca: LinhasDaMarca; aoAdicionar: (guias: Guia[]) => void }) {
  const [colunas, setColunas] = React.useState(3)
  const [linhas, setLinhas] = React.useState(0)
  const [espacamento, setEspacamento] = React.useState(24)
  const previa = React.useMemo(() => gerarGuias({ colunas, linhas, espacamento, marca }), [colunas, linhas, espacamento, marca])
  const num = (v: string, max = MAX_COLUNAS) => Math.min(max, Math.max(0, Math.floor(Number(v) || 0)))
  return (
    <Dialog open={aberto} onOpenChange={(o) => !o && aoFechar()}>
      <DialogContent className="pointer-events-auto sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Adicionar guias</DialogTitle>
          <DialogDescription>Colunas e linhas calculadas dentro da margem da marca (no Story a margem é maior em cima e embaixo). As guias são suas, nesta página.</DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-3 gap-3">
          <div className="space-y-1">
            <Label htmlFor="guias-colunas">Colunas</Label>
            <Input id="guias-colunas" type="number" min={0} max={MAX_COLUNAS} value={colunas} onChange={(e) => setColunas(num(e.target.value))} />
          </div>
          <div className="space-y-1">
            <Label htmlFor="guias-linhas">Linhas</Label>
            <Input id="guias-linhas" type="number" min={0} max={MAX_COLUNAS} value={linhas} onChange={(e) => setLinhas(num(e.target.value))} />
          </div>
          <div className="space-y-1">
            <Label htmlFor="guias-espacamento">Espaçamento</Label>
            <Input id="guias-espacamento" type="number" min={0} max={2000} value={espacamento} onChange={(e) => setEspacamento(num(e.target.value, 2000))} />
          </div>
        </div>
        <p className="text-xs text-muted-foreground">
          {previa.length} guia{previa.length === 1 ? '' : 's'}: {previa.filter((g) => g.orientacao === 'vertical').length} vertical(is) e {previa.filter((g) => g.orientacao === 'horizontal').length} horizontal(is).
        </p>
        <DialogFooter>
          <Button variant="ghost" onClick={aoFechar}>
            Cancelar
          </Button>
          <Button
            disabled={previa.length === 0}
            onClick={() => {
              aoAdicionar(previa)
              aoFechar()
            }}
          >
            Adicionar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
