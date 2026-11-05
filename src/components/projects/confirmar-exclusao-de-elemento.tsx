"use client"

import * as React from 'react'
import { Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { useDeleteProjectElement } from '@/hooks/use-project-elements'
import { useToast } from '@/hooks/use-toast'

export interface AlvoDaExclusao {
  projectId: number
  elementId: number
  nome: string
}

/**
 * A confirmação D6 de apagar um elemento da Marca (CP-V2e), comum à Marca do editor e à Identidade visual.
 *
 * - O alvo (`projectId`, `elementId`, nome) é capturado ao ABRIR: o DELETE usa esses valores, nunca os da tela.
 * - Confirmação controlada: "Apagar" é um `Button` comum (o `AlertDialogAction` fecharia no clique, antes do
 *   resultado); o diálogo fecha só quando a mutação termina. Clique fora não fecha (o `AlertDialogContent` do Radix
 *   já impede); Esc cancela, mas é ignorado com o DELETE pendente.
 * - Troca de projeto (A → B): a confirmação fecha sem DELETE; um DELETE em voo termina e o hook reconcilia só A.
 *   Callback tardio não fecha nem anuncia nada no projeto novo.
 * - Desfazer do editor NÃO traz o elemento de volta (não é camada): a confirmação é a única barreira.
 */
export function useConfirmarExclusaoDeElemento(projectId: number | null | undefined) {
  const { toast } = useToast()
  const excluir = useDeleteProjectElement()
  const [alvo, setAlvo] = React.useState<AlvoDaExclusao | null>(null)
  const projetoAtual = React.useRef(projectId)
  projetoAtual.current = projectId
  // Marcado NO CLIQUE: o `isPending` só chega à tela depois (o TanStack notifica numa tarefa adiada). Até lá, um
  // 2º clique faria outro DELETE e um Esc fecharia o diálogo com o pedido já saindo (medido no harness do V2e).
  const emVoo = React.useRef(false)

  React.useEffect(() => () => setAlvo(null), [projectId])

  const pendente = excluir.isPending
  const ocupado = () => emVoo.current || pendente
  const confirmar = () => {
    const a = alvo
    if (!a || emVoo.current) return
    emVoo.current = true
    excluir.mutate(
      { projectId: a.projectId, elementId: a.elementId },
      {
        onSuccess: () => {
          if (projetoAtual.current === a.projectId) toast({ title: 'Elemento apagado', description: `"${a.nome}" saiu da Marca.` })
        },
        onError: (erro) => {
          if (projetoAtual.current !== a.projectId) return
          toast({
            title: 'Não foi possível apagar o elemento',
            description: erro instanceof Error ? erro.message : 'Tente de novo.',
            variant: 'destructive',
          })
        },
        onSettled: () => {
          emVoo.current = false
          setAlvo((atual) => (atual === a ? null : atual))
        },
      },
    )
  }

  const dialogo = (
    <AlertDialog
      open={alvo !== null}
      onOpenChange={(aberto) => {
        if (!aberto && !ocupado()) setAlvo(null)
      }}
    >
      <AlertDialogContent
        data-confirmacao="apagar-elemento"
        onEscapeKeyDown={(evento) => {
          if (ocupado()) evento.preventDefault()
        }}
      >
        <AlertDialogHeader>
          <AlertDialogTitle>Apagar &quot;{alvo?.nome}&quot; da Marca?</AlertDialogTitle>
          <AlertDialogDescription>
            O elemento sai da biblioteca da Marca. As artes que já usam esta imagem não mudam.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={pendente}>Cancelar</AlertDialogCancel>
          <Button variant="destructive" disabled={pendente} onClick={confirmar}>
            {pendente && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Apagar
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )

  return {
    pedir: (a: AlvoDaExclusao) => setAlvo(a),
    /** id do elemento com DELETE em voo (fica marcado, lixeira desabilitada) */
    apagando: pendente ? (excluir.variables?.elementId ?? null) : null,
    dialogo,
  }
}
