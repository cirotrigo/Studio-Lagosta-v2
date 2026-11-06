'use client'

/**
 * A vitrine de modelos do cliente (S5, 06/11/2026): busca, chips de formato e de tema, e UM cartão por modelo com
 * uma ação principal (Usar). É o mesmo componente da aba Modelos do projeto e do painel do editor (S7, `compact`).
 *
 * Regra (filtros, tags técnicas, ordem) em `src/lib/modelos/vitrine.ts`; dados do `GET /api/projects/[id]/modelos`.
 * Não existe excluir: "Tirar dos modelos" despromove (`docs/regras/modelos.md`).
 */

import * as React from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useQuery } from '@tanstack/react-query'
import { AlertTriangle, Copy, Loader2, MoreVertical, Pencil, Search, StarOff, Tag } from 'lucide-react'
// O Toaster montado no layout é o do `use-toast`; o do sonner não está montado (toast de 'sonner' some).
import { toast } from '@/hooks/use-toast'

import { api } from '@/lib/api-client'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { TagInput } from '@/components/projects/tag-input'
import { useIsMobile } from '@/hooks/use-media-query'
import { useProjectTags } from '@/hooks/use-project-tags'
import { useDuplicarModelo, useUsarModelo, type ModeloDoProjeto } from '@/hooks/use-modelos-do-projeto'
import { useTirarDosModelos, useUpdateTemplatePageTags } from '@/hooks/use-template-page-tags'
import {
  PROPORCAO_DO_FORMATO,
  ROTULO_DO_FORMATO,
  chipsDeTema,
  ehDaAssinatura,
  filtrarEOrdenar,
  formatosPresentes,
  rotuloDeUso,
  tagsDeTema,
  type FormatoDoModelo,
} from '@/lib/modelos/vitrine'

export interface ModelosGridProps {
  projectId: number
  modelos: ModeloDoProjeto[]
  canCurate: boolean
  /** Painel do editor: duas colunas, só o botão Usar. */
  compact?: boolean
  /** Esconde os chips de formato e mostra só este formato. */
  formatoFixo?: FormatoDoModelo
  /** Painel do editor (S7): quando vem, o Usar chama isto em vez de criar a cópia em Avulsas. Os botões ficam
   *  desabilitados até a promessa terminar. */
  onUsar?: (modelo: ModeloDoProjeto) => void | Promise<void>
}

const mensagemDe = (erro: unknown, padrao: string) => (erro instanceof Error && erro.message ? erro.message : padrao)

/** Os pilares aprovados do cliente, no mesmo cache da seção de pilares (`content-pillars-section.tsx`). */
function usePilaresAprovados(projectId: number): string[] {
  const { data } = useQuery<{ pilares: Array<{ slug: string; aprovado?: boolean }> }>({
    queryKey: ['content-pillars', projectId],
    queryFn: () => api.get(`/api/projects/${projectId}/pilares`),
    enabled: projectId > 0,
    staleTime: 60_000,
  })
  return React.useMemo(() => (data?.pilares ?? []).filter((p) => p.aprovado).map((p) => p.slug), [data])
}

function Chip({ ativo, onClick, children }: { ativo: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={ativo}
      className={cn(
        'shrink-0 whitespace-nowrap rounded-full border px-3 py-1 text-xs font-medium transition-colors',
        ativo
          ? 'border-primary bg-primary text-primary-foreground'
          : 'border-border text-muted-foreground hover:bg-muted hover:text-foreground',
      )}
    >
      {children}
    </button>
  )
}

