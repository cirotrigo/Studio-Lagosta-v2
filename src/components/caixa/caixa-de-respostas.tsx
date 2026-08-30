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
import { useCaixaDeRespostas, useProporRascunho, useResponderComentario } from '@/hooks/use-caixa-de-respostas'
import type { AvaliacaoPendente, ComentarioPendente } from '@/lib/caixa/itens'
import { AlertCircle, Check, Copy, ExternalLink, Sparkles, Star } from 'lucide-react'

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
  const rascunhoInicial = item.tipo === 'avaliacao' ? (item.respostaSugerida ?? '') : ''
  const [texto, setTexto] = React.useState(rascunhoInicial)
  const [aviso, setAviso] = React.useState<string | null>(null)
  const [enviado, setEnviado] = React.useState(false)
  const [copiado, setCopiado] = React.useState(false)
  const propor = useProporRascunho()
  const responder = useResponderComentario()

  const pedirRascunho = () => {
    setAviso(null)
    propor.mutate(
      item.tipo === 'avaliacao'
        ? { projectId: item.projectId, reviewId: item.reviewId, ...(item.autor ? { autor: item.autor } : {}) }
        : { projectId: item.projectId, texto: item.texto },
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

        {enviado ? (
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
              ) : (
                <Button size="sm" variant="secondary" onClick={copiar} disabled={!texto.trim()}>
                  <Copy className="mr-1.5 h-3.5 w-3.5" /> {copiado ? 'Copiado ✓' : 'Copiar resposta'}
                </Button>
              )}
              <span className="text-xs text-muted-foreground">
                {comentario
                  ? (item as ComentarioPendente).enviaDaqui
                    ? 'Sai público, em nome do cliente.'
                    : 'Sem token — copie e publique pelo Instagram.'
                  : 'Avaliação se responde pelo Farol ou no Google — copie o texto revisado.'}
              </span>
            </div>
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

      <section className="space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Comentários no Instagram · {comentarios.length}
        </h2>
        {comentarios.length ? (
          comentarios.map((c) => <ItemDaCaixa key={c.comentarioId} item={c} />)
        ) : (
          <p className="text-sm text-muted-foreground">Nenhum comentário aguardando. 🎉</p>
        )}
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Avaliações negativas no Google · {negativas.length}
        </h2>
        {negativas.length ? (
          negativas.map((a) => <ItemDaCaixa key={a.reviewId} item={a} />)
        ) : (
          <p className="text-sm text-muted-foreground">Nenhuma negativa sem resposta. 👌</p>
        )}
      </section>

      {positivas.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            Avaliações a agradecer · {positivas.length}
          </h2>
          {positivas.slice(0, 30).map((a) => (
            <ItemDaCaixa key={a.reviewId} item={a} />
          ))}
        </section>
      )}
    </div>
  )
}
