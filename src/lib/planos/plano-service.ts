/**
 * Plano de conteúdo (F3) — o serviço.
 *
 * Este é o único lugar que escreve em `PlanoDeConteudo` e `ItemDePlano`. As
 * rotas HTTP são casca fina sobre ele e as tools do MCP vão embrulhar as MESMAS
 * funções — é a regra da casa (`updateBrandDNA`, `startImprovement`,
 * `salvarPilares`): serviço no `src/lib`, rota só valida e chama.
 *
 * ⚠️ O que este serviço NÃO faz, por contrato:
 *  - **não gera arte** e **não cobra crédito**. Uma linha aqui é o que se
 *    PRETENDE fazer. Quem executa (e cobra, com gate de confirmação) é
 *    `executar-plano`, da fatia seguinte;
 *  - **não agenda nada**. Item vira post pelo caminho normal (`agendarPost`),
 *    e só então recebe a transição para `agendado`.
 *
 * Ownership em toda função: `projectId` é o primeiro filtro de toda leitura e
 * de toda escrita. Plano ou item de outro cliente é 404 — nunca 403, que já
 * confirmaria a existência da linha.
 */

import type { Prisma } from '@prisma/client'
import { db } from '@/lib/db'
import { CreativeError } from '@/lib/creatives/errors'
import { diaBRTDe, diasAteDomingoBRT } from './proposta-de-semana'
import { parseBRT } from '@/lib/creatives/agendar'
import { ESCOPO_PADRAO, normalizarEscopo, type EscopoAprendizado } from '@/lib/posts/learning-scope'
import {
  itemEditavel,
  motivoDeNaoEditavel,
  normalizarFormato,
  normalizarStatusDoItem,
  normalizarStatusDoPlano,
  normalizarVia,
  progressoDoPlano,
  transicaoPermitida,
  VIA_PADRAO,
  type FormatoDoItem,
  type ProgressoDoPlano,
  type StatusDoItem,
  type StatusDoPlano,
  type ViaDoItem,
} from '@/lib/planos/vocabulario'

/**
 * Teto de itens por plano. Uma semana real tem de 5 a 15 posts; o limite existe
 * porque o chamador pode ser um modelo em laço, e uma leva de mil linhas seria
 * cara de desfazer na mão.
 */
export const MAX_ITENS_POR_PLANO = 60

/** Fuso de Brasília — é nele que as datas são combinadas com o cliente. */
const OFFSET_BRT = '-03:00'

// ── Entradas ────────────────────────────────────────────────────────────────

export interface ItemDePlanoInput {
  ordem?: number
  /** "YYYY-MM-DD HH:mm" em BRT, ISO com fuso, `Date`, ou nada (a decidir). */
  quando?: string | Date | null
  tema?: string | null
  copyProposta?: string[] | null
  legenda?: string | null
  fotoUrl?: string | null
  fotoDriveId?: string | null
  /**
   * Obrigatório na prática — mas o TIPO é opcional porque `strict: false` faz o
   * `z.infer` deste repo marcar TODA chave como opcional (sem
   * `strictNullChecks`, `undefined extends T` vale para tudo). Quem garante a
   * presença é a validação de runtime abaixo, que é o único lugar onde ela
   * podia valer mesmo.
   */
  formato?: string | null
  via?: string | null
  sourcePageId?: string | null
  motivoDoSlot?: string | null
  escopo?: string | EscopoAprendizado | null
  campaignId?: string | null
  /** O `LearningSignal` da sugestão de horário que originou o item. */
  sugestaoId?: string | null
  /** Carrossel: `{ groupId, lista: [...] }`. Nulo = peça única. */
  slides?: unknown
}

export interface CriarPlanoInput {
  projectId: number
  titulo?: string | null
  /** "YYYY-MM-DD" (dia inteiro em BRT) ou data e hora. */
  inicio: string | Date
  fim: string | Date
  origem?: string | null
  versao?: string | null
  /** `User.id` INTERNO (cuid), NUNCA o clerkId. */
  criadoPor?: string | null
  itens?: ItemDePlanoInput[]
}

export interface PatchDeItem {
  ordem?: number
  quando?: string | Date | null
  tema?: string | null
  copyProposta?: string[] | null
  legenda?: string | null
  fotoUrl?: string | null
  fotoDriveId?: string | null
  formato?: string
  via?: string | null
  sourcePageId?: string | null
  motivoDoSlot?: string | null
  escopo?: string | EscopoAprendizado | null
  campaignId?: string | null
  /** Carrossel: substitui a série INTEIRA (dado posicional, como Page.layers). */
  slides?: unknown
}

