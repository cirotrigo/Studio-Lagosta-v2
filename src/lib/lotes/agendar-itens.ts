/**
 * Do lote até os rascunhos — o serviço com banco do agendamento idempotente por
 * item (PR 12 de "Marca simples, copy melhor", 12/09/2026). A decisão mora no
 * módulo puro `agendamento.ts`; aqui, a ordem das escritas.
 *
 * Item a item, em SÉRIE (a falha de um não derruba os outros):
 * 1. **Decisão sem trava** (`decidirEscrita` pelo `db`) sobre a linha do
 *    `ItemDeLote`, a peça, a página, o item do plano, a mídia em outros posts e
 *    os posts da página. Toda repetição de um item já agendado para antes disso:
 *    reaproveita (ou conflita) sem escrever nada — salvo refazer efeitos que
 *    ficaram pendentes.
 * 2. **Escrever sob as travas**: `SELECT … FOR UPDATE` na linha do item, no
 *    item do plano (quando há) e na página — a ordem do PR 11 (`ItemDeLote` →
 *    `ItemDePlano`) seguida da página —, relê a linha e roda `decidirEscrita`
 *    DE NOVO pela transação (pré-revisão C12-1: página que virou modelo, mídia
 *    que entrou noutro post e item de plano reprovado enquanto esta chamada
 *    esperava a trava). Um post rascunho/agendado que já tenha a página é
 *    ADOTADO; senão o post é criado PELA TRANSAÇÃO e a linha é ligada a ele com
 *    compare-and-set em `postId: null`. Post e vínculo são um commit só.
 *    O item do plano vai de `pronto` a `agendado` NO MESMO commit, por
 *    compare-and-set sob a trava dele (pré-revisão C12-1x2): se não pegar, a
 *    transação volta atrás e o item recusa.
 * 3. **Efeitos depois do commit** (sinais, artes, pasta, remarcação, e a
 *    reconciliação do item de plano de linha ligada antes disso), e só então
 *    `efeitosDoAgendamentoEm`. Todos são idempotentes pelo id do post; a chamada
 *    que cair entre o commit e o fim dos efeitos deixa o carimbo nulo, e a
 *    repetição os refaz.
 *
 * `simular: true` toma as MESMAS decisões e devolve a mesma conta sem escrever
 * nada — é o que roda em produção antes de agendar de verdade.
 *
 * 🔴 Dentro da transação, nunca o `db` global (pooler do Neon com uma conexão:
 * a consulta por fora espera a conexão que a própria transação segura).
 */

import { db } from '@/lib/db'
import { CreativeError } from '@/lib/creatives/errors'
import {
  contextoDosEfeitos,
  criarPostDoAgendamento,
  efeitosDoAgendamento,
  resolverAgendamento,
  type AgendamentoResolvido,
  type AgendarPostInput,
  type ContextoDosEfeitos,
} from '@/lib/creatives/agendar'
import { formatarBRT, parseBRT } from '@/lib/creatives/data-brt'
import { getPublicAppUrl } from '@/lib/creatives/persist'
import { formatoDaPagina, refilarPaginasDoPost } from '@/lib/compositor/pastas'
import { normalizarStatusDoItem, transicaoPermitida } from '@/lib/planos/vocabulario'
import { classificarPecaDoItem, descreverArteAtualDoItem, type ArteAtualDoItem } from '@/lib/planos/decisao-do-item'
import type { Superficie } from '@/lib/aprendizado/vocabulario'
import type { Prisma } from '../../../prisma/generated/client'
import {
  decidirAgendamento,
  decidirItemDoPlano,
  decidirMidiaEmOutroPost,
  decidirPostsDaPagina,
  descreverRascunhoApagado,
  estadoDoPost,
  hashDoAgendamento,
  mancheteDaSpec,
  MOTIVO_RECRIAR_COM_OUTRO_PEDIDO,
  pedidoDoAgendamento,
  resumirAgendamento,
  superadaNoPlanoSemPeca,
  thumbnailEhAtual,
  validarAgendamentoDoLote,
  type DesfechoDoItemAgendado,
  type EstadoDoPost,
  type FalhaDoItem,
  type FormatoDaPeca,
  type ItemDoAgendamento,
  type PedidoDeAgendamento,
  type RascunhoApagado,
  type SituacaoDoItemAgendado,
} from './agendamento'

export interface EntradaDoAgendamentoDoLote {
  projectId: number
  loteId: string
  itens: unknown[]
  /** Toma as decisões e devolve a conta, sem escrever nada. */
  simular?: boolean
  /**
   * Só com `simular: true`: o cliente por onde as LEITURAS passam — a
   * transação `READ ONLY` da prova de produção, para a conta ser a decisão do
   * serviço e a garantia de só-leitura ser do banco (R12-04). A escrita nunca
   * passa por ele.
   */
  leitor?: Cliente
  /** `User.id` INTERNO (cuid), NUNCA o clerkId. */
  decididoPor?: string | null
  superficie?: Superficie
}

export interface ItemAgendadoDoLote {
  itemId: string
  situacao: SituacaoDoItemAgendado
  desfecho?: DesfechoDoItemAgendado
  postId?: string
  pageId?: string
  generationId?: string
  /** "dd/mm/aaaa hh:mm" em Brasília. */
  quando?: string
  imagem?: string | null
  renderStatus?: string
  /** O que o post é AGORA (R12-06): só `rascunho` espera aprovar-rascunhos. */
  estadoDoPost?: EstadoDoPost
  /** O post já foi entregue para publicar: a arte que vai ao ar é a entregue, e mexer na página não a muda mais. */
  entregueParaPublicar?: true
  editUrl?: string
  codigo?: string
  motivo?: string
  avisos?: string[]
  /** Com `POST_REMOVIDO`: o rascunho que a equipe apagou, para o chat contar à pessoa (Ciro, 13/09/2026). */
  rascunhoApagado?: RascunhoApagado
  /** Com `PECA_SUPERADA_NO_PLANO`: a arte que o item do plano aponta agora (Ciro, 13/09/2026). */
  arteAtualDoItem?: ArteAtualDoItem
}

