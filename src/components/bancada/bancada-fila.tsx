'use client'

/**
 * Fila de cards da bancada — o que está sendo produzido agora, mais recente
 * primeiro (é fila, não grade semanal).
 *
 * Cada card mostra a ação seguinte do seu estado, e só ela: rascunho gera,
 * pronto agenda, erro tenta de novo. Card gerando não oferece nada — a página
 * se atualiza sozinha.
 */

import * as React from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { Loader2, Sparkles, Trash2, CopyPlus, Calendar, CalendarRange, Pencil, Play, RefreshCw, ExternalLink, Maximize2, AlertTriangle, LayoutTemplate, BellRing, Images } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { cn } from '@/lib/utils'
import { useBancada } from '@/hooks/use-bancada'
import {
  useExecutarPlano,
  useFilaDoPlano,
  useProporSemana,
  type ResultadoExecutarPlano,
} from '@/hooks/use-planos'
import { itemExecutavel } from '@/lib/planos/execucao'
import { BancadaPreview, type PreviewSlide } from '@/components/bancada/bancada-preview'
import {
  formatarQuandoBR,
  ordenarPorDataDesc,
  referenciasParaServidor,
  situacaoParaExibir,
  type BancadaItemComCandidatas,
} from '@/lib/planos/para-bancada'
import type { CandidataDeFoto } from '@/lib/planos/proposta-de-semana'
import { FotoCandidatas } from '@/components/bancada/foto-candidatas'
import { BancadaEditarItem, type EdicaoDoItem } from '@/components/bancada/bancada-editar-item'
import {
  BancadaEscolhaDeModelo,
  type BaseDaArte,
} from '@/components/bancada/bancada-escolha-de-modelo'
import { useAnexarItensAoPlano, useAtualizarItemDoPlano } from '@/hooks/use-planos'
import { useToast } from '@/hooks/use-toast'
import { itemEditavel, progressoDoPlano, ROTULO_DO_STATUS, VIAS, type StatusDoItem } from '@/lib/planos/vocabulario'
import { useBancadaStore, type BancadaItem, type NovoItem } from '@/stores/bancada-store'

const ROTULO: Record<BancadaItem['status'], string> = {
  rascunho: 'na fila',
  gerando: 'gerando…',
  'guia-pronto': 'confira o estilo',
  pronto: 'pronta',
  erro: 'falhou',
  agendado: 'na agenda',
}

const COR: Record<BancadaItem['status'], string> = {
  rascunho: 'bg-slate-500/15 text-slate-300',
  gerando: 'bg-primary/15 text-primary',
  'guia-pronto': 'bg-sky-500/15 text-sky-400',
  pronto: 'bg-emerald-500/15 text-emerald-400',
  erro: 'bg-destructive/15 text-destructive',
  agendado: 'bg-amber-500/15 text-amber-400',
}

/**
 * O card do plano fala o vocabulário do PLANO, que é mais fino: "na fila" da
 * bancada cobre proposto, editado, aprovado, reprovado e a espera da fila de
 * geração, e essas cinco coisas são diferentes para quem combinou a leva. Os
 * rótulos vêm de `ROTULO_DO_STATUS` — nunca escritos à mão aqui, porque jargão
 * de banco na tela é a regra que esta casa mais repete.
 */
const COR_DO_PLANO: Record<StatusDoItem, string> = {
  proposto: 'bg-slate-500/15 text-slate-300',
  editado: 'bg-slate-500/15 text-slate-300',
  aprovado: 'bg-sky-500/15 text-sky-400',
  reprovado: 'bg-destructive/15 text-destructive',
  'na-fila': 'bg-slate-500/15 text-slate-300',
  gerando: 'bg-primary/15 text-primary',
  pronto: 'bg-emerald-500/15 text-emerald-400',
  erro: 'bg-destructive/15 text-destructive',
  agendado: 'bg-amber-500/15 text-amber-400',
}

/**
 * CRIVO DESATIVADO em 11/08/2026, por decisão do Ciro: a conferência (~15-20s
 * de LLM) + a leitura item a item ATRASAVAM o agendamento a ponto de ninguém
 * querer usar. O aprendizado de dois dias de crivo: porta no fim do fluxo
 * vira pedágio, e pedágio se paga sem ler — não importa quão boa a
 * conferência seja.
 *
 * O código inteiro segue vivo e dormente (`bancada-crivo.tsx`,
 * `crivo-avaliacao.ts`, a rota `/crivo/avaliar`, `useCrivoAvaliacao`): o
 * plano é as MESMAS perguntas entrarem na F3 como insumo da GERAÇÃO da copy
 * — regra respeitada no nascimento não precisa de porteiro na saída.
 * Religar o portão é restaurar o bloco `pendente`/`BancadaCrivo` deste
 * arquivo (histórico no git: commit que introduziu este comentário).
 */
