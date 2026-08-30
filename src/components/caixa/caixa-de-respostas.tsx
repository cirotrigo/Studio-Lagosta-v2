'use client'

/**
 * Caixa de respostas — a fila de conversa da carteira, onde a equipe já tem
 * login. A IA propõe (rascunho pronto ou botão), a PESSOA edita e envia:
 * - Comentário de Instagram com token → publica daqui (Graph API).
 * - Comentário sem token e avaliação do Google → "copiar" (o envio da
 *   avaliação vive no Farol; o do comentário, no app do Instagram).
 */
import * as React from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { Textarea } from '@/components/ui/textarea'
import { useCaixaDeRespostas, useIgnorarItem, useProporRascunho, useResponderComentario, useSalvarResposta } from '@/hooks/use-caixa-de-respostas'
import type { AvaliacaoPendente, ComentarioPendente } from '@/lib/caixa/itens'
import { AlertCircle, Check, ChevronDown, ChevronRight, Clock, Copy, ExternalLink, EyeOff, Sparkles, Star } from 'lucide-react'

const dtBRT = new Intl.DateTimeFormat('pt-BR', {
  timeZone: 'America/Sao_Paulo',
  day: '2-digit',
  month: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
})

function ItemDaCaixa({
  item,
}: {
  item: ComentarioPendente | AvaliacaoPendente
}) {
  const comentario = item.tipo === 'comentario'
  const rascunhoInicial =
    item.tipo === 'avaliacao' ? (item.respostaAprovada ?? item.respostaSugerida ?? '') : ''
  const [texto, setTexto] = React.useState(rascunhoInicial)
  const [aviso, setAviso] = React.useState<string | null>(null)
  const [enviado, setEnviado] = React.useState(false)
  const [ignorado, setIgnorado] = React.useState(false)
  const [copiado, setCopiado] = React.useState(false)
  const [salvaEm, setSalvaEm] = React.useState<string | null>(
    item.tipo === 'avaliacao' ? item.respostaAprovadaEm : null,
  )
  const propor = useProporRascunho()
  const responder = useResponderComentario()
  const ignorar = useIgnorarItem()
  const salvar = useSalvarResposta()

  const salvarResposta = () => {
    if (item.tipo !== 'avaliacao' || !texto.trim()) return
    setAviso(null)
    salvar.mutate(
      { projectId: item.projectId, reviewId: item.reviewId, mensagem: texto.trim() },
      {
        onSuccess: () => setSalvaEm(new Date().toISOString()),
        onError: (e) => setAviso(e instanceof Error ? e.message : 'Não deu para salvar.'),
      },
    )
  }

  const ignorarItem = () => {
    setAviso(null)
    ignorar.mutate(
      item.tipo === 'comentario'
        ? { projectId: item.projectId, comentarioId: item.comentarioId }
        : { projectId: item.projectId, reviewId: item.reviewId },
      {
        onSuccess: () => setIgnorado(true),
        onError: (e) => setAviso(e instanceof Error ? e.message : 'Não deu para ignorar.'),
      },
    )
  }

  const pedirRascunho = () => {
    setAviso(null)
    propor.mutate(
      item.tipo === 'avaliacao'
        ? { projectId: item.projectId, reviewId: item.reviewId, ...(item.autor ? { autor: item.autor } : {}) }
        : {
            projectId: item.projectId,
            texto: item.texto,
            ...(item.legendaDoPost ? { legendaDoPost: item.legendaDoPost } : {}),
          },
      {
        onSuccess: (r) => setTexto(r.rascunho),
        onError: (e) => setAviso(e instanceof Error ? e.message : 'Não deu para gerar o rascunho.'),
      },
    )
  }

  const enviar = () => {
    if (item.tipo !== 'comentario' || !texto.trim()) return
    setAviso(null)
    responder.mutate(
      { projectId: item.projectId, comentarioId: item.comentarioId, mensagem: texto.trim() },
      {
        onSuccess: () => setEnviado(true),
        onError: (e) => setAviso(e instanceof Error ? e.message : 'Não deu para publicar.'),
      },
    )
  }

  const copiar = async () => {
    try {
      await navigator.clipboard.writeText(texto.trim())
      setCopiado(true)
      setTimeout(() => setCopiado(false), 2000)
    } catch {
      setAviso('Selecione o texto e copie manualmente.')
    }
  }

  return (
    <Card>
      <CardContent className="space-y-3 p-4">
        <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          <span className="text-sm font-semibold text-foreground">{item.cliente}</span>
          {item.tipo === 'avaliacao' ? (
            <span className="inline-flex items-center gap-1 text-amber-600 dark:text-amber-400">
              <Star className="h-3.5 w-3.5 fill-current" />
              {item.estrelas} de 5 · Google
            </span>
          ) : (
            <Badge variant="secondary">Instagram</Badge>
          )}
          {comentario && (item as ComentarioPendente).quente && <Badge variant="destructive">possível cliente</Badge>}
          <span>
            {item.tipo === 'avaliacao' && item.autor ? `${item.autor} · ` : ''}
            {dtBRT.format(new Date(item.quando))} BRT
          </span>
          {comentario && (item as ComentarioPendente).linkDoPost && (
            <a
              className="inline-flex items-center gap-1 underline-offset-2 hover:underline"
              href={(item as ComentarioPendente).linkDoPost as string}
              target="_blank"
              rel="noopener noreferrer"
            >
              ver o post <ExternalLink className="h-3 w-3" />
            </a>
          )}
        </div>

        <p className="text-sm">{item.texto ?? '(sem texto — só a nota)'}</p>

        {ignorado ? (
          <p className="inline-flex items-center gap-1.5 text-sm text-muted-foreground">
            <EyeOff className="h-4 w-4" /> Ignorado — não aparece mais na fila de ninguém.
          </p>
        ) : enviado ? (
          <p className="inline-flex items-center gap-1.5 text-sm font-medium text-green-600 dark:text-green-500">
            <Check className="h-4 w-4" /> Resposta publicada
          </p>
        ) : (
          <div className="space-y-2">
            <Textarea
              value={texto}
              onChange={(e) => setTexto(e.target.value)}
              placeholder="Escreva a resposta como o restaurante — ou peça um rascunho."
              rows={3}
              maxLength={item.tipo === 'avaliacao' ? 4096 : 2200}
            />
            <div className="flex flex-wrap items-center gap-2">
              <Button size="sm" variant="outline" onClick={pedirRascunho} disabled={propor.isPending}>
                <Sparkles className="mr-1.5 h-3.5 w-3.5" />
                {propor.isPending ? 'Gerando…' : texto ? 'Propor outra' : 'Propor resposta'}
              </Button>
              {comentario && (item as ComentarioPendente).enviaDaqui ? (
                <Button size="sm" onClick={enviar} disabled={responder.isPending || !texto.trim()}>
                  {responder.isPending ? 'Publicando…' : 'Publicar resposta'}
                </Button>
              ) : comentario ? (
                <Button size="sm" variant="secondary" onClick={copiar} disabled={!texto.trim()}>
                  <Copy className="mr-1.5 h-3.5 w-3.5" /> {copiado ? 'Copiado ✓' : 'Copiar resposta'}
                </Button>
              ) : (
                <Button size="sm" onClick={salvarResposta} disabled={salvar.isPending || !texto.trim()}>
                  {salvar.isPending ? 'Salvando…' : salvaEm ? 'Salvar de novo' : 'Salvar resposta'}
                </Button>
              )}
              <Button size="sm" variant="ghost" onClick={ignorarItem} disabled={ignorar.isPending}>
                <EyeOff className="mr-1.5 h-3.5 w-3.5" /> {ignorar.isPending ? 'Ignorando…' : 'Ignorar'}
              </Button>
              <span className="text-xs text-muted-foreground">
                {comentario
                  ? (item as ComentarioPendente).enviaDaqui
                    ? 'Sai público, em nome do cliente.'
                    : 'Sem token — copie e publique pelo Instagram.'
                  : 'Salva aqui; a publicação no Google sai na próxima rodada do Claude.'}
              </span>
            </div>
            {salvaEm && !comentario && (
              <p className="inline-flex items-center gap-1.5 text-xs font-medium text-green-600 dark:text-green-500">
                <Clock className="h-3.5 w-3.5" /> Resposta salva {dtBRT.format(new Date(salvaEm))} BRT — na fila de
                publicação.
              </p>
            )}
            {aviso && (
              <p className="inline-flex items-center gap-1.5 text-xs text-destructive">
                <AlertCircle className="h-3.5 w-3.5" /> {aviso}
              </p>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  )
}

/**
 * Seção colapsável — a equipe expande só a frente em que vai trabalhar
 * (pedido do Ciro, 30/08/2026). O estado é conveniência POR PESSOA
 * (localStorage, com try/catch: navegador sem storage rende o default).
 */
function Secao({
  chave,
  titulo,
  total,
  abertaPorPadrao,
  children,
}: {
  chave: string
  titulo: string
  total: number
  abertaPorPadrao: boolean
  children: React.ReactNode
}) {
  const [aberta, setAberta] = React.useState(() => {
    try {
      const salvo = localStorage.getItem(`caixa.secao.${chave}`)
      return salvo === null ? abertaPorPadrao : salvo === '1'
    } catch {
      return abertaPorPadrao
    }
  })
  const alternar = () => {
    setAberta((v) => {
      try {
        localStorage.setItem(`caixa.secao.${chave}`, v ? '0' : '1')
      } catch {
        /* sem storage, sem memória — só o estado da tela */
      }
      return !v
    })
  }
  return (
    <section className="space-y-3">
      <button
        type="button"
        onClick={alternar}
        className="flex w-full items-center gap-2 text-left text-sm font-semibold uppercase tracking-wide text-muted-foreground hover:text-foreground"
        aria-expanded={aberta}
      >
        {aberta ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
        {titulo} · {total}
      </button>
      {aberta && children}
    </section>
  )
}

export function CaixaDeRespostasPainel() {
  const { data, isLoading, error } = useCaixaDeRespostas()
  const [filtro, setFiltro] = React.useState<number | null>(null)

  if (isLoading) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-24 w-full" />
      </div>
    )
  }
  if (error || !data) {
    return (
      <p className="text-sm text-muted-foreground">Não deu para carregar a caixa agora — recarregue em instantes.</p>
    )
  }

  const comentarios = data.comentarios.filter((c) => !filtro || c.projectId === filtro)
  const avaliacoes = data.avaliacoes.filter((a) => !filtro || a.projectId === filtro)
  const negativas = avaliacoes.filter((a) => a.estrelas <= 3)
  const positivas = avaliacoes.filter((a) => a.estrelas > 3)

  return (
    <div className="space-y-6">
      {data.clientes.length > 1 && (
        <div className="flex flex-wrap gap-1.5">
          <Button size="sm" variant={filtro === null ? 'default' : 'outline'} onClick={() => setFiltro(null)}>
            Todos
          </Button>
          {data.clientes.map((c) => (
            <Button
              key={c.projectId}
              size="sm"
              variant={filtro === c.projectId ? 'default' : 'outline'}
              onClick={() => setFiltro(c.projectId)}
            >
              {c.nome}
            </Button>
          ))}
        </div>
      )}

      <Secao chave="comentarios" titulo="Comentários no Instagram" total={comentarios.length} abertaPorPadrao>
        {comentarios.length ? (
          comentarios.map((c) => <ItemDaCaixa key={c.comentarioId} item={c} />)
        ) : (
          <p className="text-sm text-muted-foreground">Nenhum comentário aguardando. 🎉</p>
        )}
      </Secao>

      <Secao chave="negativas" titulo="Avaliações negativas no Google" total={negativas.length} abertaPorPadrao>
        {negativas.length ? (
          negativas.map((a) => <ItemDaCaixa key={a.reviewId} item={a} />)
        ) : (
          <p className="text-sm text-muted-foreground">Nenhuma negativa sem resposta. 👌</p>
        )}
      </Secao>

      {positivas.length > 0 && (
        <Secao chave="positivas" titulo="Avaliações a agradecer" total={positivas.length} abertaPorPadrao={false}>
          <>{positivas.slice(0, 30).map((a) => (
            <ItemDaCaixa key={a.reviewId} item={a} />
          ))}</>
        </Secao>
      )}
    </div>
  )
}