// ── Datas ───────────────────────────────────────────────────────────────────

/**
 * A janela do plano, em instante.
 *
 * Data pura vira o começo (`inicio`) ou o FIM (`fim`) daquele dia em Brasília:
 * "de 17 a 23/08" inclui o dia 23 inteiro. É o mesmo contrato de
 * `parseValidade` (`src/lib/knowledge/vigencia.ts`), e pela mesma razão —
 * cravar 00:00 encerraria a janela um dia antes do combinado, e no fuso errado,
 * já que a meia-noite UTC cai às 21h de BRT.
 *
 * 🔴 Dia que não existe NÃO vira `Invalid Date`: o `Date` do V8 rola "2026-02-31"
 * para 3 de março em silêncio. Só a conferência componente a componente pega.
 */
function paraInstanteDoPlano(valor: string | Date, campo: string, fimDoDia: boolean): Date {
  if (valor instanceof Date) {
    if (Number.isNaN(valor.getTime())) {
      throw new CreativeError('JANELA_INVALIDA', `A data de ${campo} não é válida.`, 400)
    }
    return valor
  }
  const texto = String(valor ?? '').trim()
  if (!texto) {
    throw new CreativeError('JANELA_INVALIDA', `Falta a data de ${campo} do plano.`, 400)
  }

  if (/^\d{4}-\d{2}-\d{2}$/.test(texto)) {
    const [ano, mes, dia] = texto.split('-').map(Number)
    const teste = new Date(Date.UTC(ano, mes - 1, dia))
    if (
      teste.getUTCFullYear() !== ano ||
      teste.getUTCMonth() !== mes - 1 ||
      teste.getUTCDate() !== dia
    ) {
      throw new CreativeError(
        'JANELA_INVALIDA',
        `A data de ${campo} ("${texto}") não é um dia que existe. Use AAAA-MM-DD.`,
        400,
      )
    }
    return new Date(`${texto}T${fimDoDia ? '23:59:59.999' : '00:00:00.000'}${OFFSET_BRT}`)
  }

  try {
    return parseBRT(texto)
  } catch {
    throw new CreativeError(
      'JANELA_INVALIDA',
      `A data de ${campo} ("${texto}") não foi reconhecida. Use AAAA-MM-DD ou "AAAA-MM-DD HH:mm".`,
      400,
    )
  }
}

/** O horário de um item. `null`/ausente é legítimo: ainda não foi decidido. */
function paraInstanteDoItem(valor: string | Date | null | undefined, posicao: number): Date | null {
  if (valor === null || valor === undefined || valor === '') return null
  if (valor instanceof Date) {
    if (Number.isNaN(valor.getTime())) {
      throw new CreativeError('DATA_INVALIDA', `O horário do item ${posicao} não é válido.`, 400)
    }
    return valor
  }
  const texto = String(valor).trim()
  if (/^\d{4}-\d{2}-\d{2}$/.test(texto)) {
    // Data pura num item quase sempre é engano de quem chama (o item é um post,
    // e post tem hora). Cai no meio-dia BRT em vez de na virada do dia, que
    // publicaria de madrugada.
    return new Date(`${texto}T12:00:00.000${OFFSET_BRT}`)
  }
  return parseBRT(texto)
}

function diaBRT(data: Date): string {
  return data.toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' })
}

// ── Leitura ─────────────────────────────────────────────────────────────────

const INCLUDE_ITENS = {
  itens: { orderBy: [{ ordem: 'asc' as const }, { quando: 'asc' as const }] },
}

/** O plano com os itens e o progresso agregado — o que toda tela e tool leem. */
export type PlanoComItens = Awaited<ReturnType<typeof lerPlano>>

function comProgresso<T extends { itens: Array<{ status: string }> }>(
  plano: T,
): T & { progresso: ProgressoDoPlano } {
  return { ...plano, progresso: progressoDoPlano(plano.itens) }
}

/**
 * Um plano do projeto, com os itens em ordem.
 *
 * `projectId` no `where` não é redundância defensiva: é o que faz o plano de
 * outro cliente ser 404 em vez de 403 — negar depois de confirmar a existência
 * já entrega informação.
 */