export function ModelosGrid({ projectId, modelos, canCurate, compact, formatoFixo, onUsar }: ModelosGridProps) {
  const router = useRouter()
  const isMobile = useIsMobile()
  const pilares = usePilaresAprovados(projectId)
  const usar = useUsarModelo(projectId)
  const duplicar = useDuplicarModelo(projectId)
  const tirar = useTirarDosModelos(projectId)

  const [busca, setBusca] = React.useState('')
  const [formato, setFormato] = React.useState<FormatoDoModelo | null>(null)
  const [tema, setTema] = React.useState<string | null>(null)
  const [acoesDe, setAcoesDe] = React.useState<ModeloDoProjeto | null>(null)
  const [tagsDe, setTagsDe] = React.useState<ModeloDoProjeto | null>(null)
  const [usandoDeFora, setUsandoDeFora] = React.useState<string | null>(null)

  const doFormato = React.useMemo(
    () => (formatoFixo ? modelos.filter((m) => m.formato === formatoFixo) : modelos),
    [modelos, formatoFixo],
  )
  const formatos = React.useMemo(() => formatosPresentes(doFormato), [doFormato])
  // Só os temas que existem no formato escolhido: chip que leva a lista vazia não ajuda.
  const temas = React.useMemo(
    () => chipsDeTema(formato ? doFormato.filter((m) => m.formato === formato) : doFormato, pilares),
    [doFormato, formato, pilares],
  )
  const visiveis = React.useMemo(
    () => filtrarEOrdenar(doFormato, { busca, formato: formatoFixo ? null : formato, tema }),
    [doFormato, busca, formato, formatoFixo, tema],
  )

  // Chip que deixou de existir (o último modelo do tema saiu) não pode prender a lista vazia.
  React.useEffect(() => {
    if (tema && !temas.includes(tema)) setTema(null)
  }, [tema, temas])

  const handleUsar = async (modelo: ModeloDoProjeto) => {
    if (onUsar) {
      setUsandoDeFora(modelo.id)
      try {
        await onUsar(modelo)
      } finally {
        setUsandoDeFora(null)
      }
      return
    }
    try {
      const copia = await usar.mutateAsync({ pageId: modelo.id })
      toast({ title: `Criamos uma cópia em ${copia.pastaNome}` })
      router.push(copia.editorUrl)
    } catch (erro) {
      toast({ title: 'Não deu para usar o modelo', description: mensagemDe(erro, 'Tente de novo.'), variant: 'destructive', duration: 10_000 })
    }
  }

  const handleDuplicar = async (modelo: ModeloDoProjeto) => {
    try {
      const copia = await duplicar.mutateAsync({ pageId: modelo.id })
      toast({ title: `Modelo duplicado em ${copia.pastaNome}` })
    } catch (erro) {
      toast({ title: 'Não deu para duplicar', description: mensagemDe(erro, 'Tente de novo.'), variant: 'destructive', duration: 10_000 })
    }
  }

  /** Confirmação de uma frase, como a S1: a página continua na pasta e nos posts. A rota recusa (409) com a lista. */
  const handleTirar = async (modelo: ModeloDoProjeto) => {
    if (!window.confirm(`A página continua na pasta ${modelo.templateName} e nos posts que a usam. Tirar dos modelos?`))
      return
    try {
      const { congelados = [] } = await tirar.mutateAsync({ templateId: modelo.templateId, pageId: modelo.id })
      const n = congelados.length
      toast({
        title: `"${modelo.name}" saiu dos modelos`,
        description:
          n > 0
            ? `${n} post${n === 1 ? '' : 's'} já entregue${n === 1 ? '' : 's'} ao publicador sa${n === 1 ? 'i' : 'em'} com a arte anterior.`
            : undefined,
      })
    } catch (erro) {
      toast({
        title: 'Não deu para tirar dos modelos',
        description: mensagemDe(erro, 'Tente de novo.'),
        variant: 'destructive',
        duration: 12_000,
      })
    }
  }

  /** As ações do ⋮, as mesmas no menu do desktop e no Sheet do celular. */
  const acoesDoModelo = (modelo: ModeloDoProjeto) => {
    const assinatura = ehDaAssinatura(modelo)
    return [
      { chave: 'editar', rotulo: 'Editar', icone: Pencil, href: `/templates/${modelo.templateId}/editor?pageId=${modelo.id}` },
      canCurate && !assinatura && { chave: 'duplicar', rotulo: 'Duplicar', icone: Copy, onSelect: () => handleDuplicar(modelo) },
      canCurate && { chave: 'tags', rotulo: 'Tags', icone: Tag, onSelect: () => setTagsDe(modelo) },
      canCurate &&
        !assinatura && { chave: 'tirar', rotulo: 'Tirar dos modelos', icone: StarOff, onSelect: () => handleTirar(modelo) },
    ].filter(Boolean) as Array<{
      chave: string
      rotulo: string
      icone: typeof Pencil
      href?: string
      onSelect?: () => void
    }>
  }

  const limparFiltros = () => {
    setBusca('')
    setFormato(null)
    setTema(null)
  }

  return (
    <div className="space-y-4">
      <div className="space-y-3">
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative w-full min-w-0 sm:w-auto sm:max-w-sm sm:flex-1">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder="Buscar modelo ou tema…"
              className="pl-8"
              aria-label="Buscar modelo ou tema"
            />
          </div>
          {!formatoFixo && formatos.length > 1 && (
            <div className="flex items-center gap-1.5 overflow-x-auto" role="group" aria-label="Formato">
              <span className="shrink-0 text-xs text-muted-foreground">Formato:</span>
              <Chip ativo={formato === null} onClick={() => setFormato(null)}>
                Todos
              </Chip>
              {formatos.map((f) => (
                <Chip key={f} ativo={formato === f} onClick={() => setFormato(formato === f ? null : f)}>
                  {ROTULO_DO_FORMATO[f]}
                </Chip>
              ))}
            </div>
          )}
        </div>
        {temas.length > 0 && (
          <div className="-mx-1 flex items-center gap-1.5 overflow-x-auto px-1 pb-1" role="group" aria-label="Tema">
            <span className="shrink-0 text-xs text-muted-foreground">Tema:</span>
            <Chip ativo={tema === null} onClick={() => setTema(null)}>
              Todos
            </Chip>
            {temas.map((t) => (
              <Chip key={t} ativo={tema === t} onClick={() => setTema(tema === t ? null : t)}>
                {t}
              </Chip>
            ))}
          </div>
        )}
      </div>

      {visiveis.length === 0 ? (
        <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
          Nenhum modelo com esses filtros.{' '}
          <button type="button" onClick={limparFiltros} className="font-medium text-primary hover:underline">
            Limpar filtros
          </button>
        </div>
      ) : (
        <div
          className={cn(
            'grid gap-3',
            compact ? 'grid-cols-2' : 'grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6',
          )}
        >
          {visiveis.map((modelo) => (
            <CartaoDoModelo
              key={modelo.id}
              modelo={modelo}
              compact={compact}
              usando={usar.isPending || usandoDeFora !== null}
              usandoEste={(usar.isPending && usar.variables?.pageId === modelo.id) || usandoDeFora === modelo.id}
              onUsar={() => handleUsar(modelo)}
              menu={
                compact ? null : isMobile ? (
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-8 w-8 shrink-0"
                    aria-label={`Mais ações de ${modelo.name}`}
                    onClick={() => setAcoesDe(modelo)}
                  >
                    <MoreVertical className="h-4 w-4" />
                  </Button>
                ) : (
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-8 w-8 shrink-0"
                        aria-label={`Mais ações de ${modelo.name}`}
                      >
                        <MoreVertical className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      {acoesDoModelo(modelo).map((a) =>
                        a.href ? (
                          <DropdownMenuItem key={a.chave} asChild>
                            <Link href={a.href}>
                              <a.icone className="mr-2 h-4 w-4" />
                              {a.rotulo}
                            </Link>
                          </DropdownMenuItem>
                        ) : (
                          <DropdownMenuItem key={a.chave} onSelect={a.onSelect}>
                            <a.icone className="mr-2 h-4 w-4" />
                            {a.rotulo}
                          </DropdownMenuItem>
                        ),
                      )}
                    </DropdownMenuContent>
                  </DropdownMenu>
                )
              }
            />
          ))}
        </div>
      )}

      {/* Celular: o ⋮ abre de baixo. 🔴 `side="bottom"` não tem teto nem rolagem (`docs/regras/modelos.md`): os dois
          vão aqui, no uso. */}
      <Sheet open={acoesDe !== null} onOpenChange={(aberto) => !aberto && setAcoesDe(null)}>
        <SheetContent side="bottom" className="max-h-[80dvh] overflow-y-auto px-4 pb-6">
          <SheetHeader className="px-0">
            <SheetTitle className="truncate pr-6">{acoesDe?.name}</SheetTitle>
          </SheetHeader>
          <div className="flex flex-col">
            {acoesDe &&
              acoesDoModelo(acoesDe).map((a) =>
                a.href ? (
                  <Link
                    key={a.chave}
                    href={a.href}
                    className="flex items-center gap-3 rounded-md px-2 py-3 text-sm hover:bg-muted"
                  >
                    <a.icone className="h-4 w-4" />
                    {a.rotulo}
                  </Link>
                ) : (
                  <button
                    key={a.chave}
                    type="button"
                    onClick={() => {
                      setAcoesDe(null)
                      a.onSelect?.()
                    }}
                    className="flex items-center gap-3 rounded-md px-2 py-3 text-left text-sm hover:bg-muted"
                  >
                    <a.icone className="h-4 w-4" />
                    {a.rotulo}
                  </button>
                ),
              )}
          </div>
        </SheetContent>
      </Sheet>

      <TagsDoModeloDialog projectId={projectId} modelo={tagsDe} modelos={modelos} onClose={() => setTagsDe(null)} />
    </div>
  )
}

