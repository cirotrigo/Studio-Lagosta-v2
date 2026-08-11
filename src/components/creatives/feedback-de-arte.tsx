'use client'

/**
 * "Gostei" / "Preciso melhorar" — o rodapé da arte aberta.
 *
 * Mesmo componente nas duas superfícies onde a peça abre em tamanho grande (a
 * galeria de criativos e a prévia da bancada), porque a pergunta é a mesma e
 * duas versões divergiriam na primeira semana.
 *
 * O desenho tem quatro regras, e todas vieram do que já falhou nesta casa:
 *
 * 1. **Um clique resolve.** "Gostei" grava e não abre nada — o botão fica
 *    marcado e acabou. Feedback que pede formulário não é dado.
 * 2. **Nada bloqueia e nada atrasa.** A gravação é otimista: o estado local
 *    muda na hora e o POST vai atrás. Ninguém espera telemetria.
 * 3. **O texto é opcional e só aparece quando pedido.** "Preciso melhorar" já
 *    grava o veredito no clique — quem fechar a arte sem escrever nada deixou
 *    o sinal mais importante. O comentário, se vier, é uma revisão.
 * 4. **Só existe com `generationId`.** Arte sem Generation não tem prompt
 *    atrás, e feedback sem prompt não ensina nada.
 *
 * Responsividade é CSS (`flex-wrap`, largura fluida), nunca `useIsMobile`.
 */

import * as React from 'react'
import { createPortal } from 'react-dom'
import { Loader2, MessageSquarePlus, Send, ThumbsUp } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'
import { useFeedbackDeArte, useRegistrarFeedbackDeArte } from '@/hooks/use-feedback-de-arte'
import type { VereditoDeArte } from '@/lib/aprendizado/feedback-de-arte'
import type { Superficie } from '@/lib/aprendizado/vocabulario'

const PLACEHOLDER = 'o que precisa melhorar? ex.: texto muito grande, foto escura…'

interface Props {
  generationId: string | null | undefined
  superficie?: Superficie
  className?: string
}

