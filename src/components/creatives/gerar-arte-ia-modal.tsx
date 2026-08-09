'use client'

/**
 * Modal da geração de arte por IA (POST /api/projects/[id]/arte-ia).
 *
 * Duas trilhas, porque são dois trabalhos diferentes e misturá-los degrada os
 * dois: `arte` desenha os textos na peça (copy verbatim, conferida por visão);
 * `imagem` produz a cena sem nenhuma letra.
 *
 * Dispara e fecha: a Generation nasce PROCESSING e aparece na galeria, que se
 * atualiza sozinha. É o que permite disparar várias gerações em paralelo, em
 * vez de esperar uma para começar a próxima.
 */

import * as React from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { Sparkles, Wand2, ImageIcon, ChevronDown } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { useToast } from '@/hooks/use-toast'
import { api } from '@/lib/api-client'
import { cn } from '@/lib/utils'
import {
  ArteIaImagePicker,
  contarPorPapel,
  type PapelReferencia,
  type ReferenciaSelecionada,
} from '@/components/creatives/arte-ia-image-picker'

type Trilha = 'arte' | 'imagem'
type Formato = 'story' | 'feed' | 'quadrado'

const FORMATOS: Array<{ valor: Formato; titulo: string; medida: string }> = [
  { valor: 'story', titulo: 'Story', medida: '1080×1920' },
  { valor: 'feed', titulo: 'Feed', medida: '1080×1350' },
  { valor: 'quadrado', titulo: 'Quadrado', medida: '1080×1080' },
]

const MAX_PEDIDO = 1200
const MAX_COPY_BLOCOS = 12