function CartaoDoModelo({
  modelo,
  compact,
  usando,
  usandoEste,
  onUsar,
  menu,
}: {
  modelo: ModeloDoProjeto
  compact?: boolean
  usando: boolean
  usandoEste: boolean
  onUsar: () => void
  menu: React.ReactNode
}) {
  const temas = tagsDeTema(modelo)
  const assinatura = ehDaAssinatura(modelo)
  return (
    <div className="flex min-w-0 flex-col overflow-hidden rounded-lg border bg-card">
      {/* A proporção vai em estilo inline: classe arbitrária com valor dinâmico não gera CSS neste repo. */}
      <div className="relative w-full bg-muted" style={{ aspectRatio: PROPORCAO_DO_FORMATO[modelo.formato] }}>
        {modelo.thumbnail ? (
          // `thumbnail` pode ser data URI ou URL de qualquer host: <img> direto, sem o loader do next/image.
          <img
            src={modelo.thumbnail}
            alt={modelo.name}
            loading="lazy"
            className="absolute inset-0 h-full w-full object-contain"
          />
        ) : (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-1 p-3 text-center">
            <span className="line-clamp-3 text-sm font-medium">{modelo.name}</span>
            <span className="text-[11px] text-muted-foreground">abra uma vez no editor para gerar a prévia</span>
          </div>
        )}
        {assinatura && (
          <span className="absolute left-2 top-2 rounded-full bg-background/90 px-2 py-0.5 text-[10px] font-semibold shadow-sm">
            Assinatura
          </span>
        )}
      </div>
      <div className="flex flex-1 flex-col gap-1.5 p-2.5">
        <p className="line-clamp-2 text-sm font-medium leading-snug" title={modelo.name}>
          {modelo.name}
        </p>
        <p className="flex items-center gap-1 text-[11px] text-muted-foreground">
          <span>{ROTULO_DO_FORMATO[modelo.formato]}</span>
          <span aria-hidden>·</span>
          <span>{rotuloDeUso(modelo.usedCount)}</span>
          {modelo.formatoDivergente && (
            <span title="A tag de formato discorda do tamanho da página" aria-label="A tag de formato discorda do tamanho da página">
              <AlertTriangle className="h-3 w-3 text-amber-500" aria-hidden />
            </span>
          )}
        </p>
        {!compact && temas.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {temas.slice(0, 3).map((t) => (
              <span key={t} className="max-w-full truncate rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
                {t}
              </span>
            ))}
            {temas.length > 3 && <span className="text-[10px] text-muted-foreground">+{temas.length - 3}</span>}
          </div>
        )}
        <div className="mt-auto flex items-center gap-1 pt-1">
          <Button size="sm" className="flex-1" onClick={onUsar} disabled={usando}>
            {usandoEste ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : null}
            Usar
          </Button>
          {menu}
        </div>
      </div>
    </div>
  )
}