export async function lerPlano(projectId: number, planoId: string) {
  const plano = await db.planoDeConteudo.findFirst({
    where: { id: planoId, projectId },
    include: INCLUDE_ITENS,
  })
  if (!plano) {
    throw new CreativeError('PLANO_NAO_ENCONTRADO', 'Este plano não existe neste cliente.', 404)
  }
  return comProgresso(plano)
}

/**
 * O plano ativo do cliente — o mais recente, quando há mais de um.
 *
 * Criar um plano NÃO arquiva o anterior de propósito: montar a semana que vem
 * enquanto a desta ainda roda é uso normal, e arquivar sozinho apagaria da tela
 * uma leva em andamento. Quem encerra a leva é gente, por `arquivarPlano`.
 */
export async function planoAtivo(projectId: number) {
  const plano = await db.planoDeConteudo.findFirst({
    where: { projectId, status: 'ativo' },
    orderBy: { createdAt: 'desc' },
    include: INCLUDE_ITENS,
  })
  return plano ? comProgresso(plano) : null
}

export async function listarPlanos(
  projectId: number,
  opcoes: { status?: string | null; limite?: number } = {},
) {
  const status = opcoes.status ? normalizarStatusDoPlano(opcoes.status) : undefined
  if (opcoes.status && !status) {
    throw new CreativeError(
      'STATUS_INVALIDO',
      `Situação de plano desconhecida: "${opcoes.status}". Use "ativo" ou "arquivado".`,
      400,
    )
  }
  const limite = Math.min(Math.max(opcoes.limite ?? 20, 1), 100)

  const planos = await db.planoDeConteudo.findMany({
    where: { projectId, ...(status ? { status } : {}) },
    orderBy: { createdAt: 'desc' },
    take: limite,
    // Só a situação de cada item: a lista mostra o progresso agregado, e trazer
    // a copy inteira de todas as levas só para contar seria desperdício.
    include: { itens: { select: { status: true } } },
  })

  return planos.map((plano) => ({
    id: plano.id,
    projectId: plano.projectId,
    titulo: plano.titulo,
    inicio: plano.inicio,
    fim: plano.fim,
    status: plano.status as StatusDoPlano,
    origem: plano.origem,
    versao: plano.versao,
    criadoPor: plano.criadoPor,
    createdAt: plano.createdAt,
    updatedAt: plano.updatedAt,
    totalDeItens: plano.itens.length,
    progresso: progressoDoPlano(plano.itens),
  }))
}

// ── Criação ─────────────────────────────────────────────────────────────────

function normalizarItem(
  entrada: ItemDePlanoInput,
  indice: number,
  janela: { inicio: Date; fim: Date },
  avisos: string[],
) {
  const posicao = indice + 1

  const formato = normalizarFormato(entrada.formato)
  if (!formato) {
    throw new CreativeError(
      'FORMATO_INVALIDO',
      entrada.formato
        ? `Formato desconhecido no item ${posicao}: "${entrada.formato}". Use story, feed ou quadrado.`
        : `Falta o formato do item ${posicao} — use story, feed ou quadrado.`,
      400,
    )
  }

  const via: ViaDoItem = entrada.via ? (normalizarVia(entrada.via) as ViaDoItem) : VIA_PADRAO
  if (entrada.via && !normalizarVia(entrada.via)) {
    throw new CreativeError(
      'VIA_INVALIDA',
      `Via desconhecida no item ${posicao}: "${entrada.via}". Use "template" (modelo do cliente) ou "ia".`,
      400,
    )
  }

  let escopo: EscopoAprendizado = ESCOPO_PADRAO
  if (entrada.escopo) {
    const normalizado = normalizarEscopo(entrada.escopo)
    if (!normalizado) {
      throw new CreativeError(
        'ESCOPO_INVALIDO',
        `Escopo desconhecido no item ${posicao}: "${entrada.escopo}". Use rotina, campanha ou pontual.`,
        400,
      )
    }
    escopo = normalizado
  }

  const quando = paraInstanteDoItem(entrada.quando, posicao)

  /**
   * Horário fora da janela é AVISO, nunca erro. A campanha pode ter sido
   * prorrogada e a janela do plano pode ter sido escrita com um dia a menos —
   * recusar a leva inteira por metadado é pior do que aceitá-la com ressalva.
   * Mesma regra de campanha vencida em `aprovar-rascunhos`.
   */
  if (quando && (quando < janela.inicio || quando > janela.fim)) {
    avisos.push(
      `O item ${posicao}${entrada.tema ? ` (${entrada.tema})` : ''} está marcado para ` +
        `${diaBRT(quando)}, fora da janela do plano (${diaBRT(janela.inicio)} a ${diaBRT(janela.fim)}).`,
    )
  }

  const copy = (entrada.copyProposta ?? [])
    .filter((bloco): bloco is string => typeof bloco === 'string')
    .map((bloco) => bloco.trim())
    .filter(Boolean)

  return {
    ordem: Number.isInteger(entrada.ordem) ? (entrada.ordem as number) : indice,
    quando,
    tema: entrada.tema?.trim() || null,
    copyProposta: copy,
    legenda: entrada.legenda?.trim() || null,
    fotoUrl: entrada.fotoUrl?.trim() || null,
    fotoDriveId: entrada.fotoDriveId?.trim() || null,
    formato: formato as FormatoDoItem,
    via,
    sourcePageId: entrada.sourcePageId?.trim() || null,
    motivoDoSlot: entrada.motivoDoSlot?.trim() || null,
    escopo,
    campaignId: entrada.campaignId?.trim() || null,
    sugestaoId: entrada.sugestaoId?.trim() || null,
    ...(entrada.slides !== undefined ? { slides: entrada.slides as Prisma.InputJsonValue } : {}),
  }
}

