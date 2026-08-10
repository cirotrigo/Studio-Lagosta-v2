'use client'

/**
 * Crivo de aprovação do projeto — item 4 da Fase 2 do plano.
 *
 * As perguntas binárias que vivem no DNA de cada marca ("a foto acontece
 * dentro do salão real da casa?", "existe mais de uma oferta na mesma peça?")
 * viram a última porta antes de a arte ir para a agenda.
 *
 * Duas decisões de desenho que valem para quem mexer aqui:
 *
 * 1. **Só barra o AGENDAR, não o rascunho.** Rascunho na agenda é justamente o
 *    caminho de quem ainda não aprovou; exigir crivo ali transformaria a porta
 *    em pedágio e ensinaria a clicar sem ler.
 * 2. **Não existe veredito automático.** A polaridade das perguntas é MISTA no
 *    DNA real — no By Rock convivem "O layout é igual ao da peça anterior?"
 *    (reprova no SIM) e "A foto acontece dentro do salão real?" (reprova no
 *    NÃO). Marcar tudo como "ok" seria mentira estatística: o que se pede é
 *    leitura consciente, item a item.
 */

import * as React from 'react'
import { ShieldCheck } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Checkbox } from '@/components/ui/checkbox'

interface Props {
  perguntas: string[]
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Chamado só quando a pessoa passa por todos os itens. */
  onAprovar: () => void
}

export function BancadaCrivo({ perguntas, open, onOpenChange, onAprovar }: Props) {
  const [marcadas, setMarcadas] = React.useState<Set<number>>(new Set())

  // Reabrir é recomeçar: crivo pela metade de uma peça anterior não pode
  // valer para a próxima.
  React.useEffect(() => {
    if (open) setMarcadas(new Set())
  }, [open])

  const faltam = perguntas.length - marcadas.size

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {/* Só `max-h`: largura e scroll já vêm do DialogContent (sm:max-w-lg +
          overflow-y-auto), e repetir classe do mesmo grupo é onde o
          tailwind-merge costuma morder. */}
      <DialogContent className="max-h-[85vh]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ShieldCheck className="h-5 w-5 text-primary" />
            Crivo de aprovação
          </DialogTitle>
          <DialogDescription>
            As perguntas desta marca antes de a arte ir para a agenda. Leia cada uma olhando para a
            peça — algumas reprovam no “sim”, outras no “não”.
          </DialogDescription>
        </DialogHeader>

        <ol className="space-y-1">
          {perguntas.map((pergunta, i) => {
            const marcada = marcadas.has(i)
            return (
              <li key={i}>
                <label
                  className="flex cursor-pointer items-start gap-3 rounded-md p-2 text-sm transition-colors hover:bg-muted/50"
                  data-conferido={marcada}
                >
                  <Checkbox
                    checked={marcada}
                    onCheckedChange={(v) =>
                      setMarcadas((atual) => {
                        const proximo = new Set(atual)
                        if (v) proximo.add(i)
                        else proximo.delete(i)
                        return proximo
                      })
                    }
                    className="mt-0.5"
                  />
                  <span className={marcada ? 'text-muted-foreground line-through' : undefined}>
                    <span className="mr-1 tabular-nums text-muted-foreground">{i + 1}.</span>
                    {pergunta}
                  </span>
                </label>
              </li>
            )
          })}
        </ol>

        <DialogFooter className="gap-2 sm:justify-between">
          <span className="self-center text-xs text-muted-foreground">
            {faltam === 0 ? 'Tudo conferido.' : `Faltam ${faltam} de ${perguntas.length}.`}
          </span>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>
              Voltar e ajustar
            </Button>
            <Button size="sm" disabled={faltam > 0} onClick={onAprovar}>
              Aprovar e agendar
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
