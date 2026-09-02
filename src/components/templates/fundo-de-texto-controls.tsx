"use client"

import * as React from 'react'
import { Link, Unlink } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'
import { useTemplateEditor } from '@/contexts/template-editor-context'
import { useBrandColors } from '@/hooks/use-brand-colors'
import type { Layer } from '@/types/template'
import {
  ajustarTom,
  BORDA_MAXIMA,
  CANTOS_MAXIMOS,
  controleDoRaio,
  corEscuraDaMarca,
  DESLOCAMENTO_MAXIMO,
  hexValido,
  presetHalo,
  raioDoControle,
  type FundoDeTexto,
} from '@/lib/creatives/halo/fundo-de-texto'
import { BrandColorSwatches } from './brand-color-swatches'

const FUNDO_PADRAO: FundoDeTexto = { enabled: true, backgroundColor: '#ffffff', padding: 10 }

interface FundoDeTextoControlsProps {
  layer: Layer
}

/**
 * Controles do fundo/halo de um texto (`effects.background`). Usado no painel
 * de Efeitos e no painel Gradientes — o MESMO componente, para os controles
 * não divergirem (precedente do GradientEditor).
 *
 * O que cada controle grava está em `fundo-de-texto.ts`; aqui só há duas
 * decisões de UI:
 *  - o desfoque é gravado AO SOLTAR (o raio refaz o cache do blur; o resto,
 *    inclusive a opacidade, é ao vivo);
 *  - o tom é um deslocamento sobre `baseColor`, e a cor final vai em
 *    `backgroundColor` — os motores nunca sabem do slider.
 */
export function FundoDeTextoControls({ layer }: FundoDeTextoControlsProps) {
  const editor = useTemplateEditor()
  const { data: cores = [] } = useBrandColors(editor.projectId ?? null)
  const fundo = layer.effects?.background
  const ligado = fundo?.enabled === true

  const gravar = React.useCallback(
    (patch: Partial<FundoDeTexto>) => {
      editor.updateLayer(layer.id, (l) => ({
        ...l,
        effects: {
          ...l.effects,
          background: { ...FUNDO_PADRAO, ...l.effects?.background, ...patch, enabled: patch.enabled ?? true },
        },
      }))
    },
    [editor, layer.id],
  )

  const aplicarHalo = React.useCallback(() => {
    editor.updateLayer(layer.id, (l) => ({
      ...l,
      effects: { ...l.effects, background: presetHalo(corEscuraDaMarca(cores, editor.design.layers), l.effects?.background) },
    }))
  }, [cores, editor, layer.id])

  const escolherCor = React.useCallback(
    (cor: string) => {
      const hex = hexValido(cor)
      // Cor inválida (digitando) só vai para o campo; a cor final continua a última válida
      if (!hex) return
      gravar({ backgroundColor: hex, baseColor: hex, tone: 0 })
    },
    [gravar],
  )

  const mudarTom = React.useCallback(
    (tone: number) => {
      const base = hexValido(fundo?.baseColor) ?? hexValido(fundo?.backgroundColor) ?? '#111111'
      gravar({ baseColor: base, tone, backgroundColor: ajustarTom(base, tone) })
    },
    [fundo?.baseColor, fundo?.backgroundColor, gravar],
  )

  // Borda por eixo: "iguais" enquanto paddingX/paddingY não existem
  const bordaIgual = typeof fundo?.paddingX !== 'number' && typeof fundo?.paddingY !== 'number'
  const padding = fundo?.padding ?? 10
  const paddingX = fundo?.paddingX ?? padding
  const paddingY = fundo?.paddingY ?? padding

  return (
    <div className="space-y-2 rounded-md border border-border/30 bg-muted/30 p-2">
      <div className="flex items-center justify-between gap-2">
        <Label className="text-[10px] font-semibold uppercase">Fundo / Halo</Label>
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-6 px-2 text-[10px]"
            onClick={aplicarHalo}
            title="Ajuste pela tinta, cor escura da marca, 70%, borda 60, cantos 60, desfoque 110"
          >
            Halo
          </Button>
          <input
            type="checkbox"
            className="h-4 w-4"
            checked={ligado}
            onChange={(e) => gravar({ enabled: e.target.checked })}
            aria-label="Ligar fundo do texto"
          />
        </div>
      </div>

      {ligado && fundo && (
        <div className="space-y-2">
          {/* Ajuste */}
          <div className="space-y-1">
            <Label className="text-[9px]">Ajuste</Label>
            <div className="flex rounded-md border border-border/40 p-0.5">
              {(
                [
                  ['caixa', 'Caixa'],
                  ['texto', 'Texto'],
                ] as const
              ).map(([valor, rotulo]) => {
                const ativo = (fundo.fit ?? 'caixa') === valor
                return (
                  <button
                    key={valor}
                    type="button"
                    onClick={() => gravar({ fit: valor })}
                    className={cn(
                      'flex-1 rounded-[5px] px-2 py-1 text-[10px] font-medium transition',
                      ativo ? 'bg-primary text-primary-foreground shadow-sm' : 'text-muted-foreground hover:bg-muted',
                    )}
                    title={valor === 'texto' ? 'Só atrás das linhas escritas' : 'A caixa inteira da camada'}
                  >
                    {rotulo}
                  </button>
                )
              })}
            </div>
          </div>

          {/* Cor + tom */}
          <div className="space-y-1">
            <Label className="text-[9px]">Cor</Label>
            <div className="flex items-center gap-2">
              <Input
                type="text"
                className="h-7 flex-1 text-xs uppercase"
                value={fundo.backgroundColor}
                onChange={(e) => escolherCor(e.target.value)}
              />
              <input
                type="color"
                className="h-7 w-7 rounded border border-border/30"
                value={hexValido(fundo.backgroundColor) ?? '#000000'}
                onChange={(e) => escolherCor(e.target.value)}
                aria-label="Cor do fundo"
              />
            </div>
            <BrandColorSwatches value={fundo.backgroundColor} onSelect={escolherCor} />
          </div>
          <Faixa
            rotulo="Tom"
            valor={fundo.tone ?? 0}
            min={-40}
            max={40}
            formato={(v) => (v > 0 ? `+${v}` : `${v}`)}
            onChange={mudarTom}
          />

          <Faixa
            rotulo="Opacidade"
            valor={Math.round((fundo.opacity ?? 1) * 100)}
            min={0}
            max={100}
            formato={(v) => `${v}%`}
            onChange={(v) => gravar({ opacity: v / 100 })}
          />

          {/* Borda */}
          <div className="space-y-1">
            <div className="flex items-center justify-between">
              <Label className="text-[9px]">Borda</Label>
              <button
                type="button"
                className="flex h-5 w-5 items-center justify-center rounded text-muted-foreground hover:bg-muted"
                title={bordaIgual ? 'Separar horizontal e vertical' : 'Usar a mesma borda nos dois eixos'}
                aria-label={bordaIgual ? 'Separar horizontal e vertical' : 'Usar a mesma borda nos dois eixos'}
                onClick={() =>
                  bordaIgual
                    ? gravar({ paddingX: padding, paddingY: padding })
                    : gravar({ padding: paddingX, paddingX: undefined, paddingY: undefined })
                }
              >
                {bordaIgual ? <Link className="h-3 w-3" /> : <Unlink className="h-3 w-3" />}
              </button>
            </div>
            {bordaIgual ? (
              <Faixa valor={padding} min={0} max={BORDA_MAXIMA} formato={(v) => `${v}px`} onChange={(v) => gravar({ padding: v })} />
            ) : (
              <>
                <Faixa rotulo="Horizontal" valor={paddingX} min={0} max={BORDA_MAXIMA} formato={(v) => `${v}px`} onChange={(v) => gravar({ paddingX: v })} />
                <Faixa rotulo="Vertical" valor={paddingY} min={0} max={BORDA_MAXIMA} formato={(v) => `${v}px`} onChange={(v) => gravar({ paddingY: v })} />
              </>
            )}
          </div>

          <Faixa
            rotulo="Cantos"
            valor={fundo.borderRadius ?? 0}
            min={0}
            max={CANTOS_MAXIMOS}
            formato={(v) => `${v}px`}
            onChange={(v) => gravar({ borderRadius: v })}
          />

          <FaixaDeDesfoque raio={fundo.blur ?? 0} onCommit={(raio) => gravar({ blur: raio })} />

          <Faixa
            rotulo="Posição X"
            valor={fundo.offsetX ?? 0}
            min={-DESLOCAMENTO_MAXIMO}
            max={DESLOCAMENTO_MAXIMO}
            formato={(v) => `${v}px`}
            onChange={(v) => gravar({ offsetX: v })}
          />
          <Faixa
            rotulo="Posição Y"
            valor={fundo.offsetY ?? 0}
            min={-DESLOCAMENTO_MAXIMO}
            max={DESLOCAMENTO_MAXIMO}
            formato={(v) => `${v}px`}
            onChange={(v) => gravar({ offsetY: v })}
          />
        </div>
      )}
    </div>
  )
}