export function BancadaFila({ projectId }: { projectId: number }) {
  const {
    itens,
    gerar,
    gerarPorModelo,
    gerarCapaEGuia,
    confirmarEstilo,
    agendar,
    atualizar,
    descartar,
  } = useBancada(projectId)
  const patchDoPlano = useAtualizarItemDoPlano(projectId)
  const { toast } = useToast()
  const adicionarNaFila = useBancadaStore((s) => s.adicionar)
  const anexarAoPlano = useAnexarItensAoPlano(projectId)

  /**
   * Duplicar o card: o MESMO briefing (copy, foto, pedido), com a BASE da
   * arte em aberto — a arte de referência estrelada e o modelo do editor
   * ficam para trás de propósito, porque duplicar existe para escolhê-los de
   * novo (pedido do Ciro, 17/08/2026).
   *
   * O duplicado vai para o PLANO, como o "Adicionar à fila" do compositor —
   * não é cosmética: o seletor de modelos do editor só existe em card do
   * plano (`podeMontarNoModelo`), porque o render pelo editor acontece no
   * ItemDePlano. Card local só na falha de rede, dita no toast — e aí a via
   * template fica indisponível até sincronizar, mesma regra do compositor.
   *
   * `depoisDe` põe o card novo COLADO ao original — quem duplica está
   * comparando, e um card no topo de uma fila longa some da vista.
   */
  const duplicar = React.useCallback(
    (item: BancadaItem) => {
      const duplicado: NovoItem = {
        projectId,
        tipo: 'peca',
        trilha: item.trilha,
        formato: item.formato,
        copy: [...item.copy],
        pedido: item.pedido,
        instrucaoImagem: item.instrucaoImagem ?? null,
        via: item.via,
        // O modelo do editor escolhido não viaja — é a "referência" da via
        // template, e a rotação assume até alguém escolher outro.
        sourcePageId: null,
        escopo: item.escopo,
        tema: item.tema ?? null,
        // O horário VIAJA junto (pedido do Ciro, 17/08/2026): quem duplica está
        // refazendo a arte daquele slot, e o card antigo costuma ser removido em
        // seguida. O risco de dois cards no mesmo horário existe, mas agendar é
        // ação explícita — quem agendar os dois foi avisado pela própria tela.
        quando: item.quando ?? null,
        motivoDoSlot: item.motivoDoSlot ?? null,
        referencias: item.referencias.filter((r) => !(r.papel === 'style' && r.generationId)),
      }
      const cena = duplicado.referencias.find((r) => r.papel === 'subject')
      const referencias = referenciasParaServidor(duplicado.referencias)
      anexarAoPlano.mutate(
        [
          {
            quando: item.quando ?? null,
            tema: item.tema ?? (item.pedido.trim() || item.copy[0] || null),
            copyProposta: [...item.copy],
            fotoDriveId: cena?.driveFileId ?? null,
            fotoUrl: cena?.url ?? null,
            ...(referencias.length > 0 ? { referencias } : {}),
            formato: item.formato,
            via: item.via ?? null,
            escopo: item.escopo && item.escopo !== 'ROTINA' ? item.escopo.toLowerCase() : null,
          },
        ],
        {
          onSuccess: (r) => {
            adicionarNaFila(
              {
                ...duplicado,
                itemDePlanoId: r.criados[0],
                planoId: r.plano.id,
                situacaoNoPlano: 'proposto',
              },
              { depoisDe: item.id },
            )
            toast({
              title: 'Duplicado',
              description: 'O card novo está logo abaixo — escolha a base da arte e gere.',
            })
          },
          onError: () => {
            adicionarNaFila(duplicado, { depoisDe: item.id })
            toast({
              title: 'Duplicado só neste navegador',
              description:
                'Não consegui gravar na fila da equipe — a via pelo editor fica indisponível até sincronizar.',
              variant: 'destructive',
            })
          },
        },
      )
    },
    [adicionarNaFila, anexarAoPlano, projectId, toast],
  )

  /**
   * A escolha da BASE da arte: o store primeiro (a tela responde na hora) e o
   * servidor junto, no que tem coluna — `via` e `sourcePageId` vivem no
   * ItemDePlano, e é lá que o chat e os outros navegadores leem a mesma
   * decisão. A ARTE DE REFERÊNCIA escolhida fica no navegador por decisão
   * (13/08/2026, sem migration): ela viaja como referência `style` do card,
   * mesma regra das âncoras extras, e o runner pula o rodízio ao vê-la.
   */
  const escolherBase = React.useCallback(
    (item: BancadaItem, base: BaseDaArte) => {
      if (base.via === 'template') {
        atualizar(item.id, { via: 'template', sourcePageId: base.sourcePageId })
      } else {
        // Troca SÓ a escolha anterior de referência (a entrada `style` com
        // generationId) — foto de estilo do acervo, âncoras e a cena ficam.
        const extras = item.referencias.filter((r) => !(r.papel === 'style' && r.generationId))
        atualizar(item.id, {
          via: 'ia',
          referencias: base.referencia
            ? [
                ...extras,
                {
                  papel: 'style' as const,
                  url: base.referencia.url,
                  thumbUrl: base.referencia.url,
                  generationId: base.referencia.generationId,
                  label: 'arte de referência',
                },
              ]
            : extras,
        })
      }
      if (item.itemDePlanoId && item.planoId && itemEditavel(situacaoParaExibir(item))) {
        patchDoPlano.mutate(
          {
            planoId: item.planoId,
            itemId: item.itemDePlanoId,
            via: base.via,
            ...(base.via === 'template' ? { sourcePageId: base.sourcePageId } : {}),
          },
          {
            onError: () => {
              toast({
                title: 'A escolha não chegou à equipe',
                description:
                  'Ficou só neste navegador — o Gerar ainda vai usá-la, mas vale escolher de novo quando a conexão voltar.',
                variant: 'destructive',
              })
            },
          },
        )
      }
    },
    [atualizar, patchDoPlano, toast],
  )

  /**
   * Salva a edição do card: o store primeiro (a tela responde na hora) e, se o
   * card veio do plano e o item ainda é editável lá, o servidor junto —
   * `copyProposta`, `legenda`, a foto e, desde 23/08/2026, a direção adicional
   * (`direcao`) e o ajuste da foto (`ajusteDaFoto`) têm coluna no ItemDePlano.
   * Antes os dois últimos ficavam só no navegador, e o `executar-plano` mandava
   * o NOME DO TEMA como pedido ao modelo.
   */
  const salvarEdicao = React.useCallback(
    (item: BancadaItem, e: EdicaoDoItem) => {
      atualizar(item.id, {
        copy: e.copy,
        legenda: e.legenda ?? undefined,
        pedido: e.pedido,
        instrucaoImagem: e.instrucaoImagem,
        referencias: e.referencias,
      })
      if (item.itemDePlanoId && item.planoId && itemEditavel(item.situacaoNoPlano ?? 'proposto')) {
        const cena = e.referencias.find((r) => r.papel === 'subject')
        // A lista inteira viaja; o espelho fotoDriveId/fotoUrl vai junto para o
        // caso de lista vazia (o serviço deriva o espelho da lista quando ela
        // existe, então mandar os dois nunca diverge).
        patchDoPlano.mutate(
          {
            planoId: item.planoId,
            itemId: item.itemDePlanoId,
            copyProposta: e.copy,
            legenda: e.legenda,
            fotoDriveId: cena?.driveFileId ?? null,
            fotoUrl: cena?.url ?? null,
            referencias: referenciasParaServidor(e.referencias),
            direcao: e.pedido?.trim() || null,
            ajusteDaFoto: e.instrucaoImagem?.trim() || null,
          },
          {
            // Sem isto a falha era MUDA: a tela de quem editou mostrava a
            // mudança (o store local já tinha gravado) e a equipe continuava
            // vendo a versão antiga — o pior tipo de divergência, porque cada
            // um jura que está certo.
            onError: () => {
              toast({
                title: 'A edição não chegou à equipe',
                description:
                  'Ficou só neste navegador. Confira a conexão e salve de novo — os outros ainda veem a versão anterior.',
                variant: 'destructive',
              })
            },
          },
        )
      }
    },
    [atualizar, patchDoPlano],
  )
  /**
   * A troca de foto em 1 toque (F4): AÇÃO do usuário, pela MESMA via da edição
   * do card — o store primeiro (a tela responde na hora) e o PATCH do item
   * junto, porque a hidratação reescreve as referências com o que o servidor
   * tem ("o servidor manda no CONTEÚDO"): uma troca só-local seria desfeita no
   * refetch seguinte. A cena é substituída NO LUGAR; âncoras e a arte de
   * referência estrelada ficam como estão. O sinal de aprendizado é postado
   * pelo próprio `FotoCandidatas` — aqui é só a foto.
   */
  const trocarFoto = React.useCallback(
    (item: BancadaItem, candidata: CandidataDeFoto) => {
      const nova = {
        papel: 'subject' as const,
        driveFileId: candidata.driveFileId,
        ...(candidata.fileName ? { label: candidata.fileName } : {}),
        // Mesma derivação do seletor completo: foto do acervo não tem URL
        // própria, a miniatura sai da rota de thumbnail com `size` explícito.
        thumbUrl: `/api/drive/thumbnail/${candidata.driveFileId}?size=400`,
      }
      const referencias = item.referencias.some((r) => r.papel === 'subject')
        ? item.referencias.map((r) => (r.papel === 'subject' ? nova : r))
        : [nova, ...item.referencias]
      atualizar(item.id, { referencias })
      if (item.itemDePlanoId && item.planoId && itemEditavel(situacaoParaExibir(item))) {
        patchDoPlano.mutate(
          {
            planoId: item.planoId,
            itemId: item.itemDePlanoId,
            fotoDriveId: candidata.driveFileId,
            fotoUrl: null,
            referencias: referenciasParaServidor(referencias),
          },
          {
            onError: () => {
              toast({
                title: 'A troca não chegou à equipe',
                description:
                  'A foto mudou só neste navegador — os outros ainda veem a anterior. Confira a conexão e troque de novo.',
                variant: 'destructive',
              })
            },
          },
        )
      }
    },
    [atualizar, patchDoPlano, toast],
  )

  /**
   * A leva combinada no servidor entra na MESMA fila — é o que faz o chat e a
   * bancada enxergarem o mesmo trabalho. A hidratação acontece dentro deste
   * hook; o que volta aqui serve só ao cabeçalho.
   */
  const { plano, carregando } = useFilaDoPlano(projectId)

  /**
   * O progresso da leva sai dos itens DA TELA, não do agregado que o servidor
   * mandou: quem acabou de clicar em Gerar precisa ver "1 gerando" na hora, e a
   * consulta seguinte só volta segundos depois.
   */
  const progresso = React.useMemo(() => {
    if (!plano) return null
    const doPlano = itens.filter((i) => i.itemDePlanoId && i.planoId === plano.id)
    if (doPlano.length === 0) return null
    return progressoDoPlano(doPlano.map((i) => ({ status: situacaoParaExibir(i) })))
  }, [itens, plano])

  const ordenados = React.useMemo(() => ordenarPorDataDesc(itens), [itens])

  // ── Propor a semana / produzir a leva ─────────────────────────────────────
  const propor = useProporSemana(projectId)
  const executar = useExecutarPlano(projectId)
  const [conta, setConta] = React.useState<ResultadoExecutarPlano | null>(null)
  const [contaAberta, setContaAberta] = React.useState(false)

  /**
   * Quantos itens da leva o servidor aceitaria produzir agora. A mesma régua do
   * serviço (`itemExecutavel`, módulo puro), aplicada aos itens DA TELA —
   * carrossel fica de fora porque `executar-plano` o pula (o estilo do guia
   * exige confirmação humana).
   */
  const executaveis = React.useMemo(() => {
    if (!plano) return 0
    return itens.filter(
      (i) =>
        i.itemDePlanoId &&
        i.planoId === plano.id &&
        i.tipo !== 'carrossel' &&
        itemExecutavel(situacaoParaExibir(i)),
    ).length
  }, [itens, plano])

  const proporAgora = React.useCallback(() => {
    propor.mutate(undefined, {
      onSuccess: (r) => {
        toast({
          title: r.coldStart ? 'Semana montada como ponto de partida' : 'Semana proposta',
          description: [r.mensagem, r.avisos[0]].filter(Boolean).join(' '),
        })
      },
      onError: (erro) => {
        toast({
          title: 'Não deu para montar a semana',
          description: erro instanceof Error ? erro.message : 'Tente de novo em instantes.',
          variant: 'destructive',
        })
      },
    })
  }, [propor, toast])

  /** 1ª chamada: só a conta — nada é produzido nem cobrado. Abre o diálogo. */
  const abrirConta = React.useCallback(async () => {
    try {
      const r = await executar.pedirConta(plano?.id)
      setConta(r)
      setContaAberta(true)
    } catch (erro) {
      toast({
        title: 'Não deu para calcular a produção',
        description: erro instanceof Error ? erro.message : 'Tente de novo em instantes.',
        variant: 'destructive',
      })
    }
  }, [executar, plano?.id, toast])

  /** 2ª chamada, só do botão Confirmar do diálogo: produz de verdade. */
  const confirmarProducao = React.useCallback(async () => {
    try {
      const r = await executar.confirmar(plano?.id)
      setContaAberta(false)
      setConta(null)
      toast({ title: 'Produção iniciada', description: r.mensagem })
    } catch (erro) {
      toast({
        title: 'A produção não começou',
        description: erro instanceof Error ? erro.message : 'Tente de novo em instantes.',
        variant: 'destructive',
      })
    }
  }, [executar, plano?.id, toast])

  const botaoPropor = (
    <Button size="sm" variant="outline" onClick={proporAgora} disabled={propor.isPending}>
      {propor.isPending ? (
        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
      ) : (
        <CalendarRange className="mr-2 h-4 w-4" />
      )}
      {propor.isPending ? 'Montando a semana…' : 'Propor a semana'}
    </Button>
  )

  if (itens.length === 0) {
    return (
      <div className="space-y-3 rounded-xl border border-dashed border-border/60 py-12 text-center">
        <p className="text-sm text-muted-foreground">
          {carregando
            ? 'Procurando a leva combinada…'
            : 'A fila está vazia. Monte um item acima, ou deixe o Studio propor a semana inteira.'}
        </p>
        {!carregando && (
          <>
            <div className="flex justify-center">{botaoPropor}</div>
            <p className="mx-auto max-w-md text-xs text-muted-foreground">
              O Studio monta horários, assuntos, fotos e textos a partir da rotina do cliente.
              Nada é produzido nem cobrado — a leva chega aqui como proposta, para ajustar antes.
            </p>
          </>
        )}
      </div>
    )
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border/60 bg-card/40 px-3 py-2">
        <div className="min-w-0">
          <p className="text-sm font-medium">{plano?.titulo || 'Fila de produção'}</p>
          {progresso && <p className="text-xs text-muted-foreground">{progresso.frase}</p>}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {botaoPropor}
          {executaveis > 0 && (
            <Button size="sm" onClick={abrirConta} disabled={executar.executando}>
              {executar.executando ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Play className="mr-2 h-4 w-4" />
              )}
              Executar o plano · {executaveis} {executaveis === 1 ? 'item' : 'itens'}
            </Button>
          )}
        </div>
      </div>
      <DialogoDaConta
        aberta={contaAberta}
        onOpenChange={(aberta) => {
          setContaAberta(aberta)
          if (!aberta) setConta(null)
        }}
        resultado={conta}
        confirmando={executar.executando}
        onConfirmar={confirmarProducao}
      />
      {ordenados.map((item) => (
        <Card
          key={item.id}
          item={item}
          projectId={projectId}
          onGerar={() => (item.tipo === 'carrossel' ? gerarCapaEGuia(item) : gerar(item))}
          onGerarPorModelo={() => gerarPorModelo(item)}
          onEscolherBase={(base) => escolherBase(item, base)}
          onConfirmarEstilo={() => confirmarEstilo(item)}
          onAgendar={(quando, situacao, opcoes) => agendar(item, quando, situacao, opcoes)}
          onRemover={() => descartar(item)}
          onDuplicar={item.tipo === 'carrossel' ? undefined : () => duplicar(item)}
          onSalvarEdicao={(e) => salvarEdicao(item, e)}
          onTrocarFoto={(candidata) => trocarFoto(item, candidata)}
        />
      ))}
    </div>
  )
}

