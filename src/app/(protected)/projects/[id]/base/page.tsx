'use client'

/**
 * Base de conhecimento do projeto — tela de CORREÇÃO RÁPIDA, pensada para o
 * celular (mas confortável no desktop).
 *
 * O cenário é o dono do restaurante avisando "o preço mudou" no meio do dia:
 * quem cuida do Instagram abre isto no celular, acha a entrada pela busca,
 * troca o texto e salva. Criação de entrada nova e upload de arquivo
 * continuam na página /knowledge — aqui é conferir, corrigir e arquivar.
 *
 * Contrato real das rotas (`/api/knowledge*`):
 * - O PUT atualiza só os campos enviados; o novo texto SUBSTITUI o `content`
 *   inteiro (não é acréscimo) e a rota reindexa sozinha quando ele muda.
 * - Arquivar é PUT de `status: 'ARCHIVED'` — o DELETE apaga de vez, com os
 *   vetores, e por isso não aparece nesta tela.
 * - `expiresAt` vencido não é limpo pela rota na hora: o cron diário arquiva.
 *   Até lá a entrada segue ACTIVE e vencida — é o que o banner do topo caça,
 *   com "Arquivar" de um toque.
 */

import * as React from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import { toast } from 'sonner'
import type { KnowledgeCategory } from '@prisma/client'
import { usePageMetadata } from '@/contexts/page-metadata'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import {
  useBaseDoProjeto,
  useAtualizarEntradaBase,
  useArquivarEntradaBase,
  type KnowledgeBaseEntry,
} from '@/hooks/use-base-conhecimento'
import { BookOpen, Archive, CalendarClock, Pencil, Search, Loader2 } from 'lucide-react'

/** Rótulos em português — espelham as categorias do enum `KnowledgeCategory`. */
const ROTULO_CATEGORIA: Record<KnowledgeCategory, string> = {
  ESTABELECIMENTO_INFO: 'Sobre o estabelecimento',
  HORARIOS: 'Horários',
  CARDAPIO: 'Cardápio',
  DELIVERY: 'Delivery',
  CAMPANHAS: 'Campanhas',
  DIFERENCIAIS: 'Diferenciais',
  POLITICAS: 'Políticas',
  FAQ: 'Perguntas frequentes',
  TOM_DE_VOZ: 'Tom de voz (legado)',
}

/** Ordem de exibição: o que muda com mais frequência vem primeiro. */
const ORDEM_CATEGORIAS = Object.keys(ROTULO_CATEGORIA) as KnowledgeCategory[]

/** Quantos dias antes do prazo a entrada entra no banner de atenção. */
const DIAS_DE_AVISO = 7

/**
 * Data em pt-BR no fuso de Brasília. O `expiresAt` gravado como fim do dia 31
 * é 03:00 UTC do dia 1º — formatar em UTC mostraria o dia seguinte.
 */
function formatarDataBR(valor: string): string {
  const data = new Date(valor)
  return Number.isNaN(data.getTime())
    ? valor
    : data.toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' })
}

/** Busca sem acento e sem caixa: "cardapio" acha "Cardápio". */
function normalizar(texto: string): string {
  return texto
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
}

type SituacaoPrazo = 'vencida' | 'vencendo' | 'com-prazo' | 'sem-prazo'

function situacaoDoPrazo(entry: KnowledgeBaseEntry, agora: number): SituacaoPrazo {
  if (!entry.expiresAt) return 'sem-prazo'
  const prazo = new Date(entry.expiresAt).getTime()
  if (Number.isNaN(prazo)) return 'sem-prazo'
  if (prazo <= agora) return 'vencida'
  if (prazo <= agora + DIAS_DE_AVISO * 24 * 60 * 60 * 1000) return 'vencendo'
  return 'com-prazo'
}

