"use client"

import * as React from 'react'
import type { Layer, LayerStyle } from '@/types/template'
import type { ChaveDeCor } from '@/lib/vetor/tipos'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Blend } from 'lucide-react'
import { fallbackDaChave, rotuloDoCanal } from '@/lib/editor/cores-da-forma'
import { corParaSeletor } from '@/lib/editor/cor-do-seletor'
import { estiloComOpacidadeDaForma, opacidadeDaForma } from '@/lib/shape-style'
import {
  CampoDeCorDigitada,
  EloDoCanal,
  EstadoDaPaletaDaForma,
  FileirasDoCanal,
  GestoDaFormaControls,
  useCoresDaForma,
} from './properties-panel'

/**
 * ShapeToolbar — toolbar contextual da forma (CP-V4), na zona fixa do canvas, desktop e celular:
 *
 * [■ Preenchimento ▾] [□ Contorno ▾] | espelho (svg-path) · proporção | [Opacidade ▾]
 * (multicor, CP-V5: um botão por slot das partes no lugar dos dois canais)
 *
 * Atalho, não segundo editor: a leitura e a escrita de cor são as do painel (`useCoresDaForma`, `CampoDeCorDigitada`,
 * paleta estrita), o gesto é o `GestoDaFormaControls` e a opacidade é a do slider geral do painel (alfa absoluto nos
 * dois canais). Reaplicar e o resto ficam no painel Propriedades. Popovers vão por Portal: a zona de 118 px tem
 * `overflow-hidden` e cortaria um menu em linha.
 */

interface ShapeToolbarProps {
  selectedLayer: Layer
  setStyleValue: (layer: Layer, style: Partial<LayerStyle>) => void
}

const BOTAO = 'h-9 gap-1.5 px-2 md:h-8'

export function ShapeToolbar({ selectedLayer: layer, setStyleValue }: ShapeToolbarProps) {
  const cores = useCoresDaForma(layer, setStyleValue)
  const opacidade = Math.round(opacidadeDaForma(layer.style) * 100)

  const canal = (c: ChaveDeCor) => {
    const valor = cores.valorDo(c)
    const alfa = cores.alfaEmPorcento(c)
    const rotulo = rotuloDoCanal(layer, c)
    const contorno = cores.alvoDo(c) === 'stroke'
    const fallback = fallbackDaChave(c)
    return (
      <Popover key={c}>
        <PopoverTrigger asChild>
          <Button size="sm" variant="ghost" className={BOTAO} title={rotulo} aria-label={rotulo} data-canal-da-barra={c}>
            <span
              aria-hidden="true"
              className={`h-4 w-4 shrink-0 rounded border border-border ${contorno ? 'ring-2 ring-inset ring-background' : ''}`}
              // xadrez por baixo: a cor com alfa aparece como transparência, não escurecida pelo fundo da barra
              style={{ background: `linear-gradient(${valor ?? 'transparent'}, ${valor ?? 'transparent'}), repeating-conic-gradient(#d4d4d4 0 25%, #fff 0 50%) 0 0 / 8px 8px` }}
            />
            <span className="hidden text-xs sm:inline">{rotulo}</span>
          </Button>
        </PopoverTrigger>
        <PopoverContent
          align="start"
          collisionPadding={8}
          className="max-h-[min(70vh,28rem)] w-[min(18rem,calc(100vw-16px))] space-y-2 overflow-y-auto p-3 text-xs"
          data-popover-canal={c}
        >
          <p className="font-medium">{rotulo}</p>
          <EstadoDaPaletaDaForma consulta={cores.consultaDaPaleta} paleta={cores.paleta} />
          <EloDoCanal layer={layer} canal={c} />
          <FileirasDoCanal paleta={cores.paleta} nestaPagina={cores.nestaPagina} valor={valor} onSelect={(hex) => cores.escolher(c, hex)} />
          <span className="block text-[10px] text-muted-foreground">Personalizada</span>
          <div className="flex items-center gap-2">
            <CampoDeCorDigitada key={`${layer.id}:${c}`} valor={valor ?? fallback} origem={layer} aoGravar={(texto) => cores.digitar(c, texto)} />
            <input
              type="color"
              aria-label={`Escolher ${rotulo.toLowerCase()}`}
              className="h-9 w-9 shrink-0 rounded-md border border-border/30"
              value={corParaSeletor(valor, fallback)}
              onChange={(event) => cores.escolher(c, event.target.value)}
            />
          </div>
          <div className="space-y-1 pt-1">
            <div className="flex items-center justify-between">
              <Label className="text-[10px]">Transparência</Label>
              <span className="text-[10px] text-muted-foreground">{alfa}%</span>
            </div>
            <input
              type="range"
              min={0}
              max={100}
              aria-label={`Transparência: ${rotulo.toLowerCase()}`}
              className="h-6 w-full"
              value={alfa}
              onChange={(event) => cores.transparencia(c, Number(event.target.value) / 100)}
            />
          </div>
          {contorno && (
            <div className="space-y-1 pt-1">
              <Label className="text-[10px]">Espessura</Label>
              <Input
                type="number"
                min={0}
                aria-label="Espessura do contorno"
                value={layer.style?.strokeWidth ?? 0}
                onChange={(event) => setStyleValue(layer, { strokeWidth: Number(event.target.value) })}
              />
            </div>
          )}
        </PopoverContent>
      </Popover>
    )
  }

  return (
    <div className="flex-shrink-0 rounded-lg border border-border/40 bg-card/95 shadow-md backdrop-blur supports-[backdrop-filter]:bg-card/80" data-shape-toolbar="">
      {/* No celular o globals.css força 44 px em todo botão: sem padding vertical a barra cabe na zona de 118 px */}
      <div className="flex items-center gap-2 overflow-x-auto px-2 py-0 md:py-1 scrollbar-thin scrollbar-thumb-border scrollbar-track-transparent">
        <div className="flex flex-shrink-0 items-center gap-1 border-r border-border/40 pr-2">
          {cores.chaves.map(canal)}
        </div>
        <div className="flex flex-shrink-0 items-center border-r border-border/40 pr-2 empty:hidden">
          <GestoDaFormaControls layer={layer} setStyleValue={setStyleValue} variante="barra" />
        </div>
        <Popover>
          <PopoverTrigger asChild>
            <Button size="sm" variant="ghost" className={`${BOTAO} flex-shrink-0`} title="Opacidade" aria-label={`Opacidade ${opacidade}%`}>
              <Blend className="h-4 w-4" />
              <span className="text-xs tabular-nums">{opacidade}%</span>
            </Button>
          </PopoverTrigger>
          <PopoverContent align="end" collisionPadding={8} className="w-[min(16rem,calc(100vw-16px))] space-y-1 p-3 text-xs" data-popover-opacidade="">
            <div className="flex items-center justify-between">
              <Label className="text-[10px]">Opacidade</Label>
              <span className="text-[10px] text-muted-foreground">{opacidade}%</span>
            </div>
            <input
              type="range"
              min={10}
              max={100}
              aria-label="Opacidade da forma"
              className="h-6 w-full"
              value={opacidade}
              onChange={(event) => setStyleValue(layer, estiloComOpacidadeDaForma(layer.style, Number(event.target.value) / 100))}
            />
          </PopoverContent>
        </Popover>
      </div>
    </div>
  )
}