export interface ResultadoDoAgendamentoDoLote {
  loteId: string
  simulado: boolean
  resumo: { concluidos: number; pendentes: number; falhas: number }
  itens: ItemAgendadoDoLote[]
}

type Cliente = Pick<Prisma.TransactionClient, 'project' | 'generation' | 'generationJob' | 'page' | 'socialPost' | 'itemDeLote' | 'itemDePlano'>

const SELECAO_DA_LINHA = { id: true, generationId: true, postId: true, hashDoAgendamento: true, efeitosDoAgendamentoEm: true } as const
const SELECAO_DO_POST = {
  id: true, status: true, postType: true, scheduledDatetime: true, mediaUrls: true, renderStatus: true, pageId: true, templateId: true,
  caption: true, campaignId: true, sugestaoId: true, origem: true, generationId: true, laterPostId: true,
} as const

type Linha = { id: string; generationId: string | null; postId: string | null; hashDoAgendamento: string | null; efeitosDoAgendamentoEm: Date | null }
type Post = {
  id: string; status: string; postType: string; scheduledDatetime: Date | null; mediaUrls: string[]; renderStatus: string; pageId: string | null; templateId: number | null
  caption: string | null; campaignId: string | null; sugestaoId: string | null; origem: string | null; generationId: string | null
  laterPostId: string | null
}

/** Recusa decidida DENTRO da transação que já escreveu: lançar é o que desfaz o post e o vínculo. */
class RecusaSobTrava extends Error {
  constructor(readonly falha: FalhaDoItem) {
    super(falha.motivo)
  }
}

interface Peca {
  id: string
  status: string
  resultUrl: string | null
  pageId: string | null
  /** A versão visual que o PNG da peça desenhou, gravada junto dele (R12-01). */
  versaoRenderizada: unknown
  slide: boolean
  quandoDaSpec: string | null
  formato: FormatoDaPeca | null
  itemDePlanoId: string | null
  planoId: string | null
  tema: string | null
  manchete: string | null
}

interface Pagina {
  id: string
  templateId: number
  ehModelo: boolean
  formato: FormatoDaPeca
}

const FORMATOS = new Set(['story', 'feed', 'quadrado'])

async function lerPeca(cliente: Cliente, generationId: string, projectId: number): Promise<Peca | null> {
  const g = await cliente.generation.findFirst({
    where: { id: generationId, projectId },
    select: { id: true, status: true, resultUrl: true, slideOrder: true, fieldValues: true },
  })
  if (!g) return null
  const fv = (g.fieldValues && typeof g.fieldValues === 'object' ? g.fieldValues : {}) as Record<string, unknown>
  const spec = (fv.spec && typeof fv.spec === 'object' ? fv.spec : {}) as Record<string, unknown>
  return {
    id: g.id,
    status: String(g.status),
    resultUrl: g.resultUrl ?? null,
    pageId: typeof fv.pageId === 'string' ? fv.pageId : null,
    versaoRenderizada: fv.versaoRenderizada,
    slide: g.slideOrder != null || (spec.carrossel != null && typeof spec.carrossel === 'object'),
    quandoDaSpec: typeof spec.quando === 'string' && spec.quando.trim() ? spec.quando : null,
    formato: typeof spec.formato === 'string' && FORMATOS.has(spec.formato) ? (spec.formato as FormatoDaPeca) : null,
    itemDePlanoId: typeof spec.itemDePlanoId === 'string' ? spec.itemDePlanoId : null,
    planoId: typeof spec.planoId === 'string' ? spec.planoId : null,
    tema: typeof spec.tema === 'string' && spec.tema.trim() ? spec.tema.trim() : null,
    manchete: mancheteDaSpec(spec),
  }
}

async function lerPagina(cliente: Cliente, pageId: string, projectId: number): Promise<Pagina | null> {
  const p = await cliente.page.findUnique({
    where: { id: pageId },
    select: { id: true, templateId: true, isTemplate: true, width: true, height: true, tags: true, Template: { select: { projectId: true } } },
  })
  if (!p || p.Template.projectId !== projectId) return null
  return { id: p.id, templateId: p.templateId, ehModelo: p.isTemplate, formato: formatoDaPagina(p) }
}

type ItemDoPlanoLido = { id: string; status: string; generationId: string | null; postId: string | null; pageId: string | null; updatedAt: Date }

async function lerItemDoPlano(cliente: Cliente, peca: Pick<Peca, 'itemDePlanoId' | 'planoId'>, projectId: number): Promise<ItemDoPlanoLido | null> {
  if (!peca.itemDePlanoId) return null
  return (await cliente.itemDePlano.findFirst({
    where: { id: peca.itemDePlanoId, projectId, ...(peca.planoId ? { planoId: peca.planoId } : {}) },
    select: { id: true, status: true, generationId: true, postId: true, pageId: true, updatedAt: true },
  })) as ItemDoPlanoLido | null
}

/** A arte que o item do plano aponta agora, descrita para o chat — só leitura. */
async function lerArteAtualDoItem(cliente: Cliente, generationId: string, pageIdDoItem: string | null, projectId: number): Promise<ArteAtualDoItem | null> {
  const g = (await cliente.generation.findFirst({
    where: { id: generationId, projectId },
    select: { status: true, resultUrl: true, createdAt: true, fieldValues: true },
  })) as { status: string; resultUrl: string | null; createdAt: Date | null; fieldValues: unknown } | null
  return descreverArteAtualDoItem({ generationId, pageIdDoItem, geracao: g ? { ...g, status: String(g.status) } : null })
}

/** A peça da linha não serve: não existe, sumiu, falhou ou terminou sem o arquivo (PR11-F02). */
const PECA_QUE_NAO_SERVE = new Set(['PECA_AUSENTE', 'PECA_FALHOU', 'PECA_SEM_ARQUIVO'])

