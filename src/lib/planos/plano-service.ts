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

import { Prisma } from '@prisma/client'
import { db } from '@/lib/db'
import { CreativeError } from '@/lib/creatives/errors'
import { diaBRTDe, diasAteDomingoBRT, lerFotoCandidatas } from './proposta-de-semana'
import { parseBRT } from '@/lib/creatives/agendar'
import { ESCOPO_PADRAO, normalizarEscopo, type EscopoAprendizado } from '@/lib/posts/learning-scope'
import { CopyAutoralInvalida, copyDoItemNoPatch, copyDoItemNovo, type CopyDoItem } from './copy-do-item'
import { CopyLegadaIncompativel, HistoricoDaCopyCheio, MAX_REVISOES_DA_COPY, RevisaoDaCopyInvalida, orientacaoDosProblemas, orientacaoEmFrase } from '@/lib/copy-autoral'
import {
  cenaDasReferencias,
  validarReferencias,
  type ReferenciaDoItem,
} from '@/lib/planos/execucao'
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
  /** F1: o CONTRATO da copy autoral (`src/lib/copy-autoral`). Quando vem, manda; `copyProposta` vira só o espelho posicional dele. `null` no patch limpa. */
  copyAutoral?: unknown
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
  /**
   * Direção adicional para a geração por IA — o `pedido` do serviço de arte.
   * Sem ela o pedido é o TEMA, que é só o assunto ("Atendimento com IA e CRM").
   */
  direcao?: string | null
  /** Ajuste autorizado na FOTO desta peça (`instrucaoImagem`). Nulo = foto intocada. */
  ajusteDaFoto?: string | null
  /**
   * Referências de imagem com papel (`[{ role, driveFileId?|url?, label? }]`).
   * Validadas em runtime (`validarReferencias`); presentes, VENCEM
   * `fotoUrl`/`fotoDriveId` — o espelho passa a ser derivado da cena da lista.
   */
  referencias?: unknown
  /** Co-branding: projeto do cliente CITADO, cuja logo oficial é composta na arte. */
  clienteProjectId?: number | null
  /**
   * Top-3 candidatas de foto da emissão (F4): a escolhida primeiro + até 2
   * alternativas, `[{ driveFileId, fileName?, vaga: 'score' | 'exploracao',
   * sugestaoId? }]`. Payload do card, lido DEFENSIVAMENTE
   * (`lerFotoCandidatas`) — entrada inválida é descartada, nunca derruba a
   * leva: a verdade do que foi OFERECIDO mora no `LearningSignal`.
   */
  fotoCandidatas?: unknown
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
  /** F1: o CONTRATO da copy autoral (`src/lib/copy-autoral`). Quando vem, manda; `copyProposta` vira só o espelho posicional dele. `null` no patch limpa. */
  copyAutoral?: unknown
  legenda?: string | null
  fotoUrl?: string | null
  fotoDriveId?: string | null
  formato?: string
  via?: string | null
  sourcePageId?: string | null
  direcao?: string | null
  ajusteDaFoto?: string | null
  /** Substitui a lista INTEIRA; `[]` limpa lista E espelho ("tirei as fotos"). */
  referencias?: unknown
  clienteProjectId?: number | null
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
/**
 * Nome dos clientes CITADOS nos itens (co-branding), para a bancada mostrar
 * "marca do cliente: X" sem precisar de outra ida ao servidor. Uma consulta
 * pelos ids distintos; item sem citação não paga nada.
 */
async function nomesDosClientesCitados(
  itens: Array<{ clienteProjectId: number | null }>,
): Promise<Map<number, string>> {
  const ids = [...new Set(itens.map((i) => i.clienteProjectId).filter((v): v is number => typeof v === 'number'))]
  if (ids.length === 0) return new Map()
  const projetos = await db.project.findMany({ where: { id: { in: ids } }, select: { id: true, name: true } })
  return new Map(projetos.map((p) => [p.id, p.name]))
}