/**
 * Cria a leva inteira — plano e itens — numa transação.
 *
 * O `create` aninhado do Prisma é uma transação por si: ou nascem os dois lados
 * ou nenhum. Plano sem item é a metade inútil que este cuidado evita.
 */
export async function criarPlano(input: CriarPlanoInput) {
  const projectId = Number(input.projectId)
  if (!Number.isInteger(projectId) || projectId <= 0) {
    throw new CreativeError('PROJECT_NOT_FOUND', `Projeto inválido: ${input.projectId}`, 400)
  }
  const projeto = await db.project.findUnique({ where: { id: projectId }, select: { id: true } })
  if (!projeto) {
    throw new CreativeError('PROJECT_NOT_FOUND', `Projeto não encontrado: ${projectId}`, 404)
  }

  const inicio = paraInstanteDoPlano(input.inicio, 'início', false)
  const fim = paraInstanteDoPlano(input.fim, 'fim', true)
  if (fim < inicio) {
    throw new CreativeError(
      'JANELA_INVALIDA',
      'O fim do plano é anterior ao começo — confira as datas.',
      400,
    )
  }

  const entradas = input.itens ?? []
  if (entradas.length > MAX_ITENS_POR_PLANO) {
    throw new CreativeError(
      'PLANO_GRANDE_DEMAIS',
      `Um plano aceita no máximo ${MAX_ITENS_POR_PLANO} itens — vieram ${entradas.length}.`,
      400,
    )
  }

  const avisos: string[] = []
  const itens = entradas.map((entrada, i) => normalizarItem(entrada, i, { inicio, fim }, avisos))
  if (itens.length === 0) {
    avisos.push('O plano foi criado sem nenhum item.')
  }

  const plano = await db.planoDeConteudo.create({
    data: {
      projectId,
      titulo: input.titulo?.trim() || null,
      inicio,
      fim,
      origem: input.origem?.trim() || null,
      versao: input.versao?.trim() || null,
      criadoPor: input.criadoPor || null,
      itens: { create: itens.map((item) => ({ ...item, projectId })) },
    },
    include: INCLUDE_ITENS,
  })

  return { plano: comProgresso(plano), avisos }
}

/**
 * Anexa itens ao PLANO ATIVO do projeto — criando um se não houver.
 *
 * É o que faz a bancada ser da EQUIPE: o "Adicionar à fila" do compositor
 * gravava só no navegador de quem clicou, e a fila de um nunca aparecia para
 * os outros. Item anexado aqui hidrata em todo navegador com acesso ao
 * projeto, exatamente como os itens montados no chat.
 *
 * O plano criado no primeiro anexo cobre de HOJE até domingo (a janela como a
 * agência planeja); item fora dela continua sendo AVISO, nunca recusa.
 */