/**
 * A peça desta linha não serve (não existe, sumiu, falhou ou não tem arquivo):
 * o pedido nasceu de um item de plano que a compor-leva repetida recusaria como
 * SUPERADO? O item vem do PAYLOAD da linha — o pedido desta chamada —, que
 * existe mesmo quando a compor-leva recusou e nenhuma Generation nasceu. Sem isso a resposta mandava
 * "componha com compor-leva", e compor de novo devolvia `superada` de novo.
 */
async function superadaSemPeca(cliente: Cliente, linhaId: string, projectId: number): Promise<{ falha: FalhaDoItem; arteAtualDoItem: ArteAtualDoItem | null } | null> {
  const bruta = await cliente.itemDeLote.findUnique({ where: { id: linhaId }, select: { payload: true } })
  const payload = (bruta?.payload && typeof bruta.payload === 'object' && !Array.isArray(bruta.payload) ? bruta.payload : {}) as Record<string, unknown>
  if (typeof payload.itemDePlanoId !== 'string') return null
  const alvo = { itemDePlanoId: payload.itemDePlanoId, planoId: typeof payload.planoId === 'string' ? payload.planoId : null }
  const item = await lerItemDoPlano(cliente, alvo, projectId)
  if (!item?.generationId) return null
  // O job ANTES da Generation, como a tabela do plano lê: o runner fecha a
  // Generation e só depois o job (PR 11, C11-1).
  const job = await cliente.generationJob.findUnique({ where: { generationId: item.generationId }, select: { status: true } })
  const g = (await cliente.generation.findFirst({
    where: { id: item.generationId, projectId },
    select: { status: true, resultUrl: true, createdAt: true, fieldValues: true },
  })) as { status: string; resultUrl: string | null; createdAt: Date | null; fieldValues: unknown } | null
  const geracao = g ? { ...g, status: String(g.status) } : null
  const pecaDoItem = classificarPecaDoItem({ generationId: item.generationId, geracao, job: job ? { status: String(job.status) } : null })
  const falha = superadaNoPlanoSemPeca({ item, pecaDoItem })
  if (!falha) return null
  return { falha, arteAtualDoItem: descreverArteAtualDoItem({ generationId: item.generationId, pageIdDoItem: item.pageId, geracao }) }
}

function editUrlDe(templateId: number | null | undefined, pageId: string | null | undefined): string | undefined {
  if (templateId == null || !pageId) return undefined
  return `${getPublicAppUrl()}/templates/${templateId}/editor?pageId=${encodeURIComponent(pageId)}`
}

function falhou(itemId: string, falha: FalhaDoItem, extra: Partial<ItemAgendadoDoLote> = {}): ItemAgendadoDoLote {
  return { itemId, situacao: 'falhou', codigo: falha.codigo, motivo: falha.motivo, ...extra }
}

function comAvisos(avisos: string[]): { avisos?: string[] } {
  return avisos.length > 0 ? { avisos: Array.from(new Set(avisos)) } : {}
}

/** O rascunho, como o retorno individual o mostra. */
function concluido(itemId: string, desfecho: DesfechoDoItemAgendado, post: Post, peca: Peca | null, pagina: Pagina | null, avisos: string[]): ItemAgendadoDoLote {
  const pageId = post.pageId ?? pagina?.id ?? peca?.pageId ?? undefined
  return {
    itemId,
    situacao: 'concluido',
    desfecho,
    postId: post.id,
    ...(pageId ? { pageId } : {}),
    ...(peca ? { generationId: peca.id } : {}),
    ...(post.scheduledDatetime ? { quando: formatarBRT(post.scheduledDatetime) } : {}),
    imagem: post.mediaUrls[0] ?? null,
    renderStatus: post.renderStatus,
    ...(estadoDoPost(post.status) ? { estadoDoPost: estadoDoPost(post.status)! } : {}),
    ...(post.laterPostId && post.status !== 'DRAFT' ? { entregueParaPublicar: true as const } : {}),
    ...(editUrlDe(post.templateId ?? pagina?.templateId, pageId) ? { editUrl: editUrlDe(post.templateId ?? pagina?.templateId, pageId) } : {}),
    ...comAvisos(avisos),
  }
}

/** A entrada de `agendarPost` que o item do lote produz. Situação sempre rascunho. */
function entradaDoPost(projectId: number, peca: Peca, pedido: PedidoDeAgendamento, ctx: Contexto): AgendarPostInput {
  return {
    projectId,
    pageId: peca.pageId!,
    generationId: peca.id,
    scheduledDatetime: pedido.quando,
    situacao: 'rascunho',
    postType: pedido.postType,
    ...(pedido.caption ? { caption: pedido.caption } : {}),
    ...(pedido.lembrete ? { lembrete: true } : {}),
    learningScope: pedido.escopo,
    ...(pedido.campanhaId ? { campaignId: pedido.campanhaId } : {}),
    ...(ctx.decididoPor ? { decididoPor: ctx.decididoPor } : {}),
    superficie: ctx.superficie,
  }
}

interface Contexto {
  projectId: number
  loteId: string
  simular: boolean
  /** Por onde as leituras da DECISÃO passam: o `db`, ou o leitor da simulação (R12-04). */
  leitor: Cliente
  decididoPor: string | null
  superficie: Superficie
}

type Escrita =
  | { acao: 'recusar'; resposta: ItemAgendadoDoLote }
  | { acao: 'adotar'; postId: string; peca: Peca; pagina: Pagina; itemDoPlano: ItemDoPlanoLido | null }
  | { acao: 'criar'; postId: null; peca: Peca; pagina: Pagina; itemDoPlano: ItemDoPlanoLido | null }