interface Props {
  projectId: number
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function GerarArteIaModal({ projectId, open, onOpenChange }: Props) {
  const { toast } = useToast()
  const queryClient = useQueryClient()

  const [trilha, setTrilha] = React.useState<Trilha>('arte')
  const [formato, setFormato] = React.useState<Formato>('story')
  const [copyTexto, setCopyTexto] = React.useState('')
  const [pedido, setPedido] = React.useState('')
  const [instrucaoImagem, setInstrucaoImagem] = React.useState('')
  const [mostrarInstrucao, setMostrarInstrucao] = React.useState(false)
  const [referencias, setReferencias] = React.useState<ReferenciaSelecionada[]>([])
  const [enviando, setEnviando] = React.useState(false)

  const blocos = React.useMemo(
    () =>
      copyTexto
        .split('\n')
        .map((l) => l.trim())
        .filter(Boolean),
    [copyTexto],
  )

  const resetar = React.useCallback(() => {
    setCopyTexto('')
    setPedido('')
    setInstrucaoImagem('')
    setMostrarInstrucao(false)
    setReferencias([])
  }, [])

  const fechar = () => {
    resetar()
    onOpenChange(false)
  }

  const temPrato = contarPorPapel(referencias, 'subject') > 0

  const impedimento = (() => {
    if (trilha === 'arte') {
      if (blocos.length === 0) return 'Escreva a copy da peça (um bloco por linha).'
      if (blocos.length > MAX_COPY_BLOCOS) return `No máximo ${MAX_COPY_BLOCOS} blocos de copy.`
      if (blocos.some((b) => b.length > 200)) return 'Cada bloco de copy deve ter até 200 caracteres.'
      if (!temPrato) return 'Escolha a foto que será a cena da arte (papel "Prato / produto").'
    } else if (!pedido.trim()) {
      return 'Descreva a imagem que você quer gerar.'
    }
    return null
  })()

  const enviar = async () => {
    if (impedimento) return
    setEnviando(true)
    try {
      const resposta = await api.post<{ generation: { id: string }; reused: boolean }>(
        `/api/projects/${projectId}/arte-ia`,
        {
          track: trilha,
          formato,
          pedido: pedido.trim() || undefined,
          copy: trilha === 'arte' ? blocos : undefined,
          instrucaoImagem: trilha === 'arte' && instrucaoImagem.trim() ? instrucaoImagem.trim() : null,
          referencias: referencias.map((r) => ({
            role: r.papel,
            ...(r.driveFileId ? { driveFileId: r.driveFileId } : { url: r.url }),
            ...(r.label ? { label: r.label.slice(0, 80) } : {}),
          })),
        },
      )

      queryClient.invalidateQueries({ queryKey: ['generations', projectId] })
      toast({
        title: resposta.reused ? 'Já havia uma geração igual em andamento' : 'Geração iniciada',
        description: resposta.reused
          ? 'Acompanhe a que já estava rodando na galeria.'
          : 'A arte aparece na galeria em 1 a 3 minutos. Você pode disparar outra agora mesmo.',
      })
      resetar()
      onOpenChange(false)
    } catch (error) {
      const mensagem = error instanceof Error ? error.message : 'Erro ao iniciar a geração'
      toast({ title: 'Não deu para gerar', description: mensagem, variant: 'destructive' })
    } finally {
      setEnviando(false)
    }
  }

  const papelPadrao: PapelReferencia = temPrato ? 'anchor-ambient' : 'subject'
  const custo = trilha === 'arte' ? '25 créditos' : '15 créditos'

  return (
    <Dialog open={open} onOpenChange={(next) => (next ? onOpenChange(true) : fechar())}>
      <DialogContent className="flex max-h-[92vh] max-w-2xl flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" />
            Gerar arte com IA
          </DialogTitle>
          <DialogDescription>
            A partir de fotos reais do cliente e da identidade da marca. Escolha as referências com
            o papel certo — é o papel que impede o modelo de inventar prato ou cenário.
          </DialogDescription>
        </DialogHeader>

        <div className="-mr-1 space-y-5 overflow-y-auto py-2 pr-1">
          <section className="space-y-2">
            <Label>O que você quer gerar</Label>
            <div className="grid grid-cols-2 gap-2">
              <TrilhaCard
                ativa={trilha === 'arte'}
                onClick={() => setTrilha('arte')}
                icone={<Wand2 className="h-4 w-4" />}
                titulo="Arte pronta"
                descricao="Com os textos desenhados na peça, conferidos por visão."
              />
              <TrilhaCard
                ativa={trilha === 'imagem'}
                onClick={() => setTrilha('imagem')}
                icone={<ImageIcon className="h-4 w-4" />}
                titulo="Imagem sem texto"
                descricao="Só a cena/fotografia — para usar de fundo ou no editor."
              />
            </div>
          </section>

          <section className="space-y-2">
            <Label>Formato</Label>
            <div className="flex gap-2">
              {FORMATOS.map((f) => (
                <button
                  key={f.valor}
                  type="button"
                  onClick={() => setFormato(f.valor)}
                  className={cn(
                    'flex-1 rounded-lg border-2 px-3 py-2 text-left transition-colors',
                    formato === f.valor
                      ? 'border-primary bg-primary/5'
                      : 'border-border/60 hover:border-primary/40',
                  )}
                >
                  <span className="block text-sm font-medium">{f.titulo}</span>
                  <span className="block text-[11px] text-muted-foreground">{f.medida}</span>
                </button>
              ))}
            </div>
          </section>

          {trilha === 'arte' && (
            <section className="space-y-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="copy-arte">Copy da peça (um bloco por linha)</Label>
                <span className="text-xs text-muted-foreground">
                  {blocos.length}/{MAX_COPY_BLOCOS} blocos
                </span>
              </div>
              <Textarea
                id="copy-arte"
                value={copyTexto}
                onChange={(e) => setCopyTexto(e.target.value)}
                rows={4}
                placeholder={'HOJE TEM\nHAPPY HOUR\nchope em dobro até 20h'}
                className="resize-none font-mono text-sm"
              />
              <p className="text-xs text-muted-foreground">
                Os textos são reproduzidos letra por letra e conferidos na arte gerada. Se
                divergirem, a geração é refeita — e nunca entrega texto errado.
              </p>
            </section>
          )}

          <section className="space-y-2">
            <div className="flex items-center justify-between">
              <Label htmlFor="pedido-arte">
                {trilha === 'imagem' ? 'Descreva a cena' : 'Direção adicional (opcional)'}
              </Label>
              <span className="text-xs text-muted-foreground">
                {pedido.length}/{MAX_PEDIDO}
              </span>
            </div>
            <Textarea
              id="pedido-arte"
              value={pedido}
              onChange={(e) => setPedido(e.target.value.slice(0, MAX_PEDIDO))}
              rows={3}
              placeholder={
                trilha === 'imagem'
                  ? 'Ex: a picanha na tábua sendo servida na mesa, fim de tarde, movimento do salão ao fundo'
                  : 'Ex: clima de fim de tarde, título em destaque no rodapé'
              }
              className="resize-none"
            />
          </section>

          <section className="space-y-2">
            <Label>Referências do acervo</Label>
            <ArteIaImagePicker
              projectId={projectId}
              referencias={referencias}
              onChange={setReferencias}
              papelPadrao={papelPadrao}
            />
          </section>

          {trilha === 'arte' && (
            <section className="space-y-2">
              <button
                type="button"
                onClick={() => setMostrarInstrucao((v) => !v)}
                className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
              >
                <ChevronDown
                  className={cn('h-4 w-4 transition-transform', mostrarInstrucao && 'rotate-180')}
                />
                Ajustar a foto (opcional)
              </button>
              {mostrarInstrucao && (
                <div className="space-y-1">
                  <Textarea
                    value={instrucaoImagem}
                    onChange={(e) => setInstrucaoImagem(e.target.value.slice(0, 500))}
                    rows={2}
                    placeholder="Ex: escurecer levemente o fundo atrás do bloco de texto"
                    className="resize-none"
                  />
                  <p className="text-xs text-muted-foreground">
                    Por padrão a foto NÃO é alterada — a arte é a foto original com os textos e a
                    logo por cima. O que você escrever aqui é o único ajuste autorizado.
                  </p>
                </div>
              )}
            </section>
          )}
        </div>

        <DialogFooter className="flex-col items-stretch gap-2 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-xs text-muted-foreground">
            {impedimento ?? `Pronto para gerar · ${custo}`}
          </p>
          <div className="flex gap-2">
            <Button variant="outline" onClick={fechar}>
              Cancelar
            </Button>
            <Button onClick={enviar} disabled={!!impedimento || enviando}>
              <Sparkles className="mr-2 h-4 w-4" />
              {enviando ? 'Iniciando…' : `Gerar (${custo})`}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function TrilhaCard({
  ativa,
  onClick,
  icone,
  titulo,
  descricao,
}: {
  ativa: boolean
  onClick: () => void
  icone: React.ReactNode
  titulo: string
  descricao: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'rounded-lg border-2 p-3 text-left transition-colors',
        ativa ? 'border-primary bg-primary/5' : 'border-border/60 hover:border-primary/40',
      )}
    >
      <span className="flex items-center gap-1.5 text-sm font-medium">
        {icone}
        {titulo}
      </span>
      <span className="mt-1 block text-[11px] leading-snug text-muted-foreground">{descricao}</span>
    </button>
  )
}