/** O editor de tags do ⋮ (só o curador): o mesmo `PATCH .../template-pages/[pageId]/tags` do editor. */
function TagsDoModeloDialog({
  projectId,
  modelo,
  modelos,
  onClose,
}: {
  projectId: number
  modelo: ModeloDoProjeto | null
  modelos: ModeloDoProjeto[]
  onClose: () => void
}) {
  const atualizar = useUpdateTemplatePageTags(projectId)
  const projectTags = useProjectTags({ projectId, enabled: modelo !== null })
  const [rascunho, setRascunho] = React.useState<string[]>([])

  React.useEffect(() => {
    if (modelo) setRascunho(modelo.tags ?? [])
  }, [modelo])

  const sugestoes = React.useMemo(() => {
    const set = new Set<string>()
    for (const t of projectTags.data ?? []) if (t.name) set.add(t.name)
    for (const m of modelos) for (const t of tagsDeTema(m)) set.add(t)
    return [...set].sort((a, b) => a.localeCompare(b, 'pt-BR'))
  }, [projectTags.data, modelos])

  const salvar = async () => {
    if (!modelo) return
    try {
      await atualizar.mutateAsync({ pageId: modelo.id, tags: rascunho })
      toast({ title: 'Tags atualizadas' })
      onClose()
    } catch (erro) {
      toast({ title: 'Não deu para salvar as tags', description: mensagemDe(erro, 'Tente de novo.'), variant: 'destructive' })
    }
  }

  return (
    <Dialog open={modelo !== null} onOpenChange={(aberto) => !aberto && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="truncate pr-6">Tags · {modelo?.name}</DialogTitle>
        </DialogHeader>
        <TagInput value={rascunho} onChange={setRascunho} suggestions={sugestoes} placeholder="almoco-executivo, happy-hour..." />
        <p className="text-xs text-muted-foreground">
          É por elas que o Studio acha este modelo a partir de uma frase (&quot;faz o story de happy hour&quot;).
        </p>
        <DialogFooter className="gap-2 sm:gap-2">
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button onClick={salvar} disabled={atualizar.isPending}>
            {atualizar.isPending ? 'Salvando...' : 'Salvar tags'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