/**
 * TUDO que decide se o item vira post, lido pelo cliente que se passa: o `db`
 * na decisão sem trava, a transação sob as travas. É a mesma função nas duas
 * vezes justamente para a segunda não herdar nada da primeira (C12-1: a
 * decisão tomada antes da trava fica velha enquanto a chamada espera).
 *
 * A linha deve estar SEM post (a linha ligada é respondida por `responderLigado`).
 */
async function decidirEscrita(cliente: Cliente, ctx: Contexto, itemId: string, linha: Linha, pedido: { hash: string } | { falha: FalhaDoItem }, postApagado: string | null): Promise<Escrita> {
  const { projectId } = ctx
  const peca = linha.generationId ? await lerPeca(cliente, linha.generationId, projectId) : null
  const pagina = peca?.pageId ? await lerPagina(cliente, peca.pageId, projectId) : null
  const vinculos = { ...(peca ? { generationId: peca.id } : {}), ...(peca?.pageId ? { pageId: peca.pageId } : {}) }

  const decisao = decidirAgendamento({ registro: { ...linha, postId: null }, postLigadoExiste: false, pedido, peca, pagina })
  if (decisao.acao === 'pendente') {
    return { acao: 'recusar', resposta: { itemId, situacao: 'pendente', codigo: decisao.codigo, motivo: decisao.motivo, ...(peca ? { generationId: peca.id } : {}) } }
  }
  if (decisao.acao === 'falhar') {
    const superada = PECA_QUE_NAO_SERVE.has(decisao.codigo) ? await superadaSemPeca(cliente, linha.id, projectId) : null
    if (superada) return { acao: 'recusar', resposta: falhou(itemId, superada.falha, { ...vinculos, ...(superada.arteAtualDoItem ? { arteAtualDoItem: superada.arteAtualDoItem } : {}) }) }
    return { acao: 'recusar', resposta: falhou(itemId, decisao, vinculos) }
  }
  if (decisao.acao !== 'agendar' || !peca || !pagina) {
    return { acao: 'recusar', resposta: falhou(itemId, { codigo: 'LOTE_AGENDAMENTO_CONCORRENTE', motivo: 'O item mudou durante o agendamento. Repita a chamada.' }, vinculos) }
  }
  const pageId = pagina.id

  if (peca.resultUrl) {
    const comAMidia = (await cliente.socialPost.findMany({
      where: { projectId, mediaUrls: { has: peca.resultUrl }, OR: [{ pageId: null }, { pageId: { not: pageId } }] },
      select: { id: true, mediaUrls: true },
      take: 5,
    })) as Array<{ id: string; mediaUrls: string[] }>
    const midia = decidirMidiaEmOutroPost(comAMidia)
    if (midia) return { acao: 'recusar', resposta: falhou(itemId, midia, { postId: midia.postId, ...vinculos }) }
  }

  const posts = (await cliente.socialPost.findMany({ where: { projectId, pageId }, select: { id: true, status: true }, orderBy: { createdAt: 'asc' } })) as Array<{ id: string; status: string }>
  const ligados = posts.length
    ? ((await cliente.itemDeLote.findMany({ where: { postId: { in: posts.map((p) => p.id) }, NOT: { id: linha.id } }, select: { postId: true } })) as Array<{ postId: string | null }>)
    : []
  const daPagina = decidirPostsDaPagina(posts, new Set(ligados.map((l) => l.postId).filter((p): p is string => !!p)))
  if (daPagina.acao === 'falhar') return { acao: 'recusar', resposta: falhou(itemId, daPagina, { postId: daPagina.postId, ...vinculos }) }

  const itemDoPlano = await lerItemDoPlano(cliente, peca, projectId)
  const doPlano = decidirItemDoPlano({
    itemDePlanoId: peca.itemDePlanoId,
    item: itemDoPlano,
    pecaId: peca.id,
    postQueSeraLigado: daPagina.acao === 'adotar' ? daPagina.postId : null,
    postApagado,
  })
  if (doPlano?.pendente) {
    return { acao: 'recusar', resposta: { itemId, situacao: 'pendente', codigo: doPlano.codigo, motivo: doPlano.motivo, ...vinculos } }
  }
  if (doPlano) {
    const arteAtualDoItem = doPlano.superadaPor ? await lerArteAtualDoItem(cliente, doPlano.superadaPor, itemDoPlano?.pageId ?? null, projectId) : null
    return { acao: 'recusar', resposta: falhou(itemId, doPlano, { ...vinculos, ...(arteAtualDoItem ? { arteAtualDoItem } : {}) }) }
  }

  return daPagina.acao === 'adotar'
    ? { acao: 'adotar', postId: daPagina.postId, peca, pagina, itemDoPlano }
    : { acao: 'criar', postId: null, peca, pagina, itemDoPlano }
}

/**
 * RECONCILIAÇÃO do item do plano de uma linha JÁ ligada (efeitos pendentes).
 * Desde a pré-revisão C12-1x2 a transição acontece no commit que cria o post,
 * sob a trava do item; aqui só chega a linha ligada antes disso, e o post já
 * existe, então divergência vira aviso e o rascunho fica.
 *
 * Mesma regra do commit: de `pronto` para `agendado` por compare-and-set no
 * estado LIDO (status, `generationId` e `updatedAt`), nunca atravessando
 * transições — `caminhoAte` fabricaria `gerando`/`pronto` para um item
 * reaberto, e `agendado` é terminal (C12-1). `pronto` é a ÚNICA origem que a
 * tabela de transições aceita para `agendado`.
 *
 * Erro do banco LANÇA (R12-02): quem chama deixa os efeitos pendentes, e a
 * repetição tenta de novo. Engolido, ele virava aviso e o carimbo dos efeitos
 * era gravado — o item ficava `pronto` para sempre, e a bancada o oferecia para
 * agendar outra vez.
 */
