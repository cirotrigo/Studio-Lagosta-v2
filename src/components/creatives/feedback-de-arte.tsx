'use client'

/**
 * "Gostei" / "Preciso melhorar" — o rodapé da arte aberta.
 *
 * Mesmo componente nas três superfícies onde a peça abre em tamanho grande (a
 * galeria de criativos, a prévia da bancada e a tela do post na agenda),
 * porque a pergunta é a mesma e versões separadas divergiriam na primeira
 * semana.
 *
 * O desenho tem quatro regras, e todas vieram do que já falhou nesta casa:
 *
 * 1. **Um clique resolve.** "Gostei" grava e não abre nada — o botão fica
 *    marcado e acabou. Feedback que pede formulário não é dado.
 * 2. **Nada bloqueia e nada atrasa.** A gravação é otimista: o estado local
 *    muda na hora e o POST vai atrás. Ninguém espera telemetria.
 * 3. **O texto é opcional e só aparece quando pedido.** "Preciso melhorar" já
 *    grava o veredito no clique — quem fechar a arte sem escrever nada deixou
 *    o sinal mais importante.
 * 4. **Só existe com `generationId`.** Arte sem Generation não tem prompt
 *    atrás, e feedback sem prompt não ensina nada.
 *
 * O pedido de correção tem ABAS (30/08/2026, revisão do Ciro): Geral + um
 * alvo por aba (Foto/Copy/Design/Horário), CADA UMA com o próprio texto — a
 * mesma arte recebe "foto escura" E "título comprido" E "sobe o bloco".
 * Enviar grava tudo junto numa linha só; o ponto no chip mostra qual aba já
 * tem conteúdo.
 *
 * Responsividade é CSS (`flex-wrap`, largura fluida), nunca `useIsMobile`.
 */