export async function anexarItensAoPlanoAtivo(input: {
  projectId: number
  itens: ItemDePlanoInput[]
  criadoPor?: string | null
}): Promise<{ plano: NonNullable<Awaited<ReturnType<typeof planoAtivo>>>; criados: string[] }> {
  const projectId = Number(input.projectId)
  if (!Number.isInteger(projectId) || projectId <= 0) {
    throw new CreativeError('PROJECT_NOT_FOUND', `Projeto inválido: ${input.projectId}`, 400)
  }
  if (input.itens.length === 0) {
    throw new CreativeError('SEM_ITENS', 'Não veio nenhum item para anexar.', 400)
  }

  let alvo = await planoAtivo(projectId)
  if (!alvo) {
    const agora = new Date()
    const inicio = diaBRTDe(agora)
    const fim = diaBRTDe(new Date(agora.getTime() + (diasAteDomingoBRT(agora) - 1) * 24 * 3_600_000))
    const criado = await criarPlano({
      projectId,
      titulo: `Bancada — semana de ${inicio.slice(8, 10)}/${inicio.slice(5, 7)}`,
      inicio,
      fim,
      origem: 'bancada',
      criadoPor: input.criadoPor ?? null,
      itens: [],
    })
    alvo = criado.plano
  }

  if (alvo.itens.length + input.itens.length > MAX_ITENS_POR_PLANO) {
    throw new CreativeError(
      'PLANO_GRANDE_DEMAIS',
      `O plano já tem ${alvo.itens.length} itens; anexar ${input.itens.length} passaria do teto de ${MAX_ITENS_POR_PLANO}.`,
      400,
    )
  }

  const avisos: string[] = []
  const base = alvo.itens.length
  const janela = { inicio: alvo.inicio, fim: alvo.fim }
  const criados: string[] = []
  for (const [i, entrada] of input.itens.entries()) {
    const dados = normalizarItem({ ...entrada, ordem: entrada.ordem ?? base + i }, base + i, janela, avisos)
    const linha = await db.itemDePlano.create({
      data: { ...dados, planoId: alvo.id, projectId },
      select: { id: true },
    })
    criados.push(linha.id)
  }

  const plano = await lerPlano(projectId, alvo.id)
  return { plano: { ...plano, avisos } as never, criados }
}

// ── Edição do plano ─────────────────────────────────────────────────────────

export async function atualizarPlano(input: {
  projectId: number
  planoId: string
  titulo?: string | null
  status?: string | null
}) {
  await lerPlano(input.projectId, input.planoId) // 404 fora do projeto

  const data: { titulo?: string | null; status?: StatusDoPlano } = {}
  if (input.titulo !== undefined) data.titulo = input.titulo?.trim() || null
  if (input.status !== undefined && input.status !== null) {
    const status = normalizarStatusDoPlano(input.status)
    if (!status) {
      throw new CreativeError(
        'STATUS_INVALIDO',
        `Situação de plano desconhecida: "${input.status}". Use "ativo" ou "arquivado".`,
        400,
      )
    }
    data.status = status
  }

  const plano = await db.planoDeConteudo.update({
    where: { id: input.planoId },
    data,
    include: INCLUDE_ITENS,
  })
  return comProgresso(plano)
}

/** Encerra a leva. Os itens ficam — o plano é o registro do que se pretendeu. */
export async function arquivarPlano(projectId: number, planoId: string) {
  return atualizarPlano({ projectId, planoId, status: 'arquivado' })
}

// ── Edição do item ──────────────────────────────────────────────────────────

async function buscarItem(projectId: number, planoId: string, itemId: string) {
  const item = await db.itemDePlano.findFirst({
    where: { id: itemId, planoId, projectId },
    include: { plano: { select: { id: true, status: true, inicio: true, fim: true } } },
  })
  if (!item) {
    throw new CreativeError('ITEM_NAO_ENCONTRADO', 'Este item não existe neste plano.', 404)
  }
  return item
}