async function levarItemDoPlanoParaAgendado(ctx: Contexto, peca: Peca, postId: string): Promise<string | null> {
  if (!peca.itemDePlanoId) return null
  const item = await lerItemDoPlano(db, peca, ctx.projectId)
  if (!item) return 'O item do plano desta peça não existe mais — o rascunho ficou só na agenda.'
  const de = normalizarStatusDoItem(item.status)
  if (de === 'agendado' && item.postId === postId && item.generationId === peca.id) return null
  if (de !== 'pronto' || item.generationId !== peca.id || !transicaoPermitida(de, 'agendado')) {
    return `O item do plano mudou depois da peça (está "${item.status}") — não o marquei como agendado. O rascunho está na agenda; confira o plano.`
  }
  const movido = await db.itemDePlano.updateMany({
    where: { id: item.id, projectId: ctx.projectId, status: item.status, generationId: peca.id, updatedAt: item.updatedAt },
    data: { status: 'agendado', postId, ...(peca.pageId ? { pageId: peca.pageId } : {}) },
  })
  return movido.count === 1 ? null : 'O item do plano mudou enquanto a peça ia para a agenda — não o marquei como agendado. O rascunho está na agenda; confira o plano.'
}

/**
 * Os efeitos pós-commit de um item: os mesmos de `agendarPost` sobre o post
 * como ele ESTÁ, a remarcação da página quando o horário não é o da composição,
 * e o item de plano. Só marca `efeitosDoAgendamentoEm` quando tudo rodou: o que
 * lançar E o que um efeito disser que não terminou (a captura e a pasta engolem
 * o erro do banco e o devolvem em `falhas`/`falhou`, R12-02) ficam pendentes
 * para a repetição.
 *
 * Os sinais descrevem o POST que existe (C12-1b): horário, situação, legenda,
 * campanha e sugestão saem dele. No post criado por esta chamada são os valores
 * do pedido; no ADOTADO (criado à mão, pelo editor, por colocar-na-agenda) são
 * os que a equipe gravou — o pedido do lote não entra no corpus no lugar deles.
 */
async function executarEfeitos(ctx: Contexto, linhaId: string, post: Post, peca: Peca, input: AgendarPostInput, resolucao: AgendamentoResolvido | null): Promise<string[]> {
  const avisos: string[] = []
  try {
    const r = resolucao ?? (await resolverAgendamento(input, { ingerir: false }))
    const quando = post.scheduledDatetime ?? r.quando
    const contexto: ContextoDosEfeitos = {
      ...contextoDosEfeitos(r),
      quando,
      situacao: post.status === 'SCHEDULED' ? 'agendado' : 'rascunho',
      caption: post.caption ? post.caption : undefined,
      campaignId: post.campaignId ?? null,
      sugestaoId: post.sugestaoId ?? null,
      origem: (post.origem as ContextoDosEfeitos['origem']) ?? null,
    }
    // Post que já tem Generation não recataloga a mídia: depois do render do cron
    // ela é o PNG do post, sem Generation, e viraria arte duplicada (C12-1x4).
    const { falhas } = await efeitosDoAgendamento(post, contexto, { registrarArtes: !post.generationId })
    // O horário do rascunho não é o que a composição previu: a página vai
    // junto para a pasta (e o nome) do dia certo — a regra da remarcação.
    const doSpec = peca.quandoDaSpec ? instanteDe(peca.quandoDaSpec) : null
    if (doSpec !== null && doSpec !== quando.getTime()) {
      const refilagem = await refilarPaginasDoPost(post.id, quando, r.project.userId)
      avisos.push(...refilagem.avisos)
      if (refilagem.falhou === true) falhas.push('a página na pasta do dia')
    }
    const doPlano = await levarItemDoPlanoParaAgendado(ctx, peca, post.id)
    if (doPlano) avisos.push(doPlano)
    if (falhas.length > 0) {
      avisos.push(`O rascunho existe, mas parte do registro do agendamento não terminou (${falhas.join(', ')}). Repita a chamada com o mesmo pedido para completar.`)
      return avisos
    }
    await db.itemDeLote.updateMany({
      where: { id: linhaId, postId: post.id, efeitosDoAgendamentoEm: null },
      data: { efeitosDoAgendamentoEm: new Date() },
    })
  } catch (erro) {
    avisos.push(`O rascunho existe, mas o registro do agendamento não terminou (${erro instanceof Error ? erro.message : String(erro)}). Repita a chamada com o mesmo pedido para completar.`)
  }
  return avisos
}

function instanteDe(texto: string): number | null {
  try {
    return parseBRT(texto).getTime()
  } catch {
    return null
  }
}

