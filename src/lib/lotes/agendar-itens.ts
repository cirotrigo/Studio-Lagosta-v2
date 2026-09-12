/**
 * Do lote até os rascunhos — o serviço com banco do agendamento idempotente por
 * item (PR 12 de "Marca simples, copy melhor", 12/09/2026). A decisão mora no
 * módulo puro `agendamento.ts`; aqui, a ordem das escritas.
 *
 * Item a item, em SÉRIE (a falha de um não derruba os outros):
 * 1. **Decisão sem trava** sobre a linha do `ItemDeLote`, a peça, a página e o
 *    post que a linha aponta. Toda repetição de um item já agendado para aqui:
 *    reaproveita (ou conflita) sem escrever nada — salvo refazer efeitos que
 *    ficaram pendentes.
 * 2. **Escrever sob duas travas**: `SELECT … FOR UPDATE` na linha do item E na
 *    página, relê a linha, relê os posts da página e decide DE NOVO. Um post
 *    rascunho/agendado que já tenha a página é ADOTADO; senão o post é criado
 *    PELA TRANSAÇÃO e a linha é ligada a ele com compare-and-set em
 *    `postId: null`. Post e vínculo são um commit só.
 * 3. **Efeitos depois do commit** (sinais, artes, pasta, remarcação, item de
 *    plano → agendado), e só então `efeitosDoAgendamentoEm`. Todos são
 *    idempotentes pelo id do post; a chamada que cair entre o commit e o fim dos
 *    efeitos deixa o carimbo nulo, e a repetição os refaz.
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
import { caminhoAte } from '@/lib/planos/execucao'
import { transicionarItem } from '@/lib/planos/plano-service'
import { normalizarStatusDoItem } from '@/lib/planos/vocabulario'
import type { Superficie } from '@/lib/aprendizado/vocabulario'
import type { Prisma } from '../../../prisma/generated/client'
import {
  decidirAgendamento,
  decidirMidiaEmOutroPost,
  decidirPostsDaPagina,
  hashDoAgendamento,
  pedidoDoAgendamento,
  resumirAgendamento,
  thumbnailEhAtual,
  validarAgendamentoDoLote,
  type DesfechoDoItemAgendado,
  type FalhaDoItem,
  type FormatoDaPeca,
  type ItemDoAgendamento,
  type PedidoDeAgendamento,
  type SituacaoDoItemAgendado,
} from './agendamento'

export interface EntradaDoAgendamentoDoLote {
  projectId: number
  loteId: string
  itens: unknown[]
  /** Toma as decisões e devolve a conta, sem escrever nada. */
  simular?: boolean
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
  editUrl?: string
  codigo?: string
  motivo?: string
  avisos?: string[]
}

export interface ResultadoDoAgendamentoDoLote {
  loteId: string
  simulado: boolean
  resumo: { concluidos: number; pendentes: number; falhas: number }
  itens: ItemAgendadoDoLote[]
}

type Cliente = Pick<Prisma.TransactionClient, 'generation' | 'page' | 'socialPost' | 'itemDeLote'>

const SELECAO_DA_LINHA = { id: true, generationId: true, postId: true, hashDoAgendamento: true, efeitosDoAgendamentoEm: true } as const
const SELECAO_DO_POST = { id: true, status: true, postType: true, scheduledDatetime: true, mediaUrls: true, renderStatus: true, pageId: true, templateId: true } as const

type Linha = { id: string; generationId: string | null; postId: string | null; hashDoAgendamento: string | null; efeitosDoAgendamentoEm: Date | null }
type Post = { id: string; status: string; postType: string; scheduledDatetime: Date | null; mediaUrls: string[]; renderStatus: string; pageId: string | null; templateId: number | null }