export function FeedbackDeArte({ generationId, superficie = 'galeria', className }: Props) {
  const { data } = useFeedbackDeArte(generationId)
  const registrar = useRegistrarFeedbackDeArte(generationId, superficie)

  const salvo = data?.feedback ?? null
  /**
   * Veredito otimista: o clique marca o botão ANTES da resposta. Um "gostei"
   * que só acende meio segundo depois faz a pessoa clicar de novo.
   */
  const [otimista, setOtimista] = React.useState<VereditoDeArte | null>(null)
  const [aberto, setAberto] = React.useState(false)
  const [texto, setTexto] = React.useState('')
  const [enviado, setEnviado] = React.useState(false)

  const veredito = otimista ?? salvo?.veredito ?? null

  // Troca de arte (o lightbox navegando, o carrossel mudando de slide) zera o
  // estado local: senão o "gostei" do slide anterior aparece marcado no atual.
  React.useEffect(() => {
    setOtimista(null)
    setAberto(false)
    setTexto('')
    setEnviado(false)
  }, [generationId])

  // Reabrir a arte mostra o que já foi dito — inclusive o comentário, que fica
  // no campo para ser corrigido em vez de reescrito do zero.
  React.useEffect(() => {
    if (!salvo) return
    if (salvo.veredito === 'melhorar') {
      setAberto(true)
      setTexto((atual) => (atual ? atual : (salvo.comentario ?? '')))
    }
  }, [salvo])

  if (!generationId) return null

  const marcar = (novo: VereditoDeArte) => {
    setOtimista(novo)
    setEnviado(false)
    if (novo === 'melhorar') setAberto(true)
    else setAberto(false)
    registrar.mutate({ veredito: novo, comentario: novo === 'melhorar' ? texto : null })
  }

  const enviarComentario = () => {
    setOtimista('melhorar')
    setEnviado(true)
    registrar.mutate({ veredito: 'melhorar', comentario: texto })
  }

  return (
    <div className={cn('flex w-full flex-col gap-2', className)}>
      <div className="flex flex-wrap items-center justify-center gap-2">
        <Button
          type="button"
          size="sm"
          variant={veredito === 'gostei' ? 'default' : 'outline'}
          onClick={() => marcar('gostei')}
          aria-pressed={veredito === 'gostei'}
        >
          <ThumbsUp className="mr-1.5 h-4 w-4" />
          Gostei
        </Button>

        <Button
          type="button"
          size="sm"
          variant={veredito === 'melhorar' ? 'default' : 'outline'}
          onClick={() => marcar('melhorar')}
          aria-pressed={veredito === 'melhorar'}
        >
          <MessageSquarePlus className="mr-1.5 h-4 w-4" />
          Preciso melhorar
        </Button>

        {registrar.isPending && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
        {!registrar.isPending && veredito === 'gostei' && (
          <span className="text-xs text-muted-foreground">anotado</span>
        )}
      </div>

      {aberto && (
        <div className="flex w-full flex-col gap-2">
          <Textarea
            value={texto}
            onChange={(e) => {
              setTexto(e.target.value)
              setEnviado(false)
            }}
            onKeyDown={(e) => {
              // Ctrl/Cmd+Enter envia: quem escreve rápido não larga o teclado.
              if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                e.preventDefault()
                enviarComentario()
              }
            }}
            placeholder={PLACEHOLDER}
            rows={2}
            // O teto real é do serviço (`TETO_COMENTARIO`), que não pode ser
            // importado aqui: aquele módulo puxa o Prisma, e isto é client.
            // O número repetido é o preço; o servidor corta de qualquer jeito.
            maxLength={1000}
            className="min-h-16 resize-none text-sm"
          />
          <div className="flex items-center justify-end gap-2">
            {enviado && !registrar.isPending && (
              <span className="text-xs text-muted-foreground">anotado</span>
            )}
            <Button type="button" size="sm" variant="outline" onClick={enviarComentario}>
              <Send className="mr-1.5 h-4 w-4" />
              Enviar
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}

/**
 * A mesma barra, flutuando sobre o LIGHTBOX.
 *
 * Por que fora do canvas do PhotoSwipe: a UI custom dele entra por
 * `uiRegister`, que cria elementos DOM crus dentro de `.pswp` — e ali dentro
 * este componente perderia os providers do app (QueryClient, tema) a não ser
 * por um portal para um nó que nasce e morre com cada abertura do lightbox.
 * Além disso, TODA classe com "container" no nome é recortada pela regra global
 * do `globals.css`, que já deixou o slide ativo invisível uma vez.
 *
 * Uma barra IRMÃ resolve o mesmo problema sem nenhum desses riscos: portal para
 * o `document.body`, posição fixa e z-index acima do `--pswp-root-z-index`
 * (100000, lido do CSS do pacote). O z-index vai em estilo INLINE de propósito
 * — classe arbitrária de Tailwind já se provou não gerar CSS neste repo.
 *
 * Fica no rodapé porque a UI do PhotoSwipe (fechar, contador, setas) ocupa o
 * topo e as laterais: é o único lugar que não tapa a peça.
 */
export function FeedbackDeArteFlutuante({
  generationId,
  superficie = 'galeria',
}: Omit<Props, 'className'>) {
  const [montado, setMontado] = React.useState(false)
  React.useEffect(() => setMontado(true), [])

  if (!montado || !generationId) return null

  return createPortal(
    <div
      className="pointer-events-none fixed inset-x-0 bottom-0 flex justify-center p-3"
      style={{ zIndex: 100001 }}
    >
      {/*
        O PhotoSwipe escuta `keydown` no DOCUMENT e não olha o elemento com
        foco: seta ← → trocaria de arte NO MEIO da frase que a pessoa está
        escrevendo (e a troca zera o campo, porque o estado é por arte), e Esc
        fecharia o lightbox junto. Parar a propagação aqui é o que mantém o
        teclado dentro da barra enquanto ela tem foco.
      */}
      <div
        onKeyDown={(e) => e.stopPropagation()}
        className="pointer-events-auto w-full max-w-md rounded-xl border border-border/60 bg-background/95 p-3 shadow-lg backdrop-blur"
      >
        <FeedbackDeArte generationId={generationId} superficie={superficie} />
      </div>
    </div>,
    document.body,
  )
}
