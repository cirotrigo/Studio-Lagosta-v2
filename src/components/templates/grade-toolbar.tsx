"use client"

import * as React from 'react'
import { LayoutGrid, Unlink } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Slider } from '@/components/ui/slider'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { useTemplateEditor } from '@/contexts/template-editor-context'
import { avisarDesfecho, useAjustarGrade } from '@/hooks/use-ajustar-grade'
import { CATALOGO_DE_GRADES } from '@/lib/grades/catalogo'
import { metadadoDeGrade } from '@/lib/grades/conferir'
import { ESPACAMENTO_MAX, celulasDaGrade } from '@/lib/grades/geometria'
import { membrosDaGrade } from '@/lib/grades/preenchimento'

/** Teto do slider de cantos: acima da metade do menor lado a célula já é cápsula (o raio efetivo é limitado por célula) */
const RAIO_MAX = 200

/**
 * Slider que grava UMA vez por gesto: arrastando, só o número da barra muda; ao soltar, um ajuste (um desfazer).
 * Dois gestos são dois ajustes — nada de chave de coalescência que valha para sempre.
 */
function SliderDaGrade({ rotulo, valor, max, aoSoltar, desabilitado }: { rotulo: string; valor: number; max: number; aoSoltar: (v: number) => Promise<unknown>; desabilitado: boolean }) {
  const [local, setLocal] = React.useState<number | null>(null)
  return (
    <div className="flex flex-shrink-0 items-center gap-2">
      <Label className="whitespace-nowrap text-xs text-muted-foreground">{rotulo}</Label>
      <Slider
        aria-label={rotulo}
        value={[local ?? valor]}
        min={0}
        max={max}
        step={1}
        className="w-24"
        disabled={desabilitado}
        onValueChange={([v]) => setLocal(v)}
        onValueCommit={([v]) => {
          if (v === valor) return setLocal(null)
          setLocal(v)
          void aoSoltar(v).finally(() => setLocal(null))
        }}
      />
      <span className="w-8 text-xs text-muted-foreground">{Math.round(local ?? valor)}</span>
    </div>
  )
}

type Campo = 'x' | 'y' | 'w' | 'h'
const ROTULO: Record<Campo, string> = { x: 'Posição X da grade', y: 'Posição Y da grade', w: 'Largura da grade', h: 'Altura da grade' }
const CURTO: Record<Campo, string> = { x: 'X', y: 'Y', w: 'L', h: 'A' }
const LONGO: Record<Campo, string> = { x: 'Posição X', y: 'Posição Y', w: 'Largura', h: 'Altura' }

/**
 * Posição e tamanho da CAIXA da grade (barra e painel Propriedades), confirmados ao sair do campo ou com Enter:
 * X/Y movem a grade inteira (translação, um desfazer); L/A refazem a grade pela caixa nova (medida + `refazerGrade`).
 */
export function CamposDaCaixa({ gradeId, campos, variante = 'barra' }: { gradeId: string; campos: Campo[]; variante?: 'barra' | 'painel' }) {
  const { design, moverSelecao } = useTemplateEditor()
  const { ajustar, emVoo } = useAjustarGrade()
  const membros = membrosDaGrade(design.layers, gradeId)
  const caixa = membros[0] ? metadadoDeGrade(membros[0])?.caixa : undefined
  if (!caixa) return null
  const gravar = (campo: Campo, texto: string) => {
    const n = Number(texto)
    if (texto.trim() === '' || !Number.isFinite(n) || Math.round(n) === Math.round(caixa[campo])) return
    if (campo === 'x' || campo === 'y') {
      void moverSelecao(
        membros.map((c) => c.id),
        campo === 'x' ? n - caixa.x : 0,
        campo === 'y' ? n - caixa.y : 0,
      ).then(avisarDesfecho)
    } else {
      void ajustar(gradeId, { caixa: { ...caixa, [campo]: n } })
    }
  }
  return (
    <>
      {campos.map((campo) => (
        <div key={campo} className={variante === 'barra' ? 'flex flex-shrink-0 items-center gap-1' : 'space-y-1'}>
          <Label className={variante === 'barra' ? 'text-xs text-muted-foreground' : 'text-[10px]'}>{variante === 'barra' ? CURTO[campo] : LONGO[campo]}</Label>
          <Input
            key={`${campo}:${caixa[campo]}`}
            aria-label={ROTULO[campo]}
            type="number"
            className={variante === 'barra' ? 'h-7 w-16 text-xs' : 'h-8 text-xs'}
            defaultValue={Math.round(caixa[campo])}
            disabled={emVoo}
            onBlur={(e) => gravar(campo, e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') e.currentTarget.blur()
            }}
          />
        </div>
      ))}
    </>
  )
}