async function agendarItem(ctx: Contexto, item: ItemDoAgendamento): Promise<ItemAgendadoDoLote> {
  const { projectId, loteId } = ctx
  const itemId = item.itemId
  const linha = (await ctx.leitor.itemDeLote.findUnique({
    where: { projectId_loteId_itemId: { projectId, loteId, itemId } },
    select: SELECAO_DA_LINHA,
  })) as Linha | null
  if (!linha) {
    return falhou(itemId, { codigo: 'ITEM_NAO_ENCONTRADO', motivo: `O item "${itemId}" não existe no lote "${loteId}" — componha com compor-leva (mesmo loteId e itemId) antes de agendar.` })
  }

  const peca = linha.generationId ? await lerPeca(ctx.leitor, linha.generationId, projectId) : null
  const pagina = peca?.pageId ? await lerPagina(ctx.leitor, peca.pageId, projectId) : null
  const resultadoDoPedido = pedidoDoAgendamento(item, { quandoDaSpec: peca?.quandoDaSpec ?? null, formato: peca?.formato ?? pagina?.formato ?? null })
  const pedido = 'pedido' in resultadoDoPedido ? resultadoDoPedido.pedido : null
  const avisosDoPedido = 'pedido' in resultadoDoPedido ? resultadoDoPedido.avisos : []
  const hash = pedido ? hashDoAgendamento(pedido) : null
  const pedidoParaDecidir = pedido && hash ? { hash } : { falha: (resultadoDoPedido as { falha: FalhaDoItem }).falha }

  /**
   * A linha já aponta um post. Devolve a resposta do item — ou, quando o post
   * foi APAGADO e a pessoa confirmou (`recriarRascunhoApagado: true`), o id do
   * post apagado, para o caminho de escrita recriar o rascunho (Ciro, 13/09/2026).
   */
  const responderLigado = async (atual: Linha): Promise<ItemAgendadoDoLote | { recriar: string }> => {
    const post = (await ctx.leitor.socialPost.findUnique({ where: { id: atual.postId! }, select: SELECAO_DO_POST })) as Post | null
    const decisao = decidirAgendamento({ registro: atual, postLigadoExiste: !!post, pedido: pedidoParaDecidir, peca, pagina, recriarApagado: item.recriarRascunhoApagado })
    if (decisao.acao === 'recriar') return { recriar: decisao.postApagado }
    if (decisao.acao !== 'reaproveitar') {
      const falha = decisao as FalhaDoItem
      // O rascunho existe: a falha do pedido nunca pode soar como "nada na agenda" (C12-1x3).
      const motivo = post && falha.codigo !== 'LOTE_AGENDAMENTO_CONFLITO' ? `${falha.motivo} O rascunho que este item já tinha continua na agenda, intacto.` : falha.motivo
      // Sem o post, o chat precisa dizer à pessoa QUAL rascunho sumiu (Ciro, 13/09/2026).
      const apagado = !post ? { rascunhoApagado: descreverRascunhoApagado({ pedido, hashDoOriginal: atual.hashDoAgendamento, tema: peca?.tema ?? null, manchete: peca?.manchete ?? null }) } : {}
      return falhou(itemId, { codigo: falha.codigo, motivo }, { postId: atual.postId!, ...(peca ? { generationId: peca.id } : {}), ...(peca?.pageId ? { pageId: peca.pageId } : {}), ...apagado })
    }
    const avisos = [...avisosDoPedido]
    if (decisao.efeitosPendentes) {
      if (ctx.simular) avisos.push('O registro do agendamento deste item ficou incompleto; a chamada de verdade o completa.')
      else if (peca && pedido) avisos.push(...(await executarEfeitos(ctx, atual.id, post!, peca, entradaDoPost(projectId, peca, pedido, ctx), null)))
    }
    const fresco = ((await ctx.leitor.socialPost.findUnique({ where: { id: post!.id }, select: SELECAO_DO_POST })) as Post | null) ?? post!
    return concluido(itemId, 'reaproveitado', fresco, peca, pagina, avisos)
  }

  // A resposta de uma linha que outra chamada ligou: o pedido de recriar não
  // cabe aí (o post que ela apontava já não é o apagado que esta chamada viu).
  const responderJaLigado = async (atual: Linha): Promise<ItemAgendadoDoLote> => {
    const r = await responderLigado(atual)
    return 'recriar' in r ? falhou(itemId, { codigo: 'LOTE_AGENDAMENTO_CONCORRENTE', motivo: 'O item mudou durante o agendamento. Repita a chamada.' }) : r
  }

  let postApagado: string | null = null
  if (linha.postId) {
    const ligado = await responderLigado(linha)
    if (!('recriar' in ligado)) return ligado
    postApagado = ligado.recriar
  }

  // 1. Decisão sem trava.
  const antes = await decidirEscrita(ctx.leitor, ctx, itemId, linha, pedidoParaDecidir, postApagado)
  if (antes.acao === 'recusar') return antes.resposta
  const pedidoValido = pedido!
  const pageId = antes.pagina.id

  if (ctx.simular) {
    const avisos = [...avisosDoPedido, 'Simulação: nada foi gravado.']
    if (antes.acao === 'adotar') {
      const existente = (await ctx.leitor.socialPost.findUnique({ where: { id: antes.postId }, select: SELECAO_DO_POST })) as Post | null
      if (existente) return concluido(itemId, 'adotado', existente, antes.peca, antes.pagina, avisos)
    }
    const paginaCrua = await ctx.leitor.page.findUnique({ where: { id: pageId }, select: { thumbnail: true, layers: true, width: true, height: true, background: true } })
    const atual = !!paginaCrua && thumbnailEhAtual({ thumbnail: paginaCrua.thumbnail ?? null, resultUrl: antes.peca.resultUrl, pagina: paginaCrua, versaoRenderizada: antes.peca.versaoRenderizada })
    return {
      itemId,
      situacao: 'concluido',
      desfecho: postApagado ? 'recriado' : 'criado',
      pageId,
      generationId: antes.peca.id,
      quando: formatarBRT(new Date(pedidoValido.quando)),
      imagem: atual ? (paginaCrua?.thumbnail ?? null) : null,
      renderStatus: atual ? 'RENDERED' : 'PENDING',
      estadoDoPost: 'rascunho',
      ...(editUrlDe(antes.pagina.templateId, pageId) ? { editUrl: editUrlDe(antes.pagina.templateId, pageId) } : {}),
      avisos,
    }
  }

  // 2. Escrever sob as travas, decidindo DE NOVO.
  type Escrito =
    | { tipo: 'ja-ligado'; linha: Linha }
    | { tipo: 'recusado'; resposta: ItemAgendadoDoLote }
    | { tipo: 'ligado'; postId: string; desfecho: DesfechoDoItemAgendado; resolucao: AgendamentoResolvido | null; peca: Peca; pagina: Pagina; pedido: PedidoDeAgendamento; avisos: string[]; input: AgendarPostInput }
  let escrita: Escrito
  try {
  escrita = await db.$transaction(async (tx): Promise<Escrito> => {
      await tx.$queryRaw`SELECT id FROM "ItemDeLote" WHERE id = ${linha.id} FOR UPDATE`
      if (antes.peca.itemDePlanoId) {
        await tx.$queryRaw`SELECT id FROM "ItemDePlano" WHERE id = ${antes.peca.itemDePlanoId} AND "projectId" = ${projectId} FOR UPDATE`
      }
      await tx.$queryRaw`SELECT id FROM "Page" WHERE id = ${pageId} FOR UPDATE`
      const atual = (await tx.itemDeLote.findUnique({ where: { id: linha.id }, select: SELECAO_DA_LINHA })) as Linha | null
      if (!atual) {
        throw new CreativeError('LOTE_ITEM_SUMIU', `O item "${itemId}" do lote "${loteId}" foi apagado durante o agendamento. Repita a chamada.`, 409, { loteId, itemId })
      }
      // Outra chamada ligou o item enquanto esta esperava a trava — inclusive a
      // outra confirmação que já recriou o rascunho apagado.
      if (atual.postId !== postApagado) {
        if (atual.postId) return { tipo: 'ja-ligado', linha: atual }
        return { tipo: 'recusado', resposta: falhou(itemId, { codigo: 'LOTE_AGENDAMENTO_CONCORRENTE', motivo: 'O item mudou durante o agendamento. Repita a chamada.' }) }
      }
      if (postApagado && (await tx.socialPost.findUnique({ where: { id: postApagado }, select: { id: true } }))) return { tipo: 'ja-ligado', linha: atual }

      const sob = await decidirEscrita(tx, ctx, itemId, atual, pedidoParaDecidir, postApagado)
      if (sob.acao === 'recusar') return { tipo: 'recusado', resposta: sob.resposta }
      // As travas são da página e do item de plano que a decisão sem trava leu:
      // a peça não pode ter trocado — nem de Generation, nem de página, nem de item.
      if (sob.peca.id !== antes.peca.id || sob.pagina.id !== pageId || sob.peca.itemDePlanoId !== antes.peca.itemDePlanoId) {
        return { tipo: 'recusado', resposta: falhou(itemId, { codigo: 'LOTE_AGENDAMENTO_CONCORRENTE', motivo: 'A peça mudou durante o agendamento. Repita a chamada.' }, { generationId: sob.peca.id, pageId: sob.pagina.id }) }
      }
      // O pedido, o hash e a entrada do post saem da peça RELIDA sob a trava —
      // nunca da leitura de antes dela.
      const pedidoSob = pedidoDoAgendamento(item, { quandoDaSpec: sob.peca.quandoDaSpec, formato: sob.peca.formato ?? sob.pagina.formato })
      if ('falha' in pedidoSob) return { tipo: 'recusado', resposta: falhou(itemId, pedidoSob.falha, { generationId: sob.peca.id, pageId }) }
      const hashSob = hashDoAgendamento(pedidoSob.pedido)
      // O rascunho apagado só volta com o pedido de antes, relido sob a trava.
      if (postApagado && hashSob !== atual.hashDoAgendamento) {
        return { tipo: 'recusado', resposta: falhou(itemId, { codigo: 'LOTE_AGENDAMENTO_CONFLITO', motivo: MOTIVO_RECRIAR_COM_OUTRO_PEDIDO }, { generationId: sob.peca.id, pageId }) }
      }
      const input = entradaDoPost(projectId, sob.peca, pedidoSob.pedido, ctx)

      let postId: string
      let desfecho: DesfechoDoItemAgendado
      let resolucao: AgendamentoResolvido | null = null
      if (sob.acao === 'adotar') {
        postId = sob.postId
        desfecho = 'adotado'
      } else {
        resolucao = await resolverAgendamento(input, {
          leitor: tx,
          ingerir: false,
          aceitarThumbnail: (p) => thumbnailEhAtual({ thumbnail: p.thumbnail, resultUrl: sob.peca.resultUrl, pagina: p, versaoRenderizada: sob.peca.versaoRenderizada }),
        })
        const criado = await criarPostDoAgendamento(tx, resolucao)
        postId = criado.id
        desfecho = postApagado ? 'recriado' : 'criado'
      }

      // Compare-and-set no post que a linha apontava: nenhum, ou o APAGADO que a
      // pessoa mandou recriar. É o que faz a segunda confirmação não criar outro.
      const ligado = await tx.itemDeLote.updateMany({
        where: { id: atual.id, postId: postApagado },
        data: { postId, hashDoAgendamento: hashSob, agendadoEm: new Date(), efeitosDoAgendamentoEm: null },
      })
      // Com a trava isto não acontece; se acontecer, a transação volta atrás
      // inteira e nenhum post fica sem a linha apontando para ele.
      if (ligado.count !== 1) {
        throw new CreativeError('LOTE_AGENDAMENTO_CONCORRENTE', `O item "${itemId}" do lote "${loteId}" mudou durante o agendamento. Repita a chamada.`, 409, { loteId, itemId })
      }

      // O item do plano vai a `agendado` NESTE commit, sob a trava dele (C12-1x2).
      // Depois do commit, uma reprovação durante os efeitos deixava a arte
      // reprovada na agenda só com um aviso, e a invocação que morresse antes do
      // CAS deixava o item `pronto` — com o "Agendar" da bancada criando um
      // segundo rascunho da mesma página. Se não pegar, tudo volta atrás.
      const doPlano = sob.itemDoPlano
      const statusDoPlano = doPlano ? normalizarStatusDoItem(doPlano.status) : null
      if (doPlano && statusDoPlano === 'pronto') {
        const movido = await tx.itemDePlano.updateMany({
          where: { id: doPlano.id, projectId, status: doPlano.status, generationId: sob.peca.id, updatedAt: doPlano.updatedAt },
          data: { status: 'agendado', postId, ...(sob.peca.pageId ? { pageId: sob.peca.pageId } : {}) },
        })
        if (movido.count !== 1) {
          throw new RecusaSobTrava({ codigo: 'PECA_SUPERADA_NO_PLANO', motivo: 'O item do plano mudou enquanto a peça ia para a agenda — nada foi agendado. Confira o plano e repita.' })
        }
      } else if (doPlano && postApagado && statusDoPlano === 'agendado' && doPlano.postId === postApagado) {
        // O item continua `agendado` (terminal): só o post que ele aponta muda,
        // do apagado para o recriado — no mesmo commit, por compare-and-set.
        const repontado = await tx.itemDePlano.updateMany({
          where: { id: doPlano.id, projectId, status: doPlano.status, postId: postApagado, generationId: sob.peca.id, updatedAt: doPlano.updatedAt },
          data: { postId, ...(sob.peca.pageId ? { pageId: sob.peca.pageId } : {}) },
        })
        if (repontado.count !== 1) {
          throw new RecusaSobTrava({ codigo: 'PECA_SUPERADA_NO_PLANO', motivo: 'O item do plano mudou enquanto o rascunho apagado voltava para a agenda — nada foi criado. Confira o plano e repita.' })
        }
      }
      return { tipo: 'ligado', postId, desfecho, resolucao, peca: sob.peca, pagina: sob.pagina, pedido: pedidoSob.pedido, avisos: pedidoSob.avisos, input }
  }, { maxWait: 10_000, timeout: 20_000 })
  } catch (erro) {
    if (!(erro instanceof RecusaSobTrava)) throw erro
    escrita = { tipo: 'recusado', resposta: falhou(itemId, erro.falha, { generationId: antes.peca.id, pageId }) }
  }

  if (escrita.tipo === 'ja-ligado') return responderJaLigado(escrita.linha)
  if (escrita.tipo === 'recusado') return escrita.resposta

  // 3. Efeitos depois do commit.
  const post = (await db.socialPost.findUnique({ where: { id: escrita.postId }, select: SELECAO_DO_POST })) as Post
  const avisos = [...escrita.avisos, ...(escrita.resolucao?.avisos ?? [])]
  avisos.push(...(await executarEfeitos(ctx, linha.id, post, escrita.peca, escrita.input, escrita.resolucao)))
  const fresco = ((await db.socialPost.findUnique({ where: { id: post.id }, select: SELECAO_DO_POST })) as Post | null) ?? post
  if (escrita.desfecho === 'recriado') {
    avisos.push('O rascunho que a equipe tinha apagado voltou para a agenda, com a mesma arte da leva, porque a pessoa confirmou.')
  }
  if (escrita.desfecho === 'adotado' && fresco.scheduledDatetime && fresco.scheduledDatetime.toISOString() !== escrita.pedido.quando) {
    avisos.push(`Já havia ${fresco.status === 'DRAFT' ? 'um rascunho' : 'um post agendado'} desta peça em ${formatarBRT(fresco.scheduledDatetime)} — adotei esse, sem mudar o horário.`)
  }
  return concluido(itemId, escrita.desfecho, fresco, escrita.peca, escrita.pagina, avisos)
}