interface FaixaProps {
  rotulo?: string
  valor: number
  min: number
  max: number
  step?: number
  formato?: (v: number) => string
  onChange: (v: number) => void
}

function Faixa({ rotulo, valor, min, max, step = 1, formato = (v) => String(v), onChange }: FaixaProps) {
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between">
        <Label className="text-[9px]">{rotulo ?? ''}</Label>
        <span className="text-[9px] text-muted-foreground">{formato(valor)}</span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        className="w-full h-1"
        value={valor}
        onChange={(e) => onChange(Number(e.target.value))}
      />
    </div>
  )
}

/**
 * O desfoque grava AO SOLTAR: cada raio novo refaz o cache do blur (um stack
 * blur num buffer de até ~1 MP), então gravar a cada tick travaria o slider.
 * O thumb anda numa escala quadrática (fino embaixo, largo em cima) e mostra
 * o raio em px ao vivo; o valor local segue o raio gravado quando ele muda
 * por fora (undo, outro painel).
 */
function FaixaDeDesfoque({ raio, onCommit }: { raio: number; onCommit: (raio: number) => void }) {
  const [controle, setControle] = React.useState(() => controleDoRaio(raio))
  const arrastandoRef = React.useRef(false)
  React.useEffect(() => {
    if (!arrastandoRef.current) setControle(controleDoRaio(raio))
  }, [raio])

  const commit = () => {
    arrastandoRef.current = false
    const novo = raioDoControle(controle)
    if (novo !== raio) onCommit(novo)
  }

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between">
        <Label className="text-[9px]">Desfoque</Label>
        <span className="text-[9px] text-muted-foreground">
          {raioDoControle(controle) === 0 ? 'nítido' : `${raioDoControle(controle)}px`}
        </span>
      </div>
      <input
        type="range"
        min={0}
        max={100}
        step={1}
        className="w-full h-1"
        value={controle}
        onPointerDown={() => {
          arrastandoRef.current = true
        }}
        onChange={(e) => setControle(Number(e.target.value))}
        onPointerUp={commit}
        onKeyUp={commit}
        onBlur={commit}
      />
    </div>
  )
}