interface Peca {
  id: string
  status: string
  resultUrl: string | null
  pageId: string | null
  snapshot: unknown
  slide: boolean
  quandoDaSpec: string | null
  formato: FormatoDaPeca | null
  itemDePlanoId: string | null
  planoId: string | null
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
    snapshot: fv.layersSnapshot,
    slide: g.slideOrder != null || (spec.carrossel != null && typeof spec.carrossel === 'object'),
    quandoDaSpec: typeof spec.quando === 'string' && spec.quando.trim() ? spec.quando : null,
    formato: typeof spec.formato === 'string' && FORMATOS.has(spec.formato) ? (spec.formato as FormatoDaPeca) : null,
    itemDePlanoId: typeof spec.itemDePlanoId === 'string' ? spec.itemDePlanoId : null,
    planoId: typeof spec.planoId === 'string' ? spec.planoId : null,
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
  decididoPor: string | null
  superficie: Superficie
}

/**
 * Leva o item do plano ligado à peça para `agendado`, com o post — pelas
 * transições válidas (`caminhoAte`, nunca uma cópia da tabela). Best-effort:
 * devolve um aviso em vez de lançar.
 */
async function levarItemDoPlanoParaAgendado(ctx: Contexto, peca: Peca, postId: string): Promise<string | null> {
  if (!peca.itemDePlanoId) return null
  try {
    const item = await db.itemDePlano.findFirst({
      where: { id: peca.itemDePlanoId, projectId: ctx.projectId, ...(peca.planoId ? { planoId: peca.planoId } : {}) },
      select: { id: true, planoId: true, status: true, postId: true },
    })
    if (!item) return 'O item do plano desta peça não existe mais — o rascunho ficou só na agenda.'
    const de = normalizarStatusDoItem(item.status) ?? 'proposto'
    if (de === 'agendado') return item.postId && item.postId !== postId ? `O item do plano já estava na agenda por outro post (${item.postId}).` : null
    const passos = caminhoAte(de, 'agendado')
    if (!passos) return `O item do plano está em "${de}" e não pode ir para a agenda — o rascunho foi criado, confira o plano.`
    for (const passo of passos) {
      await transicionarItem({
        projectId: ctx.projectId,
        planoId: item.planoId,
        itemId: item.id,
        para: passo,
        decididoPor: ctx.decididoPor ?? undefined,
        ...(passo === 'agendado' ? { postId, generationId: peca.id, ...(peca.pageId ? { pageId: peca.pageId } : {}) } : {}),
      })
    }
    return null
  } catch (erro) {
    return `Não deu para marcar o item do plano como agendado (${erro instanceof Error ? erro.message : String(erro)}).`
  }
}

/**
 * Os efeitos pós-commit de um item: os mesmos de `agendarPost` sobre o post
 * como ele ESTÁ (a equipe pode tê-lo remarcado), a remarcação da página quando
 * o horário não é o da composição, e o item de plano. Só marca
 * `efeitosDoAgendamentoEm` quando tudo rodou; o que lançar fica pendente para a
 * repetição.
 */
