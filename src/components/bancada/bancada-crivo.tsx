'use client'

/**
 * Crivo de aprovação do projeto — a última porta antes de a arte ir para a
 * agenda.
 *
 * **O que mudou em 10/08/2026 (decisão do Ciro).** O crivo nasceu mostrando as
 * perguntas do DNA como caixas de marcar, mas o quadradinho significava "eu
 * li", não "conforme": o único caminho para frente era marcar TUDO (14
 * perguntas no Wine Vix, 35 no Quintal), a polaridade era mista e o aviso
 * sobre ela vivia numa frase que ninguém carrega na cabeça. Virou o pedágio
 * que se paga sem ler — exatamente o que o desenho dizia evitar.
 *
 * Agora **o sistema confere o que consegue verificar sozinho, mostrando a
 * evidência, e a pessoa responde só o que exige olho**:
 *
 * 1. **Reprova AVISA, nunca veta.** É a regra da casa desde a conferência de
 *    arte: a base de conhecimento pode estar velha, e travar o agendamento por
 *    metadado é pior que agendar com aviso. Daí "Agendar mesmo assim" existir,
 *    explícito e secundário, ao lado do "Voltar e ajustar".
 * 2. **Marcar significa SEMPRE "está conforme".** As perguntas do olho humano
 *    chegam reescritas com a polaridade normalizada — "O layout é igual ao da
 *    peça anterior?" vira "O layout é diferente do da peça anterior?". O texto
 *    do DNA fica intocado; quem inverte é a avaliação.
 * 3. **Serviço fora do ar não impede ninguém de agendar.** Sem avaliação, o
 *    modal volta a ser o crivo de leitura de antes, com as perguntas originais
 *    e o aviso de polaridade misturada.
 *
 * Continua valendo: **só barra o AGENDAR, nunca o rascunho** (rascunho é o
 * caminho de quem ainda não aprovou), e **reabrir zera** — avaliação e marcas
 * de uma peça anterior não valem para a próxima.
 */

import * as React from 'react'
import { ShieldCheck, AlertTriangle, Check, Loader2, Eye } from 'lucide-react'
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
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { useCrivoAvaliacao } from '@/hooks/use-crivo-avaliacao'
import { textoDoItem, type ItemDoCrivo, type PecaParaCrivo } from '@/lib/brand/approval-checklist'

interface Props {
  projectId: number
  /** As perguntas do DNA desta marca, já quebradas em itens. */
  perguntas: string[]
  /** A peça que está sendo conferida. `null` fecha a conferência. */
  peca: PecaParaCrivo | null
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Chamado quando a pessoa aprova — depois do olho e de qualquer ressalva. */
  onAprovar: () => void
}