import * as React from 'react'
import { createPortal } from 'react-dom'
import { ImagePlus, Loader2, MessageSquarePlus, Send, ThumbsUp, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'
import { useFeedbackDeArte, useRegistrarFeedbackDeArte } from '@/hooks/use-feedback-de-arte'
import { SugerirFotoDialog } from '@/components/creatives/sugerir-foto-dialog'
import type { AlvoDeCorrecao, FotoSugerida, VereditoDeArte } from '@/lib/aprendizado/feedback-de-arte'
import type { Superficie } from '@/lib/aprendizado/vocabulario'

type Aba = 'geral' | AlvoDeCorrecao

const ABAS: Array<{ id: Aba; rotulo: string }> = [
  { id: 'geral', rotulo: 'Geral' },
  { id: 'foto', rotulo: 'Foto' },
  { id: 'copy', rotulo: 'Copy' },
  { id: 'design', rotulo: 'Design' },
  { id: 'horario', rotulo: 'Horário' },
]

const ALVOS: AlvoDeCorrecao[] = ['foto', 'copy', 'design', 'horario']

/** O placeholder acompanha a aba: pergunta certa rende pedido melhor. */
const PLACEHOLDER_POR_ABA: Record<Aba, string> = {
  geral: 'o que precisa melhorar? ex.: texto muito grande, foto escura…',
  foto: 'o que a foto tem? ex.: escura, prato antigo, não é o assunto…',
  copy: 'o que mudar no texto? ex.: título comprido, tirar o preço…',
  design: 'o que mudar na arte? ex.: texto menor, véu mais suave, sobe o bloco…',
  horario: 'para quando? ex.: mover para 19h, trocar para sábado…',
}

const TEXTOS_VAZIOS: Record<Aba, string> = { geral: '', foto: '', copy: '', design: '', horario: '' }

interface Props {
  generationId: string | null | undefined
  superficie?: Superficie
  /**
   * Habilita "apontar foto do acervo" no pedido de correção. Opcional porque a
   * galeria global abre artes de vários projetos numa lista só — sem o id na
   * mão, o pedido segue valendo por texto.
   */
  projectId?: number | null
  /**
   * `centro` é o lightbox/bancada (barra flutuante); `esquerda` é o card da
   * agenda. Prop explícito em vez de variante arbitrária de Tailwind — classe
   * arbitrária já se provou não gerar CSS nesta build.
   */
  alinhamento?: 'centro' | 'esquerda'
  className?: string
}

export function FeedbackDeArte({
  generationId,
  superficie = 'galeria',
  projectId,
  alinhamento = 'centro',
  className,
}: Props) {
  const { data } = useFeedbackDeArte(generationId)
  const registrar = useRegistrarFeedbackDeArte(generationId, superficie)

  const salvo = data?.feedback ?? null
  /**
   * Veredito otimista: o clique marca o botão ANTES da resposta. Um "gostei"
   * que só acende meio segundo depois faz a pessoa clicar de novo.
   */
  const [otimista, setOtimista] = React.useState<VereditoDeArte | null>(null)
  const [aberto, setAberto] = React.useState(false)
  const [abaAtiva, setAbaAtiva] = React.useState<Aba>('geral')
  const [textos, setTextos] = React.useState<Record<Aba, string>>(TEXTOS_VAZIOS)
  const [fotoSugerida, setFotoSugerida] = React.useState<FotoSugerida | null>(null)
  const [pickerAberto, setPickerAberto] = React.useState(false)
  const [enviado, setEnviado] = React.useState(false)

  const veredito = otimista ?? salvo?.veredito ?? null

  // Troca de arte (o lightbox navegando, o carrossel mudando de slide) zera o
  // estado local: senão o "gostei" do slide anterior aparece marcado no atual.
  React.useEffect(() => {
    setOtimista(null)
    setAberto(false)
    setAbaAtiva('geral')
    setTextos(TEXTOS_VAZIOS)
    setFotoSugerida(null)
    setPickerAberto(false)
    setEnviado(false)
  }, [generationId])

  // Reabrir a arte mostra o que já foi dito — cada pedido volta para a SUA
  // aba, para ser corrigido em vez de reescrito do zero. Só preenche o que
  // ainda está vazio: o que a pessoa está digitando agora vence o salvo.
  React.useEffect(() => {
    if (!salvo || salvo.veredito !== 'melhorar') return
    setAberto(true)
    setTextos((atuais) => {
      const proximos = { ...atuais }
      if (!proximos.geral && salvo.comentario) proximos.geral = salvo.comentario
      for (const pedido of salvo.pedidos) {
        if (!proximos[pedido.alvo] && pedido.texto) proximos[pedido.alvo] = pedido.texto
      }
      return proximos
    })
    setFotoSugerida(
      (atual) => atual ?? salvo.pedidos.find((p) => p.alvo === 'foto')?.fotoSugerida ?? null,
    )
  }, [salvo])

  if (!generationId) return null

  /** Tudo que está nas abas, no shape que o serviço grava. */
  const montarPayload = (foto: FotoSugerida | null = fotoSugerida) => ({
    veredito: 'melhorar' as const,
    comentario: textos.geral.trim() || null,
    pedidos: ALVOS.map((alvo) => ({
      alvo,
      texto: textos[alvo].trim() || null,
      fotoSugerida: alvo === 'foto' ? foto : null,
    })).filter((p) => p.texto || p.fotoSugerida),
  })

  const marcar = (novo: VereditoDeArte) => {
    setOtimista(novo)
    setEnviado(false)
    if (novo === 'melhorar') {
      setAberto(true)
      registrar.mutate(montarPayload())
    } else {
      // Elogiar é retirar os pedidos — o serviço limpa tudo no "gostei".
      setAberto(false)
      setTextos(TEXTOS_VAZIOS)
      setFotoSugerida(null)
      registrar.mutate({ veredito: 'gostei', comentario: null, pedidos: [] })
    }
  }

  const enviar = () => {
    setOtimista('melhorar')
    setEnviado(true)
    registrar.mutate(montarPayload())
  }

  /** Apontar a foto é ação completa: grava na hora, com o resto das abas. */
  const aoEscolherFoto = (foto: FotoSugerida) => {
    setFotoSugerida(foto)
    setAbaAtiva('foto')
    setOtimista('melhorar')
    setEnviado(true)
    registrar.mutate(montarPayload(foto))
  }

  const tirarFoto = () => {
    setFotoSugerida(null)
    setEnviado(true)
    registrar.mutate(montarPayload(null))
  }

  const temConteudo = (aba: Aba) =>
    aba === 'foto' ? !!textos.foto.trim() || !!fotoSugerida : !!textos[aba].trim()

  return (
    <div className={cn('flex w-full flex-col gap-2', className)}>
      <div
        className={cn(
          'flex flex-wrap items-center gap-2',
          alinhamento === 'centro' ? 'justify-center' : 'justify-start',
        )}
      >
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
          {/* As ABAS do pedido: cada uma guarda o próprio texto, e o ponto
              mostra qual já tem conteúdo. Tudo vai junto no Enviar. */}
          <div className="flex flex-wrap items-center gap-1.5" role="tablist">
            {ABAS.map((aba) => (
              <button
                key={aba.id}
                type="button"
                role="tab"
                aria-selected={abaAtiva === aba.id}
                onClick={() => setAbaAtiva(aba.id)}
                className={cn(
                  'inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs transition-colors',
                  abaAtiva === aba.id
                    ? 'border-primary bg-primary text-primary-foreground'
                    : 'border-border bg-background text-muted-foreground hover:bg-muted',
                )}
              >
                {aba.rotulo}
                {temConteudo(aba.id) && (
                  <span
                    className={cn(
                      'h-1.5 w-1.5 rounded-full',
                      abaAtiva === aba.id ? 'bg-primary-foreground' : 'bg-primary',
                    )}
                    aria-label="tem conteúdo"
                  />
                )}
              </button>
            ))}
          </div>

          {abaAtiva === 'foto' && projectId != null && (
            <div className="flex flex-wrap items-center gap-1.5">
              {fotoSugerida ? (
                <span className="inline-flex max-w-full items-center gap-1 rounded-full bg-muted px-2.5 py-0.5 text-xs">
                  <ImagePlus className="h-3 w-3 shrink-0" />
                  <span className="truncate">{fotoSugerida.nome ?? 'foto do acervo'}</span>
                  <button
                    type="button"
                    onClick={tirarFoto}
                    aria-label="Tirar a foto sugerida"
                    className="ml-0.5 rounded-full p-0.5 hover:bg-background"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </span>
              ) : (
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  className="h-6 px-2 text-xs"
                  onClick={() => setPickerAberto(true)}
                >
                  <ImagePlus className="mr-1 h-3.5 w-3.5" />
                  Apontar foto do acervo
                </Button>
              )}
            </div>
          )}

          <Textarea
            value={textos[abaAtiva]}
            onChange={(e) => {
              const valor = e.target.value
              setTextos((atuais) => ({ ...atuais, [abaAtiva]: valor }))
              setEnviado(false)
            }}
            onKeyDown={(e) => {
              // Ctrl/Cmd+Enter envia: quem escreve rápido não larga o teclado.
              if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                e.preventDefault()
                enviar()
              }
            }}
            placeholder={PLACEHOLDER_POR_ABA[abaAtiva]}
            rows={2}
            // O teto real é do serviço (`TETO_COMENTARIO`), que não pode ser
            // importado aqui: aquele módulo puxa o Prisma, e isto é client.
            // O número repetido é o preço; o servidor corta de qualquer jeito.
            maxLength={1000}
            className="min-h-16 resize-none text-sm"
          />
          <div className="flex items-center justify-end gap-2">
            {enviado && !registrar.isPending && (
              <span className="text-xs text-muted-foreground">anotado — todas as abas juntas</span>
            )}
            <Button type="button" size="sm" variant="outline" onClick={enviar}>
              <Send className="mr-1.5 h-4 w-4" />
              Enviar tudo
            </Button>
          </div>
        </div>
      )}

      {projectId != null && (
        <SugerirFotoDialog
          projectId={projectId}
          open={pickerAberto}
          onOpenChange={setPickerAberto}
          onEscolher={aoEscolherFoto}
        />
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
