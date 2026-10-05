"use client"

import * as React from 'react'
import { ArrowRightLeft, Blend, Scissors } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { useTemplateEditor } from '@/contexts/template-editor-context'
import type { Clipe, Transicao } from '@/lib/video/linha-do-tempo'

const OPCOES: ReadonlyArray<{ valor: Transicao | undefined; rotulo: string }> = [
  { valor: undefined, rotulo: 'Corte' },
  { valor: 'dissolver', rotulo: 'Dissolver' },
  { valor: 'deslizar', rotulo: 'Deslizar' },
]

function IconeDaTransicao({ transicao, className }: { transicao?: Transicao; className?: string }) {
  const Icone = transicao === 'dissolver' ? Blend : transicao === 'deslizar' ? ArrowRightLeft : Scissors
  return <Icone className={className} />
}

// A prévia de cada opção: duas cores no lugar dos dois clipes (a azul sai, a
// amarela entra). Vai, segura e recomeça, como a do Movimento da foto.
const ANIMACOES = `
@keyframes transicao-corte { 0%, 45% { opacity: 0 } 46%, 100% { opacity: 1 } }
@keyframes transicao-dissolver { 0%, 30% { opacity: 0 } 60%, 100% { opacity: 1 } }
@keyframes transicao-sai { 0%, 30% { transform: translateX(0) } 60%, 100% { transform: translateX(-100%) } }
@keyframes transicao-entra { 0%, 30% { transform: translateX(100%) } 60%, 100% { transform: translateX(0) } }
`

function Previa({ valor }: { valor: Transicao | undefined }) {
  const animar = (nome: string) => ({ animation: `${nome} 2.4s ease-in-out infinite` })
  const entra = valor === 'deslizar' ? 'transicao-entra' : valor === 'dissolver' ? 'transicao-dissolver' : 'transicao-corte'
  return (
    <div className="relative aspect-video w-full overflow-hidden rounded bg-muted">
      <div className="absolute inset-0 bg-sky-500" style={valor === 'deslizar' ? animar('transicao-sai') : undefined} />
      <div className="absolute inset-0 bg-amber-400" style={animar(entra)} />
    </div>
  )
}

/**
 * A transição de uma junção da linha do tempo (Fase 3): o botão redondo entre
 * dois clipes, com Corte, Dissolver e Deslizar, e "Usar em todas as junções".
 * Fica gravada no clipe que ENTRA. Só no computador: no celular a linha do
 * tempo não edita clipes, e a transição gravada continua valendo.
 */
export function TransicaoDaJuncao({
  clipes,
  indice,
  desabilitado,
}: {
  clipes: readonly Clipe[]
  /** O clipe que entra nesta junção (do segundo em diante). */
  indice: number
  desabilitado: boolean
}) {
  const { updateLayer } = useTemplateEditor()
  const atual = clipes[indice]?.transicao
  const rotulo = OPCOES.find((op) => op.valor === atual)?.rotulo ?? 'Corte'

  const definir = (id: string, valor: Transicao | undefined, opcoes?: { coalesceKey: string; gesto: boolean }) =>
    updateLayer(
      id,
      (l) => {
        if (!l.clipe || l.clipe.transicao === valor) return l
        const { transicao: _t, ...clipe } = l.clipe
        return { ...l, clipe: valor ? { ...clipe, transicao: valor } : clipe }
      },
      opcoes,
    )

  const usarEmTodas = () => {
    // Uma entrada de desfazer para a página inteira
    const gesto = { coalesceKey: `transicao-todas:${Date.now()}`, gesto: true }
    clipes.slice(1).forEach((c) => definir(c.id, atual, gesto))
  }

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          disabled={desabilitado}
          title={`Transição: ${rotulo}`}
          aria-label={`Transição entre os clipes: ${rotulo}`}
          // max-w-none: o `* { max-width: 100% }` do globals.css prendia o botão à
          // largura da junção, que é 0 — ele colapsava e sumia. Fica na borda de
          // CIMA da faixa: no meio cobria as alças de duração das duas pontas.
          className={`absolute left-1/2 top-0 z-20 flex h-5 w-5 max-w-none -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full shadow-md ring-2 ring-background transition hover:scale-110 disabled:opacity-50 ${atual ? 'bg-primary text-primary-foreground' : 'bg-foreground text-background'}`}
        >
          <IconeDaTransicao transicao={atual} className="h-3 w-3" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-72" align="center">
        <style>{ANIMACOES}</style>
        <p className="mb-2 text-xs font-medium text-muted-foreground">Como um clipe passa para o outro</p>
        <div className="grid grid-cols-3 gap-2">
          {OPCOES.map((op) => {
            const escolhida = op.valor === atual
            return (
              <button
                key={op.rotulo}
                type="button"
                onClick={() => definir(clipes[indice].id, op.valor)}
                className={`flex flex-col gap-1 rounded border p-1.5 text-left transition hover:border-primary ${escolhida ? 'border-primary bg-primary/10' : 'border-border/40'}`}
              >
                <Previa valor={op.valor} />
                <span className="text-xs">{op.rotulo}</span>
              </button>
            )
          })}
        </div>
        {clipes.length > 2 && (
          <Button size="sm" variant="outline" className="mt-2 h-8 w-full text-xs" onClick={usarEmTodas}>
            Usar em todas as junções
          </Button>
        )}
      </PopoverContent>
    </Popover>
  )
}