function Card({
  item,
  projectId,
  onGerar,
  onGerarPorModelo,
  onEscolherBase,
  onConfirmarEstilo,
  onAgendar,
  onRemover,
  onDuplicar,
  onSalvarEdicao,
  onTrocarFoto,
}: {
  item: BancadaItem
  projectId: number
  onGerar: () => void
  onGerarPorModelo: () => void
  onEscolherBase: (base: BaseDaArte) => void
  onConfirmarEstilo: () => void
  onAgendar: (
    quando: string,
    situacao: 'rascunho' | 'agendado',
    opcoes?: { lembrete?: boolean },
  ) => void
  onRemover: () => void
  /**
   * Duplicar: mesmo briefing, base da arte em aberto. Ausente no carrossel —
   * os insumos de série vivem nos slides, e duplicar só a capa mentiria.
   */
  onDuplicar?: () => void
  onSalvarEdicao: (e: EdicaoDoItem) => void
  /** F4: trocar a foto do item por uma candidata da emissão, em 1 toque. */
  onTrocarFoto: (candidata: CandidataDeFoto) => void
}) {
  const [quando, setQuando] = React.useState(() => paraInputs(item.quando))
  /**
   * Publicação manual com lembrete — POR CARD e desligado por padrão, de
   * propósito: um padrão persistido seria o interruptor esquecido ligado
   * (mesma razão de `escopoPadrao` ficar fora do partialize do store).
   */
  const [lembrete, setLembrete] = React.useState(false)
  const ehCarrossel = item.tipo === 'carrossel'
  const slides = React.useMemo(
    () => (item.slides ?? []).slice().sort((a, b) => a.ordem - b.ordem),
    [item.slides],
  )
  /**
   * As candidatas de foto da emissão (F4). O tipo do store não declara o campo
   * de propósito — ele atravessa a hidratação pelo transporte
   * `BancadaItemComCandidatas` (ver `para-bancada.ts`). Item sem candidatas
   * (plano antigo, item montado à mão): nada muda no card.
   */
  const fotoCandidatas = (item as BancadaItemComCandidatas).fotoCandidatas ?? []
  const capa = ehCarrossel
    ? (slides[0]?.resultUrl ?? slides[0]?.referencia.thumbUrl)
    : (item.resultUrl ?? item.referencias.find((r) => r.papel === 'subject')?.thumbUrl)

  const quandoTexto = quando.data && quando.hora ? `${quando.data} ${quando.hora}` : ''
  const selo = formatarQuandoBR(quando.data, quando.hora)

  // Prévia: só o que JÁ virou arte. Miniatura de referência não entra — ver a
  // foto crua em tela cheia não ajuda a decidir se a peça está boa.
  const [previewAberta, setPreviewAberta] = React.useState(false)
  const [editando, setEditando] = React.useState(false)
  const [previewInicial, setPreviewInicial] = React.useState<number | undefined>()
  const slidesDaPreview: PreviewSlide[] = React.useMemo(() => {
    if (ehCarrossel) {
      return slides
        .filter((s) => s.resultUrl)
        .map((s) => ({
          ordem: s.ordem,
          url: s.resultUrl!,
          legenda: s.copy.length > 0 ? s.copy.join(' · ') : 'capa (foto pura)',
        }))
    }
    return item.resultUrl
      ? [{ ordem: 1, url: item.resultUrl, legenda: item.copy.join(' · ') || undefined }]
      : []
  }, [ehCarrossel, slides, item.resultUrl, item.copy])

  const podeVer = slidesDaPreview.length > 0
  const abrirPreview = (ordem?: number) => {
    if (!podeVer) return
    setPreviewInicial(ordem)
    setPreviewAberta(true)
  }

  const doPlano = !!item.itemDePlanoId
  const situacaoNoPlano = situacaoParaExibir(item)
  /**
   * Peça avulsa em rascunho/erro é editável; carrossel não (a edição por slide
   * é outro trabalho). Card do plano ainda exige que o ITEM seja editável lá —
   * um `na-fila` local cai fora, senão o PATCH voltaria recusado.
   */
  const podeEditar =
    !ehCarrossel &&
    (item.status === 'rascunho' || item.status === 'erro') &&
    (!doPlano || itemEditavel(situacaoNoPlano))
  const via = VIAS.find((v) => v.valor === (item.via ?? 'template'))
  /**
   * A via `template` monta a arte sobre um modelo já aprovado do cliente e não
   * gasta crédito de imagem — é o padrão do plano justamente por isso. Desde
   * 13/08/2026 a bancada TEM esse motor (`gerar-modelo`): o botão principal do
   * item de template monta no modelo, e a IA vira a escolha explícita com
   * preço — antes era o contrário, com a via barata em beco.
   */
  // "template" E "compor" usam o mesmo Gerar sem custo (a rota decide pela
  // via do item); só a IA tem o botão com preço.
  const viaTemplate = doPlano && (item.via ?? 'template') !== 'ia'
  /**
   * Montar no modelo só existe para peça única DA LEVA em estado editável: o
   * render acontece no item do plano (é lá que a escolha e o resultado ficam
   * para a equipe), e um `na-fila` local seria recusado pelo servidor.
   */
  const podeMontarNoModelo =
    !ehCarrossel && doPlano && itemEditavel(situacaoNoPlano)

  return (
    <div className="flex gap-3 rounded-xl border border-border/60 bg-card/40 p-3">
      {/* O selo de agenda ABRE o card, antes da foto: numa fila de leva
          semanal, QUANDO o post sai é a primeira coisa que se procura — e a
          data crua em "2026-08-11 14:30" obrigava a pessoa a decodificar o
          formato ISO para descobrir o dia da semana. */}
      {selo && (
        <div
          className="flex h-36 w-14 flex-shrink-0 flex-col items-center justify-center rounded-lg border border-border/60 bg-muted/30 text-center"
          title={selo.completo}
        >
          <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
            {selo.diaSemana}
          </span>
          <span className="text-2xl font-semibold leading-none">{selo.dia}</span>
          <span className="text-[10px] text-muted-foreground">{selo.mes}</span>
          {selo.hora && (
            <span className="mt-1.5 rounded bg-background px-1.5 py-0.5 text-[11px] font-medium tabular-nums">
              {selo.hora}
            </span>
          )}
        </div>
      )}

      {/* Miniatura em largura FIXA, sem variante responsiva: `sm:w-28` e
          `w-[7rem]` não geram CSS neste repo (medido em 09/08/2026 — a imagem
          ficava `w-full` e engolia o card). `w-28`/`h-36` geram. */}
      <button
        type="button"
        onClick={() => abrirPreview()}
        disabled={!podeVer}
        title={podeVer ? 'Ver em tamanho grande' : undefined}
        className={cn(
          'relative h-36 w-28 flex-shrink-0 overflow-hidden rounded-lg bg-muted/40',
          podeVer && 'cursor-zoom-in ring-offset-background hover:ring-2 hover:ring-primary/50',
        )}
      >
        {capa ? (
          <Image src={capa} alt="" fill sizes="112px" className="object-cover" unoptimized />
        ) : null}
        {item.status === 'gerando' && (
          <div className="absolute inset-0 flex items-center justify-center bg-background/70">
            <Loader2 className="h-5 w-5 animate-spin text-primary" />
          </div>
        )}
        {!podeVer && item.status !== 'gerando' && capa && (
          <span className="absolute bottom-1 left-1 rounded bg-background/80 px-1.5 py-0.5 text-[10px]">
            📷 referência
          </span>
        )}
        {/* O ícone minimalista de "tem mais de uma foto" (pedido de 23/08):
            a capa só mostra a cena, e sem a marca ninguém sabia que o item
            carregava âncoras/estilo junto. */}
        {!ehCarrossel && item.referencias.length > 1 && (
          <span
            className="absolute right-1 top-1 flex items-center gap-0.5 rounded bg-background/80 px-1 py-0.5 text-[10px] font-medium"
            title={`${item.referencias.length} fotos de referência nesta peça`}
          >
            <Images className="h-3 w-3" />
            {item.referencias.length}
          </span>
        )}
        {podeVer && (
          <span className="absolute bottom-1 right-1 rounded bg-background/80 p-1">
            <Maximize2 className="h-3 w-3" />
          </span>
        )}
      </button>

      <div className="min-w-0 flex-1 space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <span
            className={cn(
              'rounded-full px-2 py-0.5 text-[11px] font-medium',
              doPlano ? COR_DO_PLANO[situacaoNoPlano] : COR[item.status],
            )}
          >
            {doPlano ? ROTULO_DO_STATUS[situacaoNoPlano] : ROTULO[item.status]}
          </span>
          {/* De onde o card veio. Com as duas origens na mesma fila, saber qual
              é qual muda o que se espera do card: o do plano foi combinado
              antes e volta ao servidor a cada passo. */}
          <span
            className="rounded-full border border-border/60 px-2 py-0.5 text-[10px] text-muted-foreground"
            title={
              doPlano
                ? 'Veio da leva combinada — o que acontecer aqui volta para o plano.'
                : 'Montado aqui na bancada, só neste navegador.'
            }
          >
            {doPlano ? 'do plano' : 'montado aqui'}
          </span>
          {doPlano && via && (
            <span
              className="rounded-full border border-border/60 px-2 py-0.5 text-[10px] text-muted-foreground"
              title={via.custo}
            >
              {via.rotulo}
              {via.valor === 'template' ? ' · sem custo de imagem' : ''}
            </span>
          )}
          <span className="text-[11px] text-muted-foreground">
            {ehCarrossel
              ? `Carrossel · ${slides.length} slides`
              : item.formato === 'story'
                ? 'Story'
                : item.formato === 'feed'
                  ? 'Feed'
                  : 'Quadrado'}
          </span>
          {item.quando && (
            <span className="text-[11px] text-muted-foreground">· {item.quando}</span>
          )}
          {/* Co-branding: qual marca de cliente entra na peça precisa estar
              visível na revisão — não há campo no modal, a escolha vem do
              plano (chat/MCP). */}
          {item.clienteCitado && (
            <span
              className="rounded-full border border-orange-500/40 bg-orange-500/10 px-2 py-0.5 text-[10px] text-orange-600 dark:text-orange-400"
              title="A logomarca oficial deste cliente é composta na arte, no canto oposto ao da marca da casa."
            >
              marca: {item.clienteCitado.nome ?? `cliente ${item.clienteCitado.projectId}`}
            </span>
          )}
          {/* Só fora da rotina: a marca precisa estar visível na revisão da
              leva, mas repetir "rotina" em todo card seria só ruído. */}
          {item.escopo && item.escopo !== 'ROTINA' && (
            <span
              className="rounded-full border border-border/60 px-2 py-0.5 text-[10px] text-muted-foreground"
              title={
                item.escopo === 'CAMPANHA'
                  ? 'Post de campanha: aprende para a próxima edição dela, não para a rotina.'
                  : 'Caso isolado: não entra no que o sistema aprende sobre o cliente.'
              }
            >
              {item.escopo === 'CAMPANHA' ? 'campanha' : 'pontual'}
            </span>
          )}
        </div>

        <p className="truncate text-sm font-medium">
          {ehCarrossel
            ? (slides.find((s) => s.copy.length > 0)?.copy[0] ?? '(carrossel)')
            : (item.copy[0] ?? item.tema ?? '(sem copy)')}
        </p>
        {!ehCarrossel && item.copy.length > 1 && (
          <p className="truncate text-xs text-muted-foreground">{item.copy.slice(1).join(' · ')}</p>
        )}

        {/* A fileira de candidatas (F4): trocar a foto custa 1 toque; o
            seletor completo fica atrás do "ver mais" (o modal de edição).
            Só em card ainda editável — depois que a arte existe, trocar a
            foto aqui não mudaria nada (e o PATCH seria recusado). Com 1
            candidata só não houve alternativa: a fileira não aparece. */}
        {podeEditar && fotoCandidatas.length >= 2 && (
          <FotoCandidatas
            projectId={projectId}
            candidatas={fotoCandidatas}
            ativaDriveFileId={
              item.referencias.find((r) => r.papel === 'subject')?.driveFileId ?? null
            }
            onTrocar={onTrocarFoto}
            onVerMais={() => setEditando(true)}
          />
        )}

        {ehCarrossel && slides.length > 0 && (
          <div className="flex flex-wrap gap-1.5 pt-0.5">
            {slides.map((s) => (
              <button
                key={s.ordem}
                type="button"
                disabled={!s.resultUrl}
                onClick={() => abrirPreview(s.ordem)}
                title={
                  s.erro
                    ? `Slide ${s.ordem}: ${s.erro}`
                    : s.resultUrl
                      ? `Ver o slide ${s.ordem} grande`
                      : s.copy.length > 0
                        ? `Slide ${s.ordem}: ${s.copy.join(' · ')}`
                        : `Slide ${s.ordem}: capa (foto pura)`
                }
                className={cn(
                  'relative h-14 w-11 overflow-hidden rounded border',
                  s.resultUrl && 'cursor-zoom-in hover:ring-2 hover:ring-primary/50',
                  s.erro
                    ? 'border-destructive'
                    : s.resultUrl
                      ? 'border-emerald-500/60'
                      : 'border-border/50 opacity-60',
                )}
              >
                <Image
                  src={s.resultUrl ?? s.referencia.thumbUrl}
                  alt={`Slide ${s.ordem}`}
                  fill
                  sizes="44px"
                  className="object-cover"
                  unoptimized
                />
                <span className="absolute bottom-0 left-0 bg-background/80 px-1 text-[9px]">
                  {s.ordem}
                </span>
                {s.generationId && !s.resultUrl && !s.erro && (
                  <span className="absolute inset-0 flex items-center justify-center bg-background/60">
                    <Loader2 className="h-3 w-3 animate-spin text-primary" />
                  </span>
                )}
              </button>
            ))}
          </div>
        )}
        {item.motivoDoSlot && item.status === 'rascunho' && (
          <p className="text-[11px] text-muted-foreground">🎯 {item.motivoDoSlot}</p>
        )}
        {/* Recusa com motivo não é beco: o item continua na fila e pode ser
            gerado depois de ajustado. Esconder o porquê seria transformar a
            reprovação num card mudo. */}
        {item.motivoReprovacao && (
          <p className="text-xs text-amber-600 dark:text-amber-500">
            Reprovado: {item.motivoReprovacao}
          </p>
        )}
        {item.erro && <p className="text-xs text-destructive">{item.erro}</p>}

        <div className="flex flex-wrap items-center gap-2 pt-1">
          {podeEditar && (
            <Button size="sm" variant="outline" onClick={() => setEditando(true)}>
              <Pencil className="mr-2 h-4 w-4" />
              Editar
            </Button>
          )}
          {(item.status === 'rascunho' || item.status === 'erro') &&
            (podeMontarNoModelo ? (
              /**
               * As duas vias, com o preço dito em cada uma: montar no modelo
               * do cliente (sem custo de imagem) e gerar por IA. Qual é o
               * botão principal segue a via do item no plano. A escolha do
               * MODELO fica na linha colapsada logo abaixo — sem escolher,
               * a rotação usa o menos usado do formato.
               */
              <div className="w-full space-y-2">
                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    size="sm"
                    variant={viaTemplate ? 'default' : 'outline'}
                    onClick={onGerarPorModelo}
                  >
                    {item.status === 'erro' && viaTemplate ? (
                      <RefreshCw className="mr-2 h-4 w-4" />
                    ) : (
                      <LayoutTemplate className="mr-2 h-4 w-4" />
                    )}
                    {item.status === 'erro' && viaTemplate
                      ? 'Tentar de novo pelo editor'
                      : 'Gerar pelo editor'}
                  </Button>
                  <Button
                    size="sm"
                    variant={viaTemplate ? 'outline' : 'default'}
                    onClick={onGerar}
                  >
                    {item.status === 'erro' && !viaTemplate ? (
                      <RefreshCw className="mr-2 h-4 w-4" />
                    ) : (
                      <Sparkles className="mr-2 h-4 w-4" />
                    )}
                    {item.status === 'erro' && !viaTemplate
                      ? 'Tentar de novo por IA (25 créditos)'
                      : 'Gerar por IA (25 créditos)'}
                  </Button>
                </div>
                <BancadaEscolhaDeModelo
                  projectId={projectId}
                  formato={item.formato}
                  via={item.via ?? 'template'}
                  sourcePageId={item.sourcePageId ?? null}
                  refGenerationId={
                    item.referencias.find((r) => r.papel === 'style' && r.generationId)
                      ?.generationId ?? null
                  }
                  onEscolher={onEscolherBase}
                />
              </div>
            ) : (
              <Button size="sm" onClick={onGerar}>
                {item.status === 'erro' ? (
                  <RefreshCw className="mr-2 h-4 w-4" />
                ) : (
                  <Sparkles className="mr-2 h-4 w-4" />
                )}
                {item.status === 'erro'
                  ? 'Tentar de novo'
                  : ehCarrossel
                    ? 'Gerar capa e guia (50 créditos)'
                    : 'Gerar arte (25 créditos)'}
              </Button>
            ))}

          {item.status === 'guia-pronto' &&
            (() => {
              const faltam = slides.filter((s) => s.ordem > 2).length
              return (
                <div className="w-full space-y-2">
                  <p className="text-xs text-muted-foreground">
                    O slide 2 define o DESIGN da série (a capa é foto pura). Confirme o estilo
                    para gerar {faltam === 1 ? 'o slide restante' : `os ${faltam} slides restantes`}{' '}
                    com o mesmo look.
                  </p>
                  <Button size="sm" onClick={onConfirmarEstilo}>
                    <Sparkles className="mr-2 h-4 w-4" />
                    Confirmar estilo e gerar o resto ({faltam * 25} créditos)
                  </Button>
                </div>
              )
            })()}

          {item.status === 'gerando' && (
            <span className="text-xs text-muted-foreground">
              A página atualiza sozinha quando ficar pronta.
            </span>
          )}

          {/* Arte pronta COM aviso: sai, mas pede o olho. É o contrato da
              conferência desde 10/08 — o comparador avisa, nunca veta. E a
              correção é BOTÃO COM PREÇO, não reflexo: cada geração é uma
              chamada paga, e a maioria das reprovações medidas era falso
              negativo. Quem olhou e concordou com o aviso decide gastar. */}
          {item.status === 'pronto' && item.aviso && (
            <div className="w-full space-y-1.5">
              <p className="flex items-start gap-1.5 text-xs text-amber-600 dark:text-amber-500">
                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                {item.aviso}
              </p>
              {item.tipo !== 'carrossel' && (
                <Button size="sm" variant="outline" onClick={onGerar}>
                  <RefreshCw className="mr-2 h-3.5 w-3.5" />
                  Corrigir — gerar de novo (25 créditos)
                </Button>
              )}
            </div>
          )}

          {item.status === 'pronto' && (
            <>
              <Input
                type="date"
                value={quando.data}
                onChange={(e) => setQuando((q) => ({ ...q, data: e.target.value }))}
                className="h-8 w-36"
              />
              <Input
                type="time"
                value={quando.hora}
                onChange={(e) => setQuando((q) => ({ ...q, hora: e.target.value }))}
                className="h-8 w-24"
              />
              <Button
                size="sm"
                variant="outline"
                disabled={!quandoTexto}
                onClick={() => onAgendar(quandoTexto, 'rascunho', { lembrete })}
              >
                <Calendar className="mr-2 h-4 w-4" />
                Rascunho na agenda
              </Button>
              <Button
                size="sm"
                disabled={!quandoTexto}
                onClick={() => onAgendar(quandoTexto, 'agendado', { lembrete })}
              >
                {lembrete && <BellRing className="mr-2 h-4 w-4" />}
                {lembrete ? 'Agendar lembrete' : 'Agendar'}
              </Button>
              {/* Publicação manual com lembrete. DESLIGADO por padrão: o
                  caminho comum agenda direto e o sistema publica. Ligado, o
                  post nasce REMINDER — ninguém publica por ele; na data e
                  hora, o grupo do WhatsApp recebe a arte, a legenda e as
                  observações para alguém postar à mão. */}
              <label className="flex w-full cursor-pointer items-start gap-2 pt-1">
                <Switch
                  checked={lembrete}
                  onCheckedChange={setLembrete}
                  aria-label="Publicar à mão com lembrete no WhatsApp"
                />
                <span className="text-xs text-muted-foreground">
                  <span className="font-medium text-foreground">Publicar à mão, com lembrete</span>
                  {' — '}
                  {lembrete
                    ? 'nada publica sozinho: na data e hora agendadas, o grupo do WhatsApp recebe a arte e a legenda para alguém postar.'
                    : 'desligado: o post agendado publica sozinho no horário.'}
                </span>
              </label>
            </>
          )}

          {item.status === 'agendado' && (
            <Link
              href={`/projects/${projectId}/agenda`}
              className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
            >
              Ver na agenda <ExternalLink className="h-3 w-3" />
            </Link>
          )}

          {/* Duplicar — pedido do Ciro (17/08/2026): "bem discreto, ao lado
              da lixeira e somente o ícone". Mesmo briefing, base em aberto. */}
          {onDuplicar && item.status !== 'gerando' && (
            <Button
              size="icon"
              variant="ghost"
              className="h-8 w-8"
              title="Duplicar — mesma copy e foto, escolhendo outra base"
              onClick={onDuplicar}
            >
              <CopyPlus className="h-4 w-4" />
            </Button>
          )}
          {item.status !== 'gerando' && (
            <Button
              size="icon"
              variant="ghost"
              className="h-8 w-8"
              title="Tirar da fila"
              onClick={onRemover}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          )}
        </div>
      </div>

      {podeEditar && (
        <BancadaEditarItem
          item={item}
          aberto={editando}
          onOpenChange={setEditando}
          onSalvar={(e) => {
            onSalvarEdicao(e)
            setEditando(false)
          }}
        />
      )}
      <BancadaPreview
        slides={slidesDaPreview}
        inicial={previewInicial}
        open={previewAberta}
        onOpenChange={setPreviewAberta}
        titulo={
          ehCarrossel
            ? `Carrossel — ${item.legenda?.slice(0, 60) || 'prévia'}`
            : (item.copy[0] ?? 'Prévia')
        }
      />
    </div>
  )
}