/**
 * Muda o CONTEÚDO de um item (copy, horário, foto, formato, via…).
 *
 * Duas recusas, com razões diferentes:
 *
 *  - item já gerado (`na-fila`, `gerando`, `pronto`, `agendado`) — mudar a copy
 *    depois de a arte existir faria o plano mentir sobre o que foi produzido;
 *  - plano ARQUIVADO — leva encerrada não se reabre por edição de item; quem
 *    quiser mexer volta o plano para ativo primeiro, que é uma decisão
 *    explícita e visível.
 *
 * Toda edição devolve o item a `editado`, inclusive quando ele estava
 * `aprovado`: a aprovação era do que estava lá antes. É o mesmo instinto do
 * `editar-post`, que só aceita rascunho e obriga a desaprovar primeiro.
 *
 * `decididoPor` (o `User.id` INTERNO, nunca o clerkId) entra na assinatura e
 * ainda não é gravado: `ItemDePlano` não tem coluna de auditoria de propósito —
 * quem guarda "quem decidiu o quê" é o `LearningSignal`, e a edição de item de
 * plano vira sinal de `copy` junto com as tools da fatia seguinte. Está aqui
 * para que os chamadores nasçam passando o campo certo.
 */
export async function atualizarItem(input: {
  projectId: number
  planoId: string
  itemId: string
  patch: PatchDeItem
  decididoPor?: string | null
}) {
  const item = await buscarItem(input.projectId, input.planoId, input.itemId)

  if (item.plano.status !== 'ativo') {
    throw new CreativeError(
      'PLANO_ARQUIVADO',
      'Este plano está arquivado — reative-o antes de mexer nos itens.',
      409,
    )
  }

  const statusAtual = normalizarStatusDoItem(item.status) ?? 'proposto'
  if (!itemEditavel(statusAtual)) {
    throw new CreativeError(
      'ITEM_NAO_EDITAVEL',
      `Não dá para editar: ${motivoDeNaoEditavel(statusAtual)}.`,
      409,
      { status: statusAtual },
    )
  }

  const patch = input.patch ?? {}
  const avisos: string[] = []
  const data: Prisma.ItemDePlanoUpdateInput = {}

  if (patch.ordem !== undefined && Number.isInteger(patch.ordem)) data.ordem = patch.ordem
  if (patch.tema !== undefined) data.tema = patch.tema?.trim() || null
  if (patch.legenda !== undefined) data.legenda = patch.legenda?.trim() || null
  if (patch.fotoUrl !== undefined) data.fotoUrl = patch.fotoUrl?.trim() || null
  if (patch.fotoDriveId !== undefined) data.fotoDriveId = patch.fotoDriveId?.trim() || null
  if (patch.sourcePageId !== undefined) data.sourcePageId = patch.sourcePageId?.trim() || null
  if (patch.motivoDoSlot !== undefined) data.motivoDoSlot = patch.motivoDoSlot?.trim() || null
  if (patch.campaignId !== undefined) data.campaignId = patch.campaignId?.trim() || null
  if (patch.slides !== undefined) data.slides = patch.slides as Prisma.InputJsonValue

  if (patch.copyProposta !== undefined) {
    data.copyProposta = (patch.copyProposta ?? [])
      .filter((bloco): bloco is string => typeof bloco === 'string')
      .map((bloco) => bloco.trim())
      .filter(Boolean)
  }

  if (patch.formato !== undefined) {
    const formato = normalizarFormato(patch.formato)
    if (!formato) {
      throw new CreativeError(
        'FORMATO_INVALIDO',
        `Formato desconhecido: "${patch.formato}". Use story, feed ou quadrado.`,
        400,
      )
    }
    data.formato = formato
  }

  if (patch.via !== undefined && patch.via !== null) {
    const via = normalizarVia(patch.via)
    if (!via) {
      throw new CreativeError(
        'VIA_INVALIDA',
        `Via desconhecida: "${patch.via}". Use "template" (modelo do cliente) ou "ia".`,
        400,
      )
    }
    data.via = via
  }

  if (patch.escopo !== undefined && patch.escopo !== null) {
    const escopo = normalizarEscopo(patch.escopo)
    if (!escopo) {
      throw new CreativeError(
        'ESCOPO_INVALIDO',
        `Escopo desconhecido: "${patch.escopo}". Use rotina, campanha ou pontual.`,
        400,
      )
    }
    data.escopo = escopo
  }

  if (patch.quando !== undefined) {
    const quando = paraInstanteDoItem(patch.quando, item.ordem + 1)
    data.quando = quando
    if (quando && (quando < item.plano.inicio || quando > item.plano.fim)) {
      avisos.push(
        `O novo horário (${diaBRT(quando)}) está fora da janela do plano ` +
          `(${diaBRT(item.plano.inicio)} a ${diaBRT(item.plano.fim)}).`,
      )
    }
  }

  if (Object.keys(data).length === 0) {
    // Nada mudou: não vale reescrever o status nem o `updatedAt`.
    return { item, avisos }
  }

  // Editar devolve o item a `editado` — a aprovação anterior era do conteúdo
  // anterior. `transicaoPermitida` cobre os quatro pontos de partida editáveis.
  if (statusAtual !== 'editado' && transicaoPermitida(statusAtual, 'editado')) {
    data.status = 'editado'
  }

  const atualizado = await db.itemDePlano.update({
    where: { id: input.itemId },
    data,
    include: { plano: { select: { id: true, status: true, inicio: true, fim: true } } },
  })
  return { item: atualizado, avisos }
}

