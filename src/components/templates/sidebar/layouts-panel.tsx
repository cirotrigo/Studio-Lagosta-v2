'use client'

import * as React from 'react'
import { Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { ApiError } from '@/lib/api-client'
import { formatoDaPaginaGravada } from '@/lib/compositor/formato'
import { useTemplateEditor } from '@/contexts/template-editor-context'
import { useMultiPage } from '@/contexts/multi-page-context'
import { usePageSync } from '@/components/templates/page-sync-wrapper'
import {
  useAbrirPaginaCriada,
  useCriarPaginaDeLayout,
  useLayouts,
  type CaixaDoLayout,
  type LayoutDaVitrine,
  type PaginaDeLayoutCriada,
} from '@/hooks/use-layouts'
import { useToast } from '@/hooks/use-toast'

const ROTULO: Record<string, string> = {
  pre: 'Pré-título',
  headline: 'Título',
  apoio: 'Apoio',
  servico: 'Serviço',
  cta: 'Chamada',
  logo: 'logo',
}
const ACENTO: Record<string, string> = {
  'fio-fino': 'fio fino',
  'moldura-aberta': 'moldura aberta',
  'spark-4': 'brilho',
  cantoneiras: 'cantoneiras nos 4 cantos',
  'pilula-contorno': 'pílula de contorno',
}

/**
 * A prévia HTML do layout, pela técnica do ComboCard: caixa com a proporção do formato, `container-type` e as
 * referências do arquétipo em % (texto em cqw). Não renderiza a marca — só onde cada papel pousa.
 */
const FOTO_NEUTRA = 'linear-gradient(160deg, #3a3a3a 0%, #1c1c1c 55%, #0f0f0f 100%)'

function PreviaDoLayout({
  geometria,
  formato,
  semFoto = false,
  caixaDaFoto,
  mascaraDaFoto,
}: {
  geometria: Record<string, CaixaDoLayout>
  formato: 'story' | 'feed'
  /** #15: layout sem foto — fundo liso CLARO neutro (não a cor da marca) e tinta escura. */
  semFoto?: boolean
  /** #8: a foto numa caixa (o gradiente neutro de "foto" só nela); o texto fica no liso claro neutro, em tinta escura. */
  caixaDaFoto?: CaixaDoLayout
  /**
   * #9: o topo da caixa em arco — o path 0–100 da vitrine esticado na caixa (`preserveAspectRatio="none"`), como a barra de
   * imagem desenha as máscaras e como o editor e o servidor desenham a da peça; o gradiente neutro de "foto" só dentro dele.
   * `gradiente` é o id do `<linearGradient>`, determinístico (um por card e formato).
   */
  mascaraDaFoto?: { path: string; gradiente: string }
}) {
  const noLiso = semFoto || !!caixaDaFoto
  return (
    <div
      className="relative w-full overflow-hidden"
      data-fundo={caixaDaFoto ? 'foto-em-caixa' : semFoto ? 'liso-claro' : 'foto'}
      style={{
        containerType: 'inline-size',
        aspectRatio: formato === 'story' ? '9 / 16' : '4 / 5',
        // inline, como no ComboCard: fundo escuro de "foto" para o branco aparecer; sem foto, um claro neutro
        background: noLiso ? '#F2F0EB' : FOTO_NEUTRA,
      }}
    >
      {caixaDaFoto && (
        <span
          data-caixa-da-foto
          className="absolute"
          style={{
            left: `${caixaDaFoto.x * 100}%`,
            top: `${caixaDaFoto.y * 100}%`,
            width: `${caixaDaFoto.w * 100}%`,
            height: `${caixaDaFoto.h * 100}%`,
            ...(mascaraDaFoto ? {} : { background: FOTO_NEUTRA }),
          }}
        >
          {/* A proporção da CAIXA no svg: no celular o globals.css força `svg { height: auto !important }`, e o viewBox
              0–100 o deixaria quadrado (o arco cortado embaixo); com ela a altura é a da caixa nos dois casos. */}
          {mascaraDaFoto && (
            <svg
              data-mascara-da-foto
              viewBox="0 0 100 100"
              preserveAspectRatio="none"
              className="absolute inset-0 h-full w-full"
              style={{ aspectRatio: formato === 'story' ? `${caixaDaFoto.w * 9} / ${caixaDaFoto.h * 16}` : `${caixaDaFoto.w * 4} / ${caixaDaFoto.h * 5}` }}
            >
              <defs>
                <linearGradient id={mascaraDaFoto.gradiente} x1="0.33" y1="0" x2="0.67" y2="1">
                  <stop offset="0" stopColor="#3a3a3a" />
                  <stop offset="0.55" stopColor="#1c1c1c" />
                  <stop offset="1" stopColor="#0f0f0f" />
                </linearGradient>
              </defs>
              <path d={mascaraDaFoto.path} fill={`url(#${mascaraDaFoto.gradiente})`} />
            </svg>
          )}
        </span>
      )}
      {Object.entries(geometria).map(([papel, c]) => (
        <span
          key={papel}
          className={`absolute flex items-start overflow-hidden rounded-[2px] border border-dashed ${noLiso ? 'border-neutral-800/50' : 'border-white/40'}`}
          style={{
            left: `${c.x * 100}%`,
            top: `${c.y * 100}%`,
            width: `${c.w * 100}%`,
            height: `${c.h * 100}%`,
          }}
        >
          <span
            className={`px-[2cqw] leading-tight ${noLiso ? 'text-neutral-900' : 'text-white'}`}
            style={{
              fontSize: papel === 'headline' ? '7cqw' : '3.6cqw',
              fontWeight: papel === 'headline' ? 700 : 400,
            }}
          >
            {ROTULO[papel] ?? papel}
          </span>
        </span>
      ))}
    </div>
  )
}

function CardDoLayout({
  layout,
  formato,
  bloqueio,
  motivoNoCard,
  criando,
  ocupado,
  onUsar,
}: {
  layout: LayoutDaVitrine
  formato: 'story' | 'feed'
  bloqueio: string | null
  /** O motivo só deste card; o bloqueio geral (sem assinatura, formato da página) é dito uma vez, no topo. */
  motivoNoCard: string | null
  criando: boolean
  ocupado: boolean
  onUsar: () => void
}) {
  const acentos = layout.elementos.map((e) => `${ACENTO[e.tipo] ?? e.tipo}${e.porItem ? ' em cada item' : ''}`)
  const semFoto = layout.fundo === 'liso-claro'
  const caixaDaFoto = layout.fundo === 'foto-em-caixa' ? layout.caixaDaFoto?.[formato] : undefined
  const mascara = caixaDaFoto ? layout.mascaraDaFoto?.[formato] : undefined
  // A legenda diz onde a caixa está (R-01): a do #8 começa no topo; a do #9 desce, com o topo em arco; a do #10 é uma
  // coluna (largura parcial), à direita ou à esquerda.
  const legendaDaCaixa =
    caixaDaFoto && caixaDaFoto.w < 1
      ? caixaDaFoto.x > 0
        ? 'Foto à direita · fundo da marca à esquerda'
        : 'Foto à esquerda · fundo da marca à direita'
      : caixaDaFoto && caixaDaFoto.y > 0
        ? `Foto embaixo${mascara ? ' com o topo em arco' : ''} · fundo da marca em cima`
        : 'Foto no alto · fundo da marca embaixo'
  return (
    <div className="space-y-2 rounded-md border border-border/40 p-2" data-layout={layout.id}>
      <PreviaDoLayout geometria={layout.geometria[formato] ?? {}} formato={formato} semFoto={semFoto} caixaDaFoto={caixaDaFoto} mascaraDaFoto={mascara ? { path: mascara.path, gradiente: `foto-${layout.id}-${formato}` } : undefined} />
      <div className="space-y-0.5">
        <p className="text-xs font-medium leading-snug">{layout.nome}</p>
        {semFoto && <p className="text-[11px] text-muted-foreground">Sem foto · fundo claro da marca</p>}
        {layout.fundo === 'foto-em-caixa' && <p className="text-[11px] text-muted-foreground">{legendaDaCaixa}</p>}
        {acentos.length > 0 && <p className="text-[11px] text-muted-foreground">Acento: {acentos.join(', ')}</p>}
      </div>
      <Button
        size="sm"
        className="w-full"
        disabled={!!bloqueio || ocupado}
        onClick={onUsar}
        title={bloqueio ?? undefined}
      >
        {criando ? <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" /> : null}
        {criando ? 'Criando página…' : 'Usar layout'}
      </Button>
      {motivoNoCard && <p className="text-[11px] leading-snug text-muted-foreground">{motivoNoCard}</p>}
    </div>
  )
}

/**
 * A aba Layouts (CP-T2): cada card cria uma PÁGINA NOVA a partir da página aberta, logo depois dela, e o editor
 * navega para ela. A página aberta não muda (d07). Sem foto, a rota responde 409 e o painel de imagens abre.
 */
export function LayoutsPanel({ onPrecisaDeFoto }: { onPrecisaDeFoto?: () => void }) {
  const { toast } = useToast()
  const { templateId } = useTemplateEditor()
  const { currentPage, setCurrentPageId } = useMultiPage()
  const pageSync = usePageSync()
  const vitrine = useLayouts(templateId ?? null)
  const criar = useCriarPaginaDeLayout()
  const abrirPagina = useAbrirPaginaCriada()
  const [criandoId, setCriandoId] = React.useState<string | null>(null)
  // A página que a rota CRIOU e o editor ainda não conseguiu abrir: enquanto existir, nenhum card cria outra — a
  // recuperação é só abrir (GET), nunca um POST de novo (rodada 1, P2-2).
  const [criadaSemAbrir, setCriadaSemAbrir] = React.useState<PaginaDeLayoutCriada | null>(null)
  const [abrindo, setAbrindo] = React.useState(false)

  const formato = currentPage ? formatoDaPaginaGravada(currentPage) : null
  const disponiveis = (vitrine.data?.arquetipos ?? []).filter((a) => a.disponibilidade === 'disponivel')

  const abrirCriada = async (criada: PaginaDeLayoutCriada) => {
    setAbrindo(true)
    try {
      await abrirPagina(templateId, criada.pageId)
      // No contínuo, quem ativa é o workspace (prévia da página que sai + rolagem até a nova, mesmo que o slot ainda
      // não tenha montado) — o mesmo evento da PagesBar. Sem ouvinte (clássico, celular), a troca direta abaixo basta;
      // repetida depois do evento, ela é um no-op (R-01 do QA integrado: a página nova ficava fora da viewport)
      window.dispatchEvent(new CustomEvent('lagosta:activate-page', { detail: criada.pageId }))
      setCurrentPageId(criada.pageId)
      setCriadaSemAbrir(null)
      const fora = criada.foraDoLayout.length
      toast({
        title: 'Página criada com o layout',
        description: [
          criada.placeholders.length > 0 ? 'Troque os textos de exemplo.' : null,
          fora > 0 ? `${fora} texto(s) da página não entraram no layout.` : null,
          'A página original continua igual.',
        ]
          .filter(Boolean)
          .join(' '),
      })
    } catch (erro) {
      setCriadaSemAbrir(criada)
      toast({
        title: 'A página foi criada, mas não abriu',
        description: `${erro instanceof Error ? erro.message : 'Erro desconhecido'}. Ela já existe: use "Abrir página criada", sem criar de novo.`,
        variant: 'destructive',
      })
    } finally {
      setAbrindo(false)
    }
  }

  const usar = async (layout: LayoutDaVitrine) => {
    if (!currentPage) return
    setCriandoId(layout.id)
    try {
      // A rota lê a origem do BANCO: a edição ainda no autosave ficaria fora do layout.
      await pageSync?.descarregar()
      const criada = await criar.mutateAsync({
        templateId,
        arquetipo: { id: layout.id, versao: layout.versao },
        aPartirDaPagina: currentPage.id,
      })
      await abrirCriada(criada)
    } catch (erro) {
      const semFoto = erro instanceof ApiError && erro.status === 409
      toast({
        title: semFoto ? 'Escolha uma foto primeiro' : 'Não deu para usar o layout',
        description: erro instanceof Error ? erro.message : 'Erro desconhecido',
        variant: semFoto ? undefined : 'destructive',
      })
      if (semFoto) onPrecisaDeFoto?.()
    } finally {
      setCriandoId(null)
    }
  }

  if (vitrine.isLoading) {
    return (
      <div className="grid grid-cols-2 gap-3" aria-busy="true">
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} className="aspect-[9/16] w-full" />
        ))}
      </div>
    )
  }
  if (vitrine.isError) {
    return (
      <div className="space-y-2 text-sm">
        <p className="text-muted-foreground">Não deu para carregar os layouts.</p>
        <Button size="sm" variant="outline" onClick={() => vitrine.refetch()}>
          Tentar de novo
        </Button>
      </div>
    )
  }

  const bloqueioGeral =
    vitrine.data?.assinatura.disponivel === false
      ? (vitrine.data.assinatura.motivo ?? 'A marca não tem página de assinatura.')
      : formato !== 'story' && formato !== 'feed'
        ? 'Os layouts são para páginas Story ou Feed.'
        : null

  return (
    // Bloco, não coluna flex: com altura fixa (drawer do celular) a coluna encolhia os filhos e um card invadia o outro.
    <div className="h-full space-y-3 overflow-y-auto pb-4">
      <p className="text-[11px] leading-snug text-muted-foreground">
        Cria uma página nova com o layout, usando os textos desta página (e a foto, nos layouts com foto). A página atual não muda.
      </p>
      {criadaSemAbrir && (
        <div
          role="alert"
          data-criada-sem-abrir
          className="space-y-2 rounded-md border border-border/60 bg-muted/40 p-2 text-[11px] leading-snug"
        >
          <p>A página do layout foi criada, mas a lista de páginas não recarregou. Abra-a antes de criar outra.</p>
          <Button
            size="sm"
            variant="outline"
            className="w-full"
            disabled={abrindo}
            onClick={() => abrirCriada(criadaSemAbrir)}
          >
            {abrindo ? <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" /> : null}
            Abrir página criada
          </Button>
        </div>
      )}
      {bloqueioGeral && (
        <p role="status" className="rounded-md border border-border/60 bg-muted/40 p-2 text-[11px] leading-snug">
          {bloqueioGeral}
        </p>
      )}
      <div className="grid grid-cols-2 gap-3">
        {disponiveis.map((layout) => {
          const doCard =
            formato && !layout.formatos.includes(formato as 'story' | 'feed')
              ? 'Este layout não tem este formato.'
              : null
          return (
            <CardDoLayout
              key={layout.id}
              layout={layout}
              formato={formato === 'feed' ? 'feed' : 'story'}
              bloqueio={bloqueioGeral ?? doCard}
              motivoNoCard={bloqueioGeral ? null : doCard}
              criando={criandoId === layout.id}
              ocupado={criandoId !== null || !currentPage || !!criadaSemAbrir || abrindo}
              onUsar={() => usar(layout)}
            />
          )
        })}
      </div>
    </div>
  )
}