/**
 * Campo do pedido inválido falha o item — mas a resposta não pode afirmar que
 * nada está na agenda quando o item JÁ tem rascunho de uma chamada anterior
 * (pré-revisão C12-1x3): lê a linha e, com post vivo, devolve o `postId` e diz
 * que ele continua lá. Só leitura; vale também em `simular`.
 */
async function falhaDoPedido(ctx: Contexto, itemId: string, falha: FalhaDoItem): Promise<ItemAgendadoDoLote> {
  const linha = await ctx.leitor.itemDeLote.findUnique({
    where: { projectId_loteId_itemId: { projectId: ctx.projectId, loteId: ctx.loteId, itemId } },
    select: { postId: true },
  })
  const post = linha?.postId ? await ctx.leitor.socialPost.findUnique({ where: { id: linha.postId }, select: { id: true } }) : null
  if (!post) return falhou(itemId, falha)
  return falhou(itemId, { codigo: falha.codigo, motivo: `${falha.motivo} O rascunho que este item já tinha continua na agenda, intacto.` }, { postId: post.id })
}

/**
 * Agenda os itens de um lote como RASCUNHOS, pela página de cada peça.
 * Lança só o que invalida a chamada inteira (identidade da leva, projeto); o
 * resto — inclusive campo do pedido inválido — volta por item: concluído,
 * pendente ou falhou.
 */