/**
 * Remove um item da leva — o "tirar da fila" da bancada.
 *
 * DELETE de verdade, não transição: o item retirado deixa de existir para
 * TODAS as superfícies. É o que faz a lixeira sobreviver ao refresh — antes o
 * card sumia só do localStorage de quem clicou, e a hidratação seguinte o
 * recriava do plano (medido pelo Ciro em 13/08/2026).
 *
 * O que o item APONTAVA fica: Generation, post e sinais não têm FK com ele de
 * propósito, então tirar a linha da leva não apaga arte nem publicação. O
 * sinal de descarte (`descartada`) é de quem removeu — a bancada já o registra
 * antes de chamar aqui. Funciona com o plano arquivado, como `transicionarItem`:
 * recusar deixaria o card órfão de uma leva encerrada sem como sair da tela.
 */
export async function removerItem(input: {
  projectId: number
  planoId: string
  itemId: string
}) {
  const item = await buscarItem(input.projectId, input.planoId, input.itemId)
  await db.itemDePlano.delete({ where: { id: item.id } })
  return { itemId: item.id, status: statusDoItem(item) }
}

/**
 * O ÚNICO ponto que muda a situação de um item.
 *
 * Diferente de `atualizarItem`, funciona com o plano arquivado: uma geração já
 * em voo precisa poder terminar (`gerando` → `pronto`/`erro`) mesmo que alguém
 * tenha encerrado a leva no meio — travar aqui deixaria o item preso para
 * sempre em "gerando", que é o defeito que a fila durável da F0.3 veio matar.
 */
export async function transicionarItem(input: {
  projectId: number
  planoId: string
  itemId: string
  para: string
  motivo?: string | null
  erro?: string | null
  /** Carrossel: a série com os generationIds/URLs do momento da transição. */
  slides?: unknown
  generationId?: string | null
  pageId?: string | null
  postId?: string | null
  decididoPor?: string | null
}) {
  const item = await buscarItem(input.projectId, input.planoId, input.itemId)

  const para = normalizarStatusDoItem(input.para)
  if (!para) {
    throw new CreativeError(
      'STATUS_INVALIDO',
      `Situação desconhecida: "${input.para}".`,
      400,
    )
  }

  const de = normalizarStatusDoItem(item.status) ?? 'proposto'
  if (!transicaoPermitida(de, para)) {
    throw new CreativeError(
      'TRANSICAO_INVALIDA',
      `Um item ${de === 'agendado' ? 'que já foi para a agenda' : `em "${de}"`} não pode passar para "${para}".`,
      409,
      { de, para },
    )
  }

  const data: Prisma.ItemDePlanoUpdateInput = { status: para }

  if (para === 'reprovado') data.motivoReprovacao = input.motivo?.trim() || null
  if (para === 'erro') data.erro = (input.erro ?? input.motivo)?.trim() || 'A geração falhou.'
  // Sair do erro limpa a mensagem: guardar a falha antiga faria a tela mostrar
  // um problema que já não existe.
  if (para !== 'erro' && de === 'erro') data.erro = null

  if (input.generationId !== undefined) data.generationId = input.generationId?.trim() || null
  if (input.pageId !== undefined) data.pageId = input.pageId?.trim() || null
  if (input.postId !== undefined) data.postId = input.postId?.trim() || null
  if (input.slides !== undefined) data.slides = input.slides as Prisma.InputJsonValue

  const atualizado = await db.itemDePlano.update({
    where: { id: input.itemId },
    data,
    include: { plano: { select: { id: true, status: true, inicio: true, fim: true } } },
  })
  return atualizado
}

/** Situação de um item, já normalizada — para quem lê linha crua do banco. */
export function statusDoItem(item: { status: string }): StatusDoItem {
  return normalizarStatusDoItem(item.status) ?? 'proposto'
}