export default function BaseDoProjetoPage() {
  const params = useParams()
  const projectId = Number(params.id)

  // Mesmo padrão das outras telas do projeto (bancada, agenda): o menu do
  // layout já situa a pessoa, o breadcrumb automático só repetiria.
  const { setMetadata } = usePageMetadata()
  React.useEffect(() => {
    setMetadata({ showBreadcrumbs: false })
    return () => setMetadata({ showBreadcrumbs: true })
  }, [setMetadata])

  const { data, isLoading, error } = useBaseDoProjeto(projectId)
  const atualizarMutation = useAtualizarEntradaBase(projectId)
  const arquivarMutation = useArquivarEntradaBase(projectId)

  const [busca, setBusca] = React.useState('')
  const [emEdicao, setEmEdicao] = React.useState<KnowledgeBaseEntry | null>(null)
  const [novoTexto, setNovoTexto] = React.useState('')
  /** Qual entrada o "Arquivar" do banner está processando, para o spinner certo. */
  const [arquivandoId, setArquivandoId] = React.useState<string | null>(null)

  // Um relógio por render é suficiente: a tela vive aberta por minutos, não
  // por dias, e evita chip mudando entre cards da mesma lista.
  const agora = Date.now()

  const entradas = React.useMemo(() => data?.entries ?? [], [data?.entries])

  const entradasFiltradas = React.useMemo(() => {
    const termo = normalizar(busca.trim())
    if (!termo) return entradas
    return entradas.filter((entry) => {
      const alvo = normalizar(
        `${entry.title} ${entry.content} ${(entry.tags ?? []).join(' ')}`,
      )
      return alvo.includes(termo)
    })
  }, [entradas, busca])

  /** Vencidas e vencendo, para o banner — sempre sobre a lista COMPLETA, não a
   *  filtrada: prazo estourado precisa aparecer mesmo com busca digitada. */
  const comPrazoEstourando = React.useMemo(
    () =>
      entradas
        .filter((entry) => {
          const situacao = situacaoDoPrazo(entry, agora)
          return situacao === 'vencida' || situacao === 'vencendo'
        })
        .sort(
          (a, b) =>
            new Date(a.expiresAt as string).getTime() -
            new Date(b.expiresAt as string).getTime(),
        ),
    [entradas, agora],
  )

  const grupos = React.useMemo(() => {
    const porCategoria = new Map<KnowledgeCategory, KnowledgeBaseEntry[]>()
    for (const entry of entradasFiltradas) {
      const lista = porCategoria.get(entry.category) ?? []
      lista.push(entry)
      porCategoria.set(entry.category, lista)
    }
    return ORDEM_CATEGORIAS.filter((cat) => porCategoria.has(cat)).map((cat) => ({
      categoria: cat,
      entradas: porCategoria.get(cat)!,
    }))
  }, [entradasFiltradas])

  const abrirEdicao = React.useCallback((entry: KnowledgeBaseEntry) => {
    setEmEdicao(entry)
    setNovoTexto(entry.content)
  }, [])

  const fecharEdicao = React.useCallback(() => {
    setEmEdicao(null)
    setNovoTexto('')
  }, [])

  const salvarTexto = React.useCallback(async () => {
    if (!emEdicao) return
    const texto = novoTexto.trim()
    if (!texto) {
      toast.error('O novo texto não pode ficar vazio')
      return
    }
    try {
      // O objeto completo do que a entrada é hoje + o texto novo. `expiresAt`
      // fica de fora DE PROPÓSITO: ausente = a rota não mexe no prazo.
      await atualizarMutation.mutateAsync({
        id: emEdicao.id,
        title: emEdicao.title,
        content: texto,
        tags: emEdicao.tags ?? [],
        category: emEdicao.category,
        status: emEdicao.status,
      })
      toast.success('Salvo na base', {
        description: 'O texto novo substituiu o antigo e já vale para os próximos textos.',
      })
      fecharEdicao()
    } catch (erro) {
      toast.error('Não foi possível salvar', {
        description: erro instanceof Error ? erro.message : 'Tente de novo em instantes.',
      })
    }
  }, [emEdicao, novoTexto, atualizarMutation, fecharEdicao])

  const arquivar = React.useCallback(
    async (entry: KnowledgeBaseEntry) => {
      setArquivandoId(entry.id)
      try {
        await arquivarMutation.mutateAsync(entry.id)
        toast.success('Entrada arquivada', {
          description: `"${entry.title}" deixou de alimentar os textos.`,
        })
        if (emEdicao?.id === entry.id) fecharEdicao()
      } catch (erro) {
        toast.error('Não foi possível arquivar', {
          description: erro instanceof Error ? erro.message : 'Tente de novo em instantes.',
        })
      } finally {
        setArquivandoId(null)
      }
    },
    [arquivarMutation, emEdicao, fecharEdicao],
  )

  if (Number.isNaN(projectId)) {
    return (
      <Card className="p-6">
        <p className="text-sm text-muted-foreground">Projeto não encontrado.</p>
      </Card>
    )
  }

  return (
    <div className="mx-auto w-full max-w-3xl space-y-4 pb-8">
      <div>
        <h1 className="text-lg font-semibold md:text-xl">Base de conhecimento</h1>
        <p className="text-sm text-muted-foreground">
          É daqui que saem preço, horário e promoção dos textos. Corrija o que mudou e
          arquive o que acabou.
        </p>
      </div>

      {/* Banner de prazos: o que venceu (ou está para vencer) pede uma decisão
          de um toque — campanha encerrada sujando os textos é o defeito que
          esta tela existe para evitar. */}
      {comPrazoEstourando.length > 0 && (
        <Card className="border-amber-500/40 bg-amber-500/10 p-4">
          <div className="flex items-center gap-2">
            <CalendarClock className="h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
            <h2 className="text-sm font-semibold text-amber-700 dark:text-amber-300">
              Prazos pedindo atenção
            </h2>
          </div>
          <ul className="mt-3 space-y-2">
            {comPrazoEstourando.map((entry) => {
              const vencida = situacaoDoPrazo(entry, agora) === 'vencida'
              return (
                <li key={entry.id} className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => abrirEdicao(entry)}
                    className="min-w-0 flex-1 text-left"
                  >
                    <span className="block truncate text-sm font-medium">{entry.title}</span>
                    <span
                      className={
                        vencida
                          ? 'text-xs text-red-600 dark:text-red-400'
                          : 'text-xs text-amber-700 dark:text-amber-400'
                      }
                    >
                      {vencida
                        ? `Venceu em ${formatarDataBR(entry.expiresAt as string)} — já não alimenta os textos`
                        : `Vence em ${formatarDataBR(entry.expiresAt as string)}`}
                    </span>
                  </button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-8 shrink-0 gap-1.5"
                    disabled={arquivandoId === entry.id}
                    onClick={() => void arquivar(entry)}
                  >
                    {arquivandoId === entry.id ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Archive className="h-3.5 w-3.5" />
                    )}
                    Arquivar
                  </Button>
                </li>
              )
            })}
          </ul>
        </Card>
      )}

      {/* Busca client-side: a lista inteira já está na tela, filtrar aqui é
          instantâneo e funciona até com a conexão ruim do salão. */}
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          placeholder="Buscar por título, texto ou tag..."
          className="pl-9"
          inputMode="search"
        />
      </div>

      {isLoading ? (
        <div className="space-y-3">
          <Skeleton className="h-5 w-40" />
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-24 w-full" />
        </div>
      ) : error ? (
        <Card className="p-6">
          <p className="text-sm text-destructive">
            Não foi possível carregar a base deste projeto.
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            {error instanceof Error ? error.message : 'Tente atualizar a página.'}
          </p>
        </Card>
      ) : entradas.length === 0 ? (
        <Card className="p-8 text-center">
          <BookOpen className="mx-auto mb-3 h-10 w-10 text-muted-foreground" />
          <h2 className="text-base font-semibold">A base deste projeto está vazia</h2>
          <p className="mx-auto mt-1 max-w-sm text-sm text-muted-foreground">
            Cadastre horários, cardápio e campanhas para os textos nascerem certos.
          </p>
          <Button asChild variant="outline" className="mt-4">
            <Link href={`/knowledge?projectId=${projectId}`}>Adicionar conhecimento</Link>
          </Button>
        </Card>
      ) : entradasFiltradas.length === 0 ? (
        <Card className="p-6 text-center">
          <p className="text-sm text-muted-foreground">
            Nada encontrado para &ldquo;{busca.trim()}&rdquo;.
          </p>
        </Card>
      ) : (
        grupos.map(({ categoria, entradas: entradasDoGrupo }) => (
          <section key={categoria}>
            <h2 className="mb-2 flex items-baseline gap-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
              {ROTULO_CATEGORIA[categoria]}
              <span className="text-xs font-normal normal-case tracking-normal">
                {entradasDoGrupo.length}
              </span>
            </h2>
            <div className="space-y-2">
              {entradasDoGrupo.map((entry) => {
                const situacao = situacaoDoPrazo(entry, agora)
                return (
                  <Card key={entry.id} className="p-3">
                    <button
                      type="button"
                      onClick={() => abrirEdicao(entry)}
                      className="flex w-full items-start gap-3 text-left"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                          <span className="text-sm font-medium">{entry.title}</span>
                          {situacao !== 'sem-prazo' && (
                            <span
                              className={
                                situacao === 'vencida'
                                  ? 'inline-flex items-center gap-1 rounded-full bg-red-500/15 px-2 py-0.5 text-[11px] font-medium text-red-600 dark:text-red-400'
                                  : situacao === 'vencendo'
                                    ? 'inline-flex items-center gap-1 rounded-full bg-amber-500/15 px-2 py-0.5 text-[11px] font-medium text-amber-700 dark:text-amber-400'
                                    : 'inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground'
                              }
                            >
                              <CalendarClock className="h-3 w-3" />
                              {situacao === 'vencida'
                                ? `venceu ${formatarDataBR(entry.expiresAt as string)}`
                                : `vence ${formatarDataBR(entry.expiresAt as string)}`}
                            </span>
                          )}
                        </div>
                        <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">
                          {entry.content}
                        </p>
                      </div>
                      <span
                        aria-hidden
                        className="mt-0.5 shrink-0 rounded-md border border-border/60 p-1.5 text-muted-foreground"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </span>
                    </button>
                  </Card>
                )
              })}
            </div>
          </section>
        ))
      )}

      {data && data.pagination.total > entradas.length && (
        <p className="text-center text-xs text-muted-foreground">
          Mostrando {entradas.length} de {data.pagination.total} entradas — refine pela
          busca ou use a página Base de Conhecimento completa.
        </p>
      )}

      {/* Painel de edição: sobe do rodapé no celular, onde o polegar alcança.
          O texto atual fica visível e intocável em cima do campo novo — a
          pessoa corrige COMPARANDO, não de memória. */}
      <Sheet open={emEdicao !== null} onOpenChange={(aberto) => !aberto && fecharEdicao()}>
        <SheetContent
          side="bottom"
          className="max-h-[88dvh] overflow-y-auto rounded-t-xl"
        >
          {emEdicao && (
            <div className="mx-auto flex w-full max-w-2xl flex-col gap-4 px-4 pb-4">
              <SheetHeader className="px-0 pb-0">
                <SheetTitle className="pr-8">{emEdicao.title}</SheetTitle>
                <SheetDescription>
                  {ROTULO_CATEGORIA[emEdicao.category]}
                  {emEdicao.expiresAt
                    ? ` · vale até ${formatarDataBR(emEdicao.expiresAt)}`
                    : ''}
                </SheetDescription>
              </SheetHeader>

              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Texto atual</Label>
                <div className="max-h-36 overflow-y-auto whitespace-pre-wrap rounded-md border bg-muted/50 p-3 text-sm text-muted-foreground">
                  {emEdicao.content}
                </div>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="novo-texto">Novo texto</Label>
                <Textarea
                  id="novo-texto"
                  value={novoTexto}
                  onChange={(e) => setNovoTexto(e.target.value)}
                  rows={7}
                  className="text-sm"
                />
                <p className="text-xs text-muted-foreground">
                  O novo texto substitui a entrada inteira — não é acréscimo.
                </p>
              </div>

              <div className="flex flex-col gap-2 sm:flex-row sm:justify-between">
                <Button
                  variant="outline"
                  className="gap-1.5 text-muted-foreground"
                  disabled={arquivandoId === emEdicao.id}
                  onClick={() => void arquivar(emEdicao)}
                >
                  {arquivandoId === emEdicao.id ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Archive className="h-4 w-4" />
                  )}
                  Arquivar entrada
                </Button>
                <Button
                  className="sm:min-w-40"
                  disabled={atualizarMutation.isPending || !novoTexto.trim()}
                  onClick={() => void salvarTexto()}
                >
                  {atualizarMutation.isPending ? 'Salvando...' : 'Salvar na base'}
                </Button>
              </div>
            </div>
          )}
        </SheetContent>
      </Sheet>
    </div>
  )
}