/**
 * A conta da 1ª chamada de executar-plano, para alguém ler antes de dizer sim.
 *
 * A conversa aqui é em PEÇAS, não em jargão de cobrança: quantas saem pela IA,
 * quantas montadas em modelo do cliente, quantas ficam de fora e por quê. Só o
 * botão Confirmar dispara a 2ª chamada — fechar o diálogo não produz nada.
 */
function DialogoDaConta({
  aberta,
  onOpenChange,
  resultado,
  confirmando,
  onConfirmar,
}: {
  aberta: boolean
  onOpenChange: (aberta: boolean) => void
  resultado: ResultadoExecutarPlano | null
  confirmando: boolean
  onConfirmar: () => void
}) {
  if (!resultado) return null

  const c = resultado.conta
  // Os motivos vêm de `motivoDeNaoExecutar` (frases estáveis do serviço):
  // separa o que foi reprovado (tem saída própria) do que já anda sozinho.
  const reprovados = resultado.ignorados.filter((i) => i.motivo.includes('reprovado')).length
  const foraPorEstado = resultado.ignorados.length - reprovados

  const pecas = (n: number) => `${n} ${n === 1 ? 'peça' : 'peças'}`

  return (
    <Dialog open={aberta} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Produzir a leva</DialogTitle>
          <DialogDescription>{resultado.titulo || 'Leva combinada'}</DialogDescription>
        </DialogHeader>

        <div className="space-y-2 text-sm">
          {c.total === 0 ? (
            <p className="text-muted-foreground">
              Não há peça para produzir agora — o que está na fila já está pronto, em produção ou
              precisa de ajuste antes.
            </p>
          ) : (
            <ul className="space-y-1.5">
              {c.porIA > 0 && (
                <li>
                  <span className="font-medium">{pecas(c.porIA)}</span>{' '}
                  {c.porIA === 1 ? 'sai' : 'saem'} pela IA e{' '}
                  {c.porIA === 1 ? 'fica pronta sozinha' : 'ficam prontas sozinhas'} em alguns
                  minutos.
                </li>
              )}
              {c.porModelo > 0 && (
                <li>
                  <span className="font-medium">{pecas(c.porModelo)}</span>{' '}
                  {c.porModelo === 1 ? 'é montada' : 'são montadas'} na hora, sobre{' '}
                  {c.porModelo === 1 ? 'um modelo' : 'modelos'} do cliente.
                </li>
              )}
              {foraPorEstado > 0 && (
                <li className="text-muted-foreground">
                  {foraPorEstado} {foraPorEstado === 1 ? 'item fica' : 'itens ficam'} de fora:{' '}
                  {foraPorEstado === 1 ? 'já está pronto' : 'já estão prontos'}, em produção ou na
                  agenda.
                </li>
              )}
              {reprovados > 0 && (
                <li className="text-muted-foreground">
                  {reprovados} {reprovados === 1 ? 'reprovado fica' : 'reprovados ficam'} de fora —
                  ajuste e devolva à fila para {reprovados === 1 ? 'produzi-lo' : 'produzi-los'}.
                </li>
              )}
            </ul>
          )}

          {c.saldoSuficiente === false && (
            <p className="flex items-start gap-1.5 text-xs text-amber-600 dark:text-amber-500">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              O saldo de hoje pode não cobrir a leva inteira — parte das peças pode falhar. Dá para
              continuar mesmo assim; o que falhar fica na fila com o motivo.
            </p>
          )}

          {c.total > 0 && (
            <p className="text-xs text-muted-foreground">
              Pode fechar o app depois de confirmar — a produção continua no servidor.
            </p>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={confirmando}>
            Voltar
          </Button>
          <Button onClick={onConfirmar} disabled={confirmando || c.total === 0}>
            {confirmando && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Confirmar e produzir
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/** "YYYY-MM-DD HH:mm" → campos de data e hora do formulário. */
function paraInputs(quando?: string | null): { data: string; hora: string } {
  if (!quando) return { data: '', hora: '' }
  const [data, hora] = quando.split(' ')
  return { data: data ?? '', hora: (hora ?? '').slice(0, 5) }
}