async function imagensAtuaisDosItens<T extends { generationId: string | null }>(
  projectId: number,
  itens: T[],
): Promise<Array<T & { resultUrl?: string | null }>> {
  const ids = itens.flatMap((item) => item.generationId ? [item.generationId] : [])
  const geracoes = ids.length ? await db.generation.findMany({
    where: { projectId, id: { in: ids }, status: 'COMPLETED' },
    select: { id: true, resultUrl: true },
  }) : []
  const urls = new Map(geracoes.map((g) => [g.id, g.resultUrl]))
  return itens.map((item) => ({ ...item, resultUrl: item.generationId ? (urls.get(item.generationId) ?? null) : null }))
}

export async function lerPlano(projectId: number, planoId: string) {
  const plano = await db.planoDeConteudo.findFirst({
    where: { id: planoId, projectId },
    include: INCLUDE_ITENS,
  })
  if (!plano) {
    throw new CreativeError('PLANO_NAO_ENCONTRADO', 'Este plano não existe neste cliente.', 404)
  }
  const nomes = await nomesDosClientesCitados(plano.itens)
  return comProgresso({
    ...plano,
    itens: (await imagensAtuaisDosItens(projectId, plano.itens)).map((item) => ({
      ...item,
      /** Derivado, não coluna: o nome do cliente citado, para a revisão na bancada. */
      clienteCitadoNome: item.clienteProjectId ? (nomes.get(item.clienteProjectId) ?? null) : null,
    })),
  })
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
  return plano ? comProgresso({ ...plano, itens: await imagensAtuaisDosItens(projectId, plano.itens) }) : null
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

/** Id de projeto citado: inteiro positivo ou nada — string, zero e negativo viram null. */
function clienteProjectIdValido(valor: unknown): number | null {
  const n = typeof valor === 'string' ? Number(valor) : valor
  return typeof n === 'number' && Number.isInteger(n) && n > 0 ? n : null
}

/**
 * Valida a lista de referências vinda de fora. `undefined` = campo ausente
 * (nada a fazer); lista vazia devolve `[]` (quem chama decide se limpa).
 */
function normalizarReferencias(bruto: unknown, onde: string): ReferenciaDoItem[] | null {
  if (bruto === undefined || bruto === null) return null
  const resultado = validarReferencias(bruto)
  if (!resultado.ok) {
    throw new CreativeError('REFERENCIAS_INVALIDAS', `Referências do ${onde}: ${resultado.motivo}`, 400)
  }
  return resultado.referencias
}

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
      `Via desconhecida no item ${posicao}: "${entrada.via}". Use "template" (modelo do cliente), "compor" (pelo editor) ou "ia".`,
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

  // F1: o contrato da copy autoral, quando vem, manda; `copyProposta` é o
  // espelho posicional dele. Contrato que não passa no leitor recusa o item —
  // nunca é gravado pela metade.
  let copyDoItem: CopyDoItem
  try {
    copyDoItem = copyDoItemNovo(entrada)
  } catch (erro) {
    throw erroDaCopyDoItem(erro, `do item ${posicao}`) ?? erro
  }
  const copy = copyDoItem.copyProposta ?? []

  // Referências com papel: presentes, elas VENCEM os campos soltos — o espelho
  // fotoUrl/fotoDriveId passa a ser a CENA da lista, e é dele que a capa do
  // card e os itens de leitura antigos continuam vivendo.
  const referencias = normalizarReferencias(entrada.referencias, `item ${posicao}`)
  const cena = referencias ? cenaDasReferencias(referencias) : null

  // Candidatas do card (F4): leitura defensiva, nunca recusa — candidata é
  // conveniência de UI, e derrubar uma leva por causa dela inverteria o peso.
  const fotoCandidatas = lerFotoCandidatas(entrada.fotoCandidatas)

  return {
    ordem: Number.isInteger(entrada.ordem) ? (entrada.ordem as number) : indice,
    quando,
    tema: entrada.tema?.trim() || null,
    copyProposta: copy,
    ...(copyDoItem.copyAutoral ? { copyAutoral: copyDoItem.copyAutoral as unknown as Prisma.InputJsonValue } : {}),
    legenda: entrada.legenda?.trim() || null,
    fotoUrl: referencias ? (cena?.url ?? null) : entrada.fotoUrl?.trim() || null,
    fotoDriveId: referencias ? (cena?.driveFileId ?? null) : entrada.fotoDriveId?.trim() || null,
    ...(referencias ? { referencias: referencias as unknown as Prisma.InputJsonValue } : {}),
    ...(fotoCandidatas.length > 0
      ? { fotoCandidatas: fotoCandidatas as unknown as Prisma.InputJsonValue }
      : {}),
    formato: formato as FormatoDoItem,
    via,
    sourcePageId: entrada.sourcePageId?.trim() || null,
    direcao: entrada.direcao?.trim() || null,
    ajusteDaFoto: entrada.ajusteDaFoto?.trim() || null,
    clienteProjectId: clienteProjectIdValido(entrada.clienteProjectId),
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
  /** Quem monta a leva quando não há nenhuma em aberto ('bancada' | 'chat'). */
  origem?: string | null
}): Promise<{ plano: NonNullable<Awaited<ReturnType<typeof planoAtivo>>>; criados: string[]; avisos: string[] }> {
  const projectId = Number(input.projectId)
  if (!Number.isInteger(projectId) || projectId <= 0) {
    throw new CreativeError('PROJECT_NOT_FOUND', `Projeto inválido: ${input.projectId}`, 400)
  }
  if (input.itens.length === 0) {
    throw new CreativeError('SEM_ITENS', 'Não veio nenhum item para anexar.', 400)
  }

  let alvo = await planoAtivo(projectId)

  /**
   * 🔴 O LOTE INTEIRO é normalizado ANTES de qualquer escrita (RB-01 da revisão
   * do rebase, 21/09/2026) — como `criarPlano` sempre fez, e o que faltava aqui.
   * `normalizarItem` recusa por ITEM em quatro famílias (formato, via, escopo e
   * a copy: `COPY_AUTORAL_INVALIDA`, `COPY_HISTORICO_CHEIO`,
   * `COPY_LEGADA_INCOMPATIVEL`, `COPY_REVISAO_INVALIDA`), e normalizar dentro do
   * laço de gravação fazia o item 2 recusado deixar o item 1 no banco: a chamada
   * falhava sem devolver os ids, e reenviar a leva corrigida DUPLICAVA o item 1.
   * A mesma armadilha valia para a criação automática do plano — um lote todo
   * recusado deixava para trás uma leva vazia.
   *
   * Por isso a janela e o offset são calculados sem escrever: com leva em aberto
   * saem dela; sem nenhuma, são os que a leva nova terá (a janela é só o texto do
   * aviso de item fora do período, mas sai idêntica de propósito).
   */
  const base = alvo ? alvo.itens.length : 0
  let janela: { inicio: Date; fim: Date }
  let levaNova: { inicio: string; fim: string; titulo: string } | null = null
  if (alvo) {
    janela = { inicio: alvo.inicio, fim: alvo.fim }
  } else {
    const agora = new Date()
    const inicio = diaBRTDe(agora)
    const fim = diaBRTDe(new Date(agora.getTime() + (diasAteDomingoBRT(agora) - 1) * 24 * 3_600_000))
    levaNova = { inicio, fim, titulo: `Bancada — semana de ${inicio.slice(8, 10)}/${inicio.slice(5, 7)}` }
    janela = { inicio: paraInstanteDoPlano(inicio, 'início', false), fim: paraInstanteDoPlano(fim, 'fim', true) }
  }

  if (base + input.itens.length > MAX_ITENS_POR_PLANO) {
    throw new CreativeError(
      'PLANO_GRANDE_DEMAIS',
      `O plano já tem ${base} itens; anexar ${input.itens.length} passaria do teto de ${MAX_ITENS_POR_PLANO}.`,
      400,
    )
  }

  const avisos: string[] = []
  const prontos = input.itens.map((entrada, i) =>
    normalizarItem({ ...entrada, ordem: entrada.ordem ?? base + i }, base + i, janela, avisos),
  )

  // ── Daqui para baixo, ESCRITA. Nada acima dela grava. ──
  if (!alvo) {
    const criado = await criarPlano({
      projectId,
      titulo: levaNova.titulo,
      inicio: levaNova.inicio,
      fim: levaNova.fim,
      origem: input.origem ?? 'bancada',
      criadoPor: input.criadoPor ?? null,
      itens: [],
    })
    alvo = criado.plano
  }

  const criados: string[] = []
  for (const dados of prontos) {
    const linha = await db.itemDePlano.create({
      data: { ...dados, planoId: alvo.id, projectId },
      select: { id: true },
    })
    criados.push(linha.id)
  }

  const plano = await lerPlano(projectId, alvo.id)
  return { plano: { ...plano, avisos } as never, criados, avisos }
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

/**
 * As recusas do contrato da copy viram erro 4xx explícito, em português e com o
 * que fazer — nunca 500. `null` quando o erro não é do contrato (sobe como veio).
 *  - `CopyAutoralInvalida` (400): o contrato mandado não passa no leitor;
 *  - `CopyLegadaIncompativel` (400): a copy legada não cabe no contrato — nada
 *    foi cortado nem redistribuído (PR2-01);
 *  - `HistoricoDaCopyCheio` (409): o contrato do item já tem o máximo de
 *    revisões e a edição não foi registrada — nada foi gravado (PR2-02);
 *  - `RevisaoDaCopyInvalida` (400): a revisão produziria uma copy que o leitor
 *    recusa — nada foi gravado (9238098f).
 */
function erroDaCopyDoItem(erro: unknown, qual: string | null): CreativeError | null {
  const daCopy = qual ? ` ${qual}` : ''
  if (erro instanceof CopyAutoralInvalida) {
    return new CreativeError('COPY_AUTORAL_INVALIDA', `A copy autoral${daCopy} não passou no contrato: ${erro.problemas.join('; ')}.${orientacaoEmFrase(erro.orientacao)}`, 400, { problemas: erro.problemas, orientacao: erro.orientacao })
  }
  if (erro instanceof CopyLegadaIncompativel) {
    const problemas = erro.problemas.map((p) => (p.bloco ? `${p.bloco}: ${p.mensagem}` : p.mensagem))
    const orientacao = orientacaoDosProblemas(erro.problemas)
    return new CreativeError('COPY_LEGADA_INCOMPATIVEL', `A copy${daCopy} não cabe no contrato da copy autoral (nada foi cortado nem redistribuído): ${problemas.join('; ')}.${orientacaoEmFrase(orientacao)}`, 400, { problemas, orientacao })
  }
  if (erro instanceof RevisaoDaCopyInvalida) {
    const problemas = erro.problemas.map((p) => (p.bloco ? `${p.bloco}: ${p.mensagem}` : p.mensagem))
    const orientacao = orientacaoDosProblemas(erro.problemas)
    return new CreativeError('COPY_REVISAO_INVALIDA', `A edição da copy${daCopy} não cabe no contrato da copy autoral e não foi registrada — nada foi gravado: ${problemas.join('; ')}.${orientacaoEmFrase(orientacao)}`, 400, { problemas, orientacao })
  }
  if (erro instanceof HistoricoDaCopyCheio) {
    return new CreativeError(
      'COPY_HISTORICO_CHEIO',
      `O histórico da copy${daCopy} chegou ao limite de ${MAX_REVISOES_DA_COPY} revisões, e esta edição do texto não foi registrada — nada foi gravado. Para seguir editando, mande a copy inteira como contrato novo (copyAutoral), que recomeça o histórico, ou remova o contrato (copyAutoral: null) e edite só a lista.`,
      409,
      { revisoes: erro.copy.revisoes.length, blocos: erro.mudancas.map((m) => m.id) },
    )
  }
  return null
}

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
export async function atualizarItem(input: EntradaDeAtualizacaoDoItem) {
  /**
   * A escrita é condicionada à VERSÃO LIDA do item (`updatedAt`) — PR3-F04 da
   * revisão FINAL do Codex sobre abac9b34, 18/09/2026. A revisão da copy é
   * calculada sobre o contrato lido e grava o histórico INTEIRO: duas edições
   * concorrentes que gravassem por `id` deixavam a última apagar a revisão da
   * primeira. Perdida a corrida, o item é RELIDO e a edição recalculada sobre
   * ele (a lista de quem grava por último continua valendo, como sempre foi,
   * mas o histórico guarda as duas); depois de insistir, 409 explícito.
   */
  for (let volta = 0; volta < 3; volta++) {
    const r = await tentarAtualizarItem(input)
    if (r) return r
  }
  throw new CreativeError(
    'ITEM_MUDOU_DURANTE',
    'O item foi editado por outra pessoa (ou pelo chat) enquanto esta edição era gravada, e ela NÃO foi gravada. Veja o item como está agora e refaça a edição se ainda fizer sentido.',
    409,
  )
}

interface EntradaDeAtualizacaoDoItem {
  projectId: number
  planoId: string
  itemId: string
  patch: PatchDeItem
  decididoPor?: string | null
  /** Quem assina a revisão da copy quando o patch mexe no texto: o chat (`claude`) ou a bancada/app (`equipe`, o default). */
  autorDaCopy?: 'claude' | 'equipe'
}

/** Uma volta de `atualizarItem`: `null` quando o item mudou entre a leitura e a escrita (nada foi gravado). */
async function tentarAtualizarItem(input: EntradaDeAtualizacaoDoItem) {
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
  if (patch.referencias !== undefined) {
    // Substituição da lista INTEIRA, como slides. O espelho acompanha: a capa
    // do card e todo leitor antigo continuam lendo fotoUrl/fotoDriveId, então
    // deixá-los para trás mostraria a foto que a pessoa acabou de trocar.
    const lista = normalizarReferencias(patch.referencias, 'item') ?? []
    if (lista.length === 0) {
      data.referencias = Prisma.DbNull
      data.fotoUrl = null
      data.fotoDriveId = null
    } else {
      const cena = cenaDasReferencias(lista)
      data.referencias = lista as unknown as Prisma.InputJsonValue
      data.fotoUrl = cena?.url ?? null
      data.fotoDriveId = cena?.driveFileId ?? null
    }
  }
  if (patch.sourcePageId !== undefined) data.sourcePageId = patch.sourcePageId?.trim() || null
  if (patch.direcao !== undefined) data.direcao = patch.direcao?.trim() || null
  if (patch.ajusteDaFoto !== undefined) data.ajusteDaFoto = patch.ajusteDaFoto?.trim() || null
  if (patch.clienteProjectId !== undefined) data.clienteProjectId = clienteProjectIdValido(patch.clienteProjectId)
  if (patch.motivoDoSlot !== undefined) data.motivoDoSlot = patch.motivoDoSlot?.trim() || null
  if (patch.campaignId !== undefined) data.campaignId = patch.campaignId?.trim() || null
  if (patch.slides !== undefined) data.slides = patch.slides as Prisma.InputJsonValue

  // F1: o contrato da copy do item. Edição só da lista posicional vira REVISÃO
  // do contrato (autor de quem mexeu) — ou o descarta com aviso quando não dá
  // para casar bloco a bloco. Contrato inválido recusa o patch inteiro.
  try {
    const copyPatch = copyDoItemNoPatch(item.copyAutoral, patch, {
      autor: input.autorDaCopy ?? 'equipe',
      superficie: input.autorDaCopy === 'claude' ? 'chat' : 'bancada',
    })
    if (copyPatch) {
      if (copyPatch.copyProposta !== undefined) data.copyProposta = copyPatch.copyProposta
      data.copyAutoral = copyPatch.copyAutoral ? (copyPatch.copyAutoral as unknown as Prisma.InputJsonValue) : Prisma.DbNull
      avisos.push(...copyPatch.avisos)
    }
  } catch (erro) {
    throw erroDaCopyDoItem(erro, null) ?? erro
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
        `Via desconhecida: "${patch.via}". Use "template" (modelo do cliente), "compor" (pelo editor) ou "ia".`,
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

  const gravada = await db.itemDePlano.updateMany({
    where: { id: input.itemId, updatedAt: item.updatedAt },
    data: data as Prisma.ItemDePlanoUpdateManyMutationInput,
  })
  if (gravada.count === 0) return null
  const atualizado = await buscarItem(input.projectId, input.planoId, input.itemId)
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