/**
 * Barra contextual da GRADE inteira selecionada (G3): espaçamento 0–100 px, cantos, trocar layout (14), tamanho da
 * caixa e desvincular. Cada operação é um `applyDesign` (um desfazer) pelo `refazerGrade` do G0, com as fotos medidas
 * pela URL exata; recusa explica e não muda nada. Fica no lugar da barra de alinhamento (que não vale para grade).
 */
export function GradeToolbar({ gradeId }: { gradeId: string }) {
  const { design, desvincularGrade } = useTemplateEditor()
  const { ajustar, emVoo } = useAjustarGrade()
  const membros = membrosDaGrade(design.layers, gradeId)
  const meta = membros[0] ? metadadoDeGrade(membros[0]) : undefined
  if (!meta) return null
  const { w, h } = meta.caixa

  return (
    <div data-barra="grade" className="flex-shrink-0 rounded-lg border border-border/40 bg-card/95 shadow-md backdrop-blur supports-[backdrop-filter]:bg-card/80">
      <div className="flex items-center gap-3 overflow-x-auto px-3 py-1.5 scrollbar-thin scrollbar-thumb-border scrollbar-track-transparent">
        <SliderDaGrade rotulo="Espaçamento" valor={meta.espacamento} max={ESPACAMENTO_MAX} desabilitado={emVoo} aoSoltar={(v) => ajustar(gradeId, { espacamento: v })} />
        <SliderDaGrade rotulo="Cantos" valor={meta.raio} max={RAIO_MAX} desabilitado={emVoo} aoSoltar={(v) => ajustar(gradeId, { raio: v })} />

        <Popover>
          <PopoverTrigger asChild>
            <Button size="sm" variant="ghost" className="h-8 flex-shrink-0 gap-1.5 px-2" title="Trocar layout (as fotos seguem em ordem de leitura)" disabled={emVoo}>
              <LayoutGrid className="h-4 w-4" />
              <span className="text-xs">Layout</span>
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-72" align="start">
            <p className="mb-2 text-xs font-medium text-muted-foreground">Trocar layout: as fotos seguem em ordem de leitura; as que sobrarem ficam soltas</p>
            <div className="grid grid-cols-4 gap-1.5">
              {CATALOGO_DE_GRADES.map((layout) => {
                const geo = celulasDaGrade(layout, { x: 0, y: 0, w, h }, meta.espacamento)
                const atual = layout.id === meta.layout
                return (
                  <button
                    key={layout.id}
                    type="button"
                    aria-label={`Layout ${layout.nome}`}
                    aria-pressed={atual}
                    title={layout.nome}
                    disabled={emVoo}
                    onClick={() => void ajustar(gradeId, { layout: layout.id })}
                    className={`flex items-center justify-center rounded border p-1 transition hover:border-primary disabled:opacity-50 ${atual ? 'border-primary bg-primary/10' : 'border-border/40'}`}
                  >
                    <svg viewBox={`0 0 ${w} ${h}`} className="h-10 max-w-full" aria-hidden="true">
                      {geo.ok &&
                        geo.valor.celulas.map((c, i) => (
                          <rect key={i} x={c.x} y={c.y} width={c.w} height={c.h} className="fill-muted-foreground/60 stroke-background" strokeWidth={1.5} vectorEffect="non-scaling-stroke" />
                        ))}
                    </svg>
                  </button>
                )
              })}
            </div>
          </PopoverContent>
        </Popover>

        <CamposDaCaixa gradeId={gradeId} campos={['w', 'h']} />

        <Button
          size="sm"
          variant="ghost"
          className="h-8 flex-shrink-0 gap-1.5 px-2"
          aria-label="Desvincular da grade"
          title="Desvincular: as fotos ficam soltas, com recorte e cantos"
          disabled={emVoo}
          onClick={() => void desvincularGrade(gradeId).then(avisarDesfecho)}
        >
          <Unlink className="h-4 w-4" />
          <span className="text-xs">Desvincular</span>
        </Button>

        {emVoo && <span className="flex-shrink-0 text-xs text-muted-foreground">Aplicando…</span>}
      </div>
    </div>
  )
}