export async function agendarItensDoLote(entrada: EntradaDoAgendamentoDoLote): Promise<ResultadoDoAgendamentoDoLote> {
  const v = validarAgendamentoDoLote(entrada.loteId, entrada.itens)
  if (!v.loteId) {
    throw new CreativeError('LOTE_IDENTIDADE_INVALIDA', `Identidade da leva inválida — ${v.problemas.join('; ')}. Nada foi agendado.`, 400, { problemas: v.problemas })
  }
  if (entrada.leitor && entrada.simular !== true) {
    throw new CreativeError('LEITOR_SO_EM_SIMULACAO', 'O leitor externo só vale com simular: true — a escrita passa pelo banco de sempre. Nada foi agendado.', 400)
  }
  const leitor: Cliente = entrada.leitor ?? db
  const projeto = await leitor.project.findUnique({ where: { id: entrada.projectId }, select: { id: true } })
  if (!projeto) throw new CreativeError('PROJECT_NOT_FOUND', `Projeto ${entrada.projectId} não encontrado`, 404)

  const ctx: Contexto = {
    projectId: entrada.projectId,
    loteId: v.loteId,
    simular: entrada.simular === true,
    leitor,
    decididoPor: entrada.decididoPor ?? null,
    superficie: entrada.superficie ?? 'chat',
  }
  const itens: ItemAgendadoDoLote[] = []
  for (const { item, falha } of v.itens) {
    try {
      itens.push(falha ? await falhaDoPedido(ctx, item.itemId, falha) : await agendarItem(ctx, item))
    } catch (erro) {
      const codigo = erro instanceof CreativeError ? erro.code : 'ERRO'
      itens.push(falhou(item.itemId, { codigo, motivo: erro instanceof Error ? erro.message : String(erro) }))
    }
  }
  return { loteId: v.loteId, simulado: ctx.simular, resumo: resumirAgendamento(itens), itens }
}
