"use client"

import * as React from 'react'
import { MoveHorizontal, ZoomIn, ZoomOut } from 'lucide-react'
import type { Layer } from '@/types/template'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { useTemplateEditor } from '@/contexts/template-editor-context'
import type { Movimento } from '@/lib/video/movimento'

const OPCOES: ReadonlyArray<{ valor: Movimento | undefined; rotulo: string }> = [
  { valor: undefined, rotulo: 'Parado' },
  { valor: 'aproximar', rotulo: 'Aproximar' },
  { valor: 'afastar', rotulo: 'Afastar' },
  { valor: 'deslizar', rotulo: 'Deslizar' },
]

/** O ícone pequeno do movimento — o mesmo na barra da foto e na linha do tempo. */
export function IconeDoMovimento({ movimento, className }: { movimento: Movimento; className?: string }) {
  const Icone = movimento === 'aproximar' ? ZoomIn : movimento === 'afastar' ? ZoomOut : MoveHorizontal
  return <Icone className={className} />
}

// A prévia de cada opção é a PRÓPRIA foto em CSS: vai, segura e recomeça (indo
// e voltando, aproximar pareceria afastar na volta). Mesmos números do vídeo.
const ANIMACOES = `
@keyframes movimento-aproximar { 0% { transform: scale(1) } 80%, 100% { transform: scale(1.15) } }
@keyframes movimento-afastar { 0% { transform: scale(1.15) } 80%, 100% { transform: scale(1) } }
@keyframes movimento-deslizar { 0% { transform: translateX(-6.5%) scale(1.15) } 80%, 100% { transform: translateX(6.5%) scale(1.15) } }
`

/**
 * "Movimento" da foto numa página-vídeo (Fase 2): Parado, Aproximar, Afastar ou
 * Deslizar, e "Usar em todas as fotos desta página". Mora na barra da foto, que
 * é a mesma no computador e no celular.
 */
export function MovimentoDaFoto({ camada }: { camada: Layer }) {
  const { design, updateLayer } = useTemplateEditor()
  const atual = camada.movimento
  const fotos = design.layers.filter((l) => l.type === 'image')

  const definir = (id: string, valor: Movimento | undefined, opcoes?: { coalesceKey: string; gesto: boolean }) =>
    updateLayer(
      id,
      (l) => {
        const { movimento: _m, ...resto } = l
        return valor ? { ...resto, movimento: valor } : resto
      },
      opcoes,
    )

  const usarEmTodas = () => {
    // Uma entrada de desfazer para a página inteira
    const gesto = { coalesceKey: `movimento-todas:${Date.now()}`, gesto: true }
    fotos.forEach((f) => definir(f.id, atual, gesto))
  }

  const proporcao = Math.max(20, camada.size?.width ?? 1) / Math.max(20, camada.size?.height ?? 1)

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button size="sm" variant={atual ? 'default' : 'ghost'} className="h-8 gap-1.5 px-2" title="Movimento da foto no vídeo">
          {atual ? <IconeDoMovimento movimento={atual} className="h-4 w-4" /> : <MoveHorizontal className="h-4 w-4" />}
          <span className="text-xs">Movimento</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-72" align="start">
        <style>{ANIMACOES}</style>
        <p className="mb-2 text-xs font-medium text-muted-foreground">Como a foto se mexe no vídeo</p>
        <div className="grid grid-cols-2 gap-2">
          {OPCOES.map((op) => {
            const escolhida = op.valor === atual
            return (
              <button
                key={op.rotulo}
                type="button"
                onClick={() => definir(camada.id, op.valor)}
                className={`flex flex-col gap-1 rounded border p-1.5 text-left transition hover:border-primary ${escolhida ? 'border-primary bg-primary/10' : 'border-border/40'}`}
              >
                <div className="w-full overflow-hidden rounded bg-muted" style={{ aspectRatio: String(proporcao) }}>
                  {camada.fileUrl ? (
                    <img
                      src={camada.fileUrl}
                      alt=""
                      draggable={false}
                      className="h-full w-full object-cover"
                      style={op.valor ? { animation: `movimento-${op.valor} 2.4s ease-in-out infinite` } : undefined}
                    />
                  ) : null}
                </div>
                <span className="text-xs">{op.rotulo}</span>
              </button>
            )
          })}
        </div>
        {fotos.length > 1 && (
          <Button size="sm" variant="outline" className="mt-2 h-8 w-full text-xs" onClick={usarEmTodas}>
            Usar em todas as fotos desta página
          </Button>
        )}
      </PopoverContent>
    </Popover>
  )
}