async function executarEfeitos(ctx: Contexto, linhaId: string, post: Post, peca: Peca, input: AgendarPostInput, resolucao: AgendamentoResolvido | null): Promise<string[]> {
  const avisos: string[] = []
  try {
    const r = resolucao ?? (await resolverAgendamento(input, { ingerir: false }))
    const quando = post.scheduledDatetime ?? r.quando
    const contexto: ContextoDosEfeitos = { ...contextoDosEfeitos(r), quando, situacao: post.status === 'SCHEDULED' ? 'agendado' : 'rascunho' }
    await efeitosDoAgendamento(post, contexto)
    // O horário do rascunho não é o que a composição previu: a página vai
    // junto para a pasta (e o nome) do dia certo — a regra da remarcação.
    const doSpec = peca.quandoDaSpec ? instanteDe(peca.quandoDaSpec) : null
    if (doSpec !== null && doSpec !== quando.getTime()) {
      const refilagem = await refilarPaginasDoPost(post.id, quando, r.project.userId)
      avisos.push(...refilagem.avisos)
    }
    const doPlano = await levarItemDoPlanoParaAgendado(ctx, peca, post.id)
    if (doPlano) avisos.push(doPlano)
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
  const linha = (await db.itemDeLote.findUnique({
    where: { projectId_loteId_itemId: { projectId, loteId, itemId } },
    select: SELECAO_DA_LINHA,
  })) as Linha | null
  if (!linha) {
    return falhou(itemId, { codigo: 'ITEM_NAO_ENCONTRADO', motivo: `O item "${itemId}" não existe no lote "${loteId}" — componha com compor-leva (mesmo loteId e itemId) antes de agendar.` })
  }

  const peca = linha.generationId ? await lerPeca(db, linha.generationId, projectId) : null
  const pagina = peca?.pageId ? await lerPagina(db, peca.pageId, projectId) : null
  const resultadoDoPedido = pedidoDoAgendamento(item, { quandoDaSpec: peca?.quandoDaSpec ?? null, formato: peca?.formato ?? pagina?.formato ?? null })
  const pedido = 'pedido' in resultadoDoPedido ? resultadoDoPedido.pedido : null
  const avisosDoPedido = 'pedido' in resultadoDoPedido ? resultadoDoPedido.avisos : []
  const hash = pedido ? hashDoAgendamento(pedido) : null
  const pedidoParaDecidir = pedido && hash ? { hash } : { falha: (resultadoDoPedido as { falha: FalhaDoItem }).falha }

  const responderLigado = async (atual: Linha): Promise<ItemAgendadoDoLote> => {
    const post = (await db.socialPost.findUnique({ where: { id: atual.postId! }, select: SELECAO_DO_POST })) as Post | null
    const decisao = decidirAgendamento({ registro: atual, postLigadoExiste: !!post, pedido: pedidoParaDecidir, peca, pagina })
    if (decisao.acao !== 'reaproveitar') {
      return falhou(itemId, decisao as FalhaDoItem, { postId: atual.postId!, ...(peca ? { generationId: peca.id } : {}), ...(peca?.pageId ? { pageId: peca.pageId } : {}) })
    }
    const avisos = [...avisosDoPedido]
    if (decisao.efeitosPendentes) {
      if (ctx.simular) avisos.push('O registro do agendamento deste item ficou incompleto; a chamada de verdade o completa.')
      else if (peca && pedido) avisos.push(...(await executarEfeitos(ctx, atual.id, post!, peca, entradaDoPost(projectId, peca, pedido, ctx), null)))
    }
    const fresco = ((await db.socialPost.findUnique({ where: { id: post!.id }, select: SELECAO_DO_POST })) as Post | null) ?? post!
    return concluido(itemId, 'reaproveitado', fresco, peca, pagina, avisos)
  }

  if (linha.postId) return responderLigado(linha)

  const decisao = decidirAgendamento({ registro: linha, postLigadoExiste: false, pedido: pedidoParaDecidir, peca, pagina })
  if (decisao.acao === 'pendente') return { itemId, situacao: 'pendente', codigo: decisao.codigo, motivo: decisao.motivo, ...(peca ? { generationId: peca.id } : {}) }
  if (decisao.acao === 'falhar') return falhou(itemId, decisao, { ...(peca ? { generationId: peca.id } : {}), ...(peca?.pageId ? { pageId: peca.pageId } : {}) })
  // Daqui para baixo: peça pronta, página editável, pedido válido.
  const pecaPronta = peca!
  const paginaPronta = pagina!
  const pedidoValido = pedido!
  const pageId = paginaPronta.id

  if (pecaPronta.resultUrl) {
    const comAMidia = (await db.socialPost.findMany({
      where: { projectId, mediaUrls: { has: pecaPronta.resultUrl }, OR: [{ pageId: null }, { pageId: { not: pageId } }] },
      select: { id: true, mediaUrls: true },
      take: 5,
    })) as Array<{ id: string; mediaUrls: string[] }>
    const midia = decidirMidiaEmOutroPost(comAMidia)
    if (midia) return falhou(itemId, midia, { postId: midia.postId, generationId: pecaPronta.id, pageId })
  }

  const decidirPosts = async (cliente: Cliente) => {
    const posts = (await cliente.socialPost.findMany({ where: { projectId, pageId }, select: { id: true, status: true }, orderBy: { createdAt: 'asc' } })) as Array<{ id: string; status: string }>
    const ligados = posts.length
      ? ((await cliente.itemDeLote.findMany({ where: { postId: { in: posts.map((p) => p.id) }, NOT: { id: linha.id } }, select: { postId: true } })) as Array<{ postId: string | null }>)
      : []
    return decidirPostsDaPagina(posts, new Set(ligados.map((l) => l.postId).filter((p): p is string => !!p)))
  }

  const input = entradaDoPost(projectId, pecaPronta, pedidoValido, ctx)

  if (ctx.simular) {
    const posts = await decidirPosts(db)
    if (posts.acao === 'falhar') return falhou(itemId, posts, { postId: posts.postId, generationId: pecaPronta.id, pageId })
    const avisos = [...avisosDoPedido, 'Simulação: nada foi gravado.']
    if (posts.acao === 'adotar') {
      const existente = (await db.socialPost.findUnique({ where: { id: posts.postId }, select: SELECAO_DO_POST })) as Post | null
      if (existente) return concluido(itemId, 'adotado', existente, pecaPronta, paginaPronta, avisos)
    }
    const paginaCrua = await db.page.findUnique({ where: { id: pageId }, select: { thumbnail: true, layers: true } })
    const atual = thumbnailEhAtual({ thumbnail: paginaCrua?.thumbnail ?? null, resultUrl: pecaPronta.resultUrl, camadasDaPagina: paginaCrua?.layers, snapshot: pecaPronta.snapshot })
    return {
      itemId,
      situacao: 'concluido',
      desfecho: 'criado',
      pageId,
      generationId: pecaPronta.id,
      quando: formatarBRT(new Date(pedidoValido.quando)),
      imagem: atual ? (paginaCrua?.thumbnail ?? null) : null,
      renderStatus: atual ? 'RENDERED' : 'PENDING',
      ...(editUrlDe(paginaPronta.templateId, pageId) ? { editUrl: editUrlDe(paginaPronta.templateId, pageId) } : {}),
      avisos,
    }
  }

  const escrita = await db.$transaction(
    async (tx) => {
      await tx.$queryRaw`SELECT id FROM "ItemDeLote" WHERE id = ${linha.id} FOR UPDATE`
      await tx.$queryRaw`SELECT id FROM "Page" WHERE id = ${pageId} FOR UPDATE`
      const atual = (await tx.itemDeLote.findUnique({ where: { id: linha.id }, select: SELECAO_DA_LINHA })) as Linha | null
      if (!atual) {
        throw new CreativeError('LOTE_ITEM_SUMIU', `O item "${itemId}" do lote "${loteId}" foi apagado durante o agendamento. Repita a chamada.`, 409, { loteId, itemId })
      }
      // Outra chamada ligou o item enquanto esta esperava a trava.
      if (atual.postId) return { tipo: 'ja-ligado' as const, linha: atual }

      const posts = await decidirPosts(tx)
      if (posts.acao === 'falhar') return { tipo: 'falhou' as const, falha: posts }

      let postId: string
      let desfecho: DesfechoDoItemAgendado
      let resolucao: AgendamentoResolvido | null = null
      if (posts.acao === 'adotar') {
        postId = posts.postId
        desfecho = 'adotado'
      } else {
        const pecaAtual = await lerPeca(tx, pecaPronta.id, projectId)
        resolucao = await resolverAgendamento(input, {
          leitor: tx,
          ingerir: false,
          aceitarThumbnail: (p) => thumbnailEhAtual({ thumbnail: p.thumbnail, camadasDaPagina: p.layers, resultUrl: pecaAtual?.resultUrl ?? null, snapshot: pecaAtual?.snapshot }),
        })
        const criado = await criarPostDoAgendamento(tx, resolucao)
        postId = criado.id
        desfecho = 'criado'
      }

      const ligado = await tx.itemDeLote.updateMany({
        where: { id: atual.id, postId: null },
        data: { postId, hashDoAgendamento: hash!, agendadoEm: new Date(), efeitosDoAgendamentoEm: null },
      })
      // Com a trava isto não acontece; se acontecer, a transação volta atrás
      // inteira e nenhum post fica sem a linha apontando para ele.
      if (ligado.count !== 1) {
        throw new CreativeError('LOTE_AGENDAMENTO_CONCORRENTE', `O item "${itemId}" do lote "${loteId}" mudou durante o agendamento. Repita a chamada.`, 409, { loteId, itemId })
      }
      return { tipo: 'ligado' as const, postId, desfecho, resolucao }
    },
    { maxWait: 10_000, timeout: 20_000 },
  )

  if (escrita.tipo === 'ja-ligado') return responderLigado(escrita.linha)
  if (escrita.tipo === 'falhou') return falhou(itemId, escrita.falha, { postId: escrita.falha.postId, generationId: pecaPronta.id, pageId })

  const post = (await db.socialPost.findUnique({ where: { id: escrita.postId }, select: SELECAO_DO_POST })) as Post
  const avisos = [...avisosDoPedido, ...(escrita.resolucao?.avisos ?? [])]
  avisos.push(...(await executarEfeitos(ctx, linha.id, post, pecaPronta, input, escrita.resolucao)))
  const fresco = ((await db.socialPost.findUnique({ where: { id: post.id }, select: SELECAO_DO_POST })) as Post | null) ?? post
  if (escrita.desfecho === 'adotado' && fresco.scheduledDatetime && fresco.scheduledDatetime.toISOString() !== pedidoValido.quando) {
    avisos.push(`Já havia um rascunho desta peça em ${formatarBRT(fresco.scheduledDatetime)} — adotei esse, sem mudar o horário.`)
  }
  return concluido(itemId, escrita.desfecho, fresco, pecaPronta, paginaPronta, avisos)
}

/**
 * Agenda os itens de um lote como RASCUNHOS, pela página de cada peça.
 * Lança só o que invalida a chamada inteira (identidade, projeto); o resto
 * volta por item: concluído, pendente ou falhou.
 */
export async function agendarItensDoLote(entrada: EntradaDoAgendamentoDoLote): Promise<ResultadoDoAgendamentoDoLote> {
  const v = validarAgendamentoDoLote(entrada.loteId, entrada.itens)
  if (!v.loteId) {
    throw new CreativeError('LOTE_IDENTIDADE_INVALIDA', `Pedido de agendamento inválido — ${v.problemas.join('; ')}. Nada foi agendado.`, 400, { problemas: v.problemas })
  }
  const projeto = await db.project.findUnique({ where: { id: entrada.projectId }, select: { id: true } })
  if (!projeto) throw new CreativeError('PROJECT_NOT_FOUND', `Projeto ${entrada.projectId} não encontrado`, 404)

  const ctx: Contexto = {
    projectId: entrada.projectId,
    loteId: v.loteId,
    simular: entrada.simular === true,
    decididoPor: entrada.decididoPor ?? null,
    superficie: entrada.superficie ?? 'chat',
  }
  const itens: ItemAgendadoDoLote[] = []
  for (const item of v.itens) {
    try {
      itens.push(await agendarItem(ctx, item))
    } catch (erro) {
      const codigo = erro instanceof CreativeError ? erro.code : 'ERRO'
      itens.push(falhou(item.itemId, { codigo, motivo: erro instanceof Error ? erro.message : String(erro) }))
    }
  }
  return { loteId: v.loteId, simulado: ctx.simular, resumo: resumirAgendamento(itens), itens }
}