export function BancadaCrivo({ projectId, perguntas, peca, open, onOpenChange, onAprovar }: Props) {
  const [marcadas, setMarcadas] = React.useState<Set<number>>(new Set())
  /** "Agendar mesmo assim": a pessoa viu a reprova e decidiu seguir. */
  const [ressalvaAceita, setRessalvaAceita] = React.useState(false)
  /**
   * Conta as aberturas. É o que faz a avaliação rodar de novo a cada vez —
   * sem isso o TanStack Query serviria o resultado da peça anterior.
   */
  const [sessao, setSessao] = React.useState(0)

  React.useEffect(() => {
    if (!open) return
    setMarcadas(new Set())
    setRessalvaAceita(false)
    setSessao((s) => s + 1)
  }, [open])

  const { avaliacao, carregando } = useCrivoAvaliacao({
    projectId,
    perguntas,
    peca,
    ativo: open,
    sessao,
  })

  const reprovas = avaliacao.itens.filter((i) => i.veredito === 'reprova')
  const conformes = avaliacao.itens.filter((i) => i.veredito === 'conforme')
  const doOlho = avaliacao.itens.filter((i) => i.veredito === 'preciso-de-olho')

  const faltam = doOlho.filter((i) => !marcadas.has(i.indice)).length
  const travadoPorReprova = reprovas.length > 0 && !ressalvaAceita
  const podeAprovar = !carregando && faltam === 0 && !travadoPorReprova

  const alternar = (indice: number, marcada: boolean) =>
    setMarcadas((atual) => {
      const proximo = new Set(atual)
      if (marcada) proximo.add(indice)
      else proximo.delete(indice)
      return proximo
    })

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
            {carregando
              ? 'O sistema está conferindo o que dá para conferir sozinho.'
              : avaliacao.degradado
                ? 'A conferência automática não respondeu — vale o crivo de leitura. Atenção: algumas perguntas reprovam no “sim”, outras no “não”.'
                : 'O sistema já conferiu o que dá pelos dados. Marque só o que precisa do seu olho — marcar significa “está conforme”.'}
          </DialogDescription>
        </DialogHeader>

        {carregando ? (
          <div className="flex items-center gap-3 py-8 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin text-primary" />
            Conferindo a peça contra as regras da marca…
          </div>
        ) : (
          <div className="space-y-4">
            {reprovas.length > 0 && (
              <section className="space-y-2 rounded-lg border border-destructive/50 bg-destructive/5 p-3">
                <h3 className="flex items-center gap-2 text-sm font-medium text-destructive">
                  <AlertTriangle className="h-4 w-4" />
                  {reprovas.length === 1
                    ? 'Um ponto não bate com as regras da marca'
                    : `${reprovas.length} pontos não batem com as regras da marca`}
                </h3>
                <ul className="space-y-2">
                  {reprovas.map((item) => (
                    <li key={item.indice} className="text-sm">
                      <p>{item.pergunta}</p>
                      <p className="text-xs text-destructive">{item.evidencia}</p>
                    </li>
                  ))}
                </ul>
                {ressalvaAceita && (
                  <p className="text-xs text-muted-foreground">
                    Você optou por agendar mesmo assim.
                  </p>
                )}
              </section>
            )}

            {conformes.length > 0 && (
              <Collapsible>
                <CollapsibleTrigger className="flex w-full items-center gap-2 rounded-md p-2 text-sm text-muted-foreground hover:bg-muted/50">
                  <Check className="h-4 w-4 text-emerald-500" />
                  <span>
                    Conferido pelo sistema —{' '}
                    {conformes.length === 1 ? '1 item' : `${conformes.length} itens`}
                  </span>
                  <span className="ml-2 text-xs">(ver evidências)</span>
                </CollapsibleTrigger>
                <CollapsibleContent>
                  <ul className="space-y-1.5 px-2 pb-2 pt-1">
                    {conformes.map((item) => (
                      <li key={item.indice} className="flex items-start gap-2 text-sm">
                        <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-500" />
                        <span className="text-muted-foreground">
                          {item.pergunta}
                          <span className="block text-xs opacity-80">{item.evidencia}</span>
                        </span>
                      </li>
                    ))}
                  </ul>
                </CollapsibleContent>
              </Collapsible>
            )}

            {doOlho.length > 0 && (
              <section className="space-y-1">
                <h3 className="flex items-center gap-2 px-2 text-sm font-medium">
                  <Eye className="h-4 w-4 text-primary" />
                  Precisa do seu olho
                  <span className="text-xs font-normal text-muted-foreground">
                    ({doOlho.length})
                  </span>
                </h3>
                <ol className="space-y-1">
                  {doOlho.map((item) => (
                    <ItemDoOlho
                      key={item.indice}
                      item={item}
                      marcada={marcadas.has(item.indice)}
                      onMarcar={(v) => alternar(item.indice, v)}
                    />
                  ))}
                </ol>
              </section>
            )}
          </div>
        )}

        <DialogFooter className="gap-2 sm:justify-between">
          <span className="self-center text-xs text-muted-foreground">
            {carregando
              ? 'Um instante…'
              : travadoPorReprova
                ? 'Resolva os pontos acima ou siga com a ressalva.'
                : faltam === 0
                  ? 'Tudo conferido.'
                  : `Faltam ${faltam} de ${doOlho.length}.`}
          </span>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>
              Voltar e ajustar
            </Button>
            {travadoPorReprova && (
              <Button variant="secondary" size="sm" onClick={() => setRessalvaAceita(true)}>
                Agendar mesmo assim
              </Button>
            )}
            <Button size="sm" disabled={!podeAprovar} onClick={onAprovar}>
              Aprovar e agendar
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/**
 * Uma pergunta que depende de ver a peça.
 *
 * O texto mostrado é o NORMALIZADO — marcar sempre quer dizer "está
 * conforme". A pergunta original fica no `title` para quem quiser conferir de
 * onde ela veio no DNA.
 */
function ItemDoOlho({
  item,
  marcada,
  onMarcar,
}: {
  item: ItemDoCrivo
  marcada: boolean
  onMarcar: (marcada: boolean) => void
}) {
  const texto = textoDoItem(item)
  const reescrita = texto !== item.pergunta
  return (
    <li>
      <label
        className="flex cursor-pointer items-start gap-3 rounded-md p-2 text-sm transition-colors hover:bg-muted/50"
        data-conferido={marcada}
        title={reescrita ? `No DNA: ${item.pergunta}` : undefined}
      >
        <Checkbox
          checked={marcada}
          onCheckedChange={(v) => onMarcar(v === true)}
          className="mt-0.5"
        />
        <span className={marcada ? 'text-muted-foreground line-through' : undefined}>
          {texto}
          {item.evidencia && (
            <span className="block text-xs text-muted-foreground">{item.evidencia}</span>
          )}
        </span>
      </label>
    </li>
  )
}
