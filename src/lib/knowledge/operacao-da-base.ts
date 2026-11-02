/**
 * A OPERAÇÃO sobre uma entrada da base pelo MCP: altera `dados` e, se pedido, o texto, com versão esperada, backup,
 * auditoria e idempotência. A trilha (`OperacaoDaBase`) nasce no MESMO commit da edição, então "operação não encontrada"
 * significa "nada foi gravado", e é isso que permite repetir depois de um timeout sem escrever duas vezes.
 *
 * O estado separa dado de índice: `concluida` só com os dois em dia. Depois de gravada a operação nunca volta atrás por
 * causa da indexação: a reindexação apaga os vetores antigos antes de subir os novos, e desfazer o texto não os traria
 * de volta. Repetir o mesmo `operacaoId` retoma só a indexação.
 */
import { db } from '@/lib/db'
import { CreativeError } from '@/lib/creatives/errors'
import { chunkText } from './chunking'
import { vetoresAusentes } from './vector-client'
import { invalidateProjectCache } from './cache'
import { reindexEntry } from './indexer'
import { editarEntradaCoordenada, type Lida } from './arrendamento'
import { ehIndexacaoEmAndamento, indexacaoPendenteDe, metadataComoObjeto, metadataDaPessoa } from './marca-de-indexado'
import {
  CAMPOS_PERMITIDOS,
  aplicarAlteracoes,
  camposSemConferencia,
  diffDeDados,
  divergenciasDe,
  hashDoPedido,
  linhasDatadas,
  problemasDasAlteracoes,
  temHorarioNosDados,
  versaoDaEntrada,
  type Alteracao,
  type Divergencia,
  type LinhaDaBase,
} from './dados-da-entrada'
import type { OperacaoDaBase, Prisma } from '@prisma/client'

/** Teto da base por entrada: acima disso uma entrada sozinha estoura o contexto de `getProjectPromptKnowledgeContext`. */
export const TETO_DE_TOKENS_DA_ENTRADA = 1200
/** O nome que `aceitarDivergencias` usa para autorizar a remoção de linhas datadas do texto. */
export const ACEITE_DE_EXCECOES = 'texto.excecoes'

export type EstadoDaOperacao = 'concluida' | 'indexacao_pendente' | 'indexacao_falhou' | 'superada'
const ESTADOS: Record<string, EstadoDaOperacao> = {
  CONCLUIDA: 'concluida',
  INDEXACAO_PENDENTE: 'indexacao_pendente',
  INDEXACAO_FALHOU: 'indexacao_falhou',
  SUPERADA: 'superada',
}
/** Os status que ainda devem indexação e seguram novas operações na entrada. */
const DEVE_INDEXACAO = ['INDEXACAO_PENDENTE', 'INDEXACAO_FALHOU']

export interface PedidoDeOperacao {
  projectId: number
  entradaId: string
  versaoEsperada: string
  operacaoId: string
  alteracoes?: Alteracao[]
  content?: string
  reverterOperacaoId?: string
  aceitarDivergencias?: string[]
  autorizarIndexacao?: boolean
  confirmado?: boolean
  /** `User.id` interno que assina a escrita (`resolverAutor`, hoje o dono do projeto). */
  autor: string
  /** Quem chamou de fato: o principal do conector. */
  ator: Record<string, unknown>
}

type Foto = { content: string; dados: Record<string, unknown> }

const fotoDe = (linha: { content: string; metadata: unknown }): Foto => ({ content: linha.content, dados: metadataDaPessoa(linha.metadata) })

export async function linhasDaBase(projectId: number): Promise<LinhaDaBase[]> {
  return db.knowledgeBaseEntry.findMany({
    where: { projectId, status: 'ACTIVE' },
    select: { id: true, title: true, content: true, updatedAt: true, expiresAt: true, metadata: true },
  })
}

/** O que os textos do cliente contradizem nos dados de qualquer entrada: é o aviso de quem edita só o texto. */
export function divergenciasDaBase(linhas: LinhaDaBase[]): Divergencia[] {
  return linhas
    .filter((l) => temHorarioNosDados(l.metadata))
    .flatMap((l) => divergenciasDe(metadataComoObjeto(l.metadata), linhas).map((d) => ({ ...d, entradaDosDados: l.id })))
}

/** O índice serve este texto? Chunks iguais E vetores no Upstash: reindexação que caiu no meio deixa chunk sem vetor. */
async function indiceDoTexto(entryId: string, content: string) {
  const chunks = chunkText(content)
  const custo = { trechos: chunks.length, tokens: Math.ceil(content.length / 4) }
  const gravados = await db.knowledgeChunk.findMany({ where: { entryId }, orderBy: { ordinal: 'asc' }, select: { content: true, vectorId: true } })
  if (chunks.length !== gravados.length || chunks.some((c, i) => c.content !== gravados[i].content)) {
    return { confere: false, motivo: 'os trechos gravados não são os deste texto', ...custo }
  }
  try {
    const ausentes = await vetoresAusentes(gravados.map((g) => g.vectorId))
    return ausentes.length === 0 ? { confere: true, motivo: null, ...custo } : { confere: false, motivo: `faltam ${ausentes.length} vetores no índice`, ...custo }
  } catch (erro) {
    console.error(`[knowledge] não deu para conferir os vetores da entrada ${entryId}:`, erro)
    return { confere: false, motivo: 'não deu para conferir os vetores no índice', ...custo }
  }
}

function lerOperacao(projectId: number, operacaoId: string) {
  return db.operacaoDaBase.findUnique({ where: { projectId_operacaoId: { projectId, operacaoId } } })
}

function resultado(op: OperacaoDaBase, extras: Record<string, unknown> = {}) {
  const estado = ESTADOS[op.status]
  const mensagens: Record<EstadoDaOperacao, string> = {
    concluida: 'Operação concluída: os dados foram gravados e o índice ficou em dia ao terminar.',
    indexacao_pendente: `Os dados foram gravados, mas a indexação está PENDENTE: ${op.erroIndexacao ?? 'ela ainda não terminou'}. Repita a chamada com o mesmo operacaoId para retomar.`,
    indexacao_falhou: `Os dados foram gravados, mas a indexação FALHOU: ${op.erroIndexacao ?? 'erro desconhecido'}. A entrada pode estar fora da busca. Repita a chamada com o mesmo operacaoId para retomar; a escrita não se repete.`,
    superada: 'Os dados foram gravados, mas o texto da entrada mudou depois e a indexação desta operação NÃO foi retomada: ela autorizava outro texto. Consulte a base; se o índice estiver atrás, a próxima operação vai dizer.',
  }
  return {
    estado,
    gravado: true,
    operacaoId: op.operacaoId,
    entradaId: op.entryId,
    tipo: op.tipo,
    versaoAntes: op.versaoAntes,
    versaoDepois: op.versaoDepois,
    diff: op.diff,
    criadaEm: op.criadaEm.toISOString(),
    mensagem: mensagens[estado],
    ...extras,
  }
}

/**
 * Com a reindexação recusada ou falha, o erro vira ESTADO, nunca sucesso. `atualizadaEm` é a posse da tentativa: quem
 * começa depois a toma, e o resultado da tentativa anterior não se publica por cima (a nova pode ter apagado os vetores).
 */
async function indexar(op: OperacaoDaBase): Promise<OperacaoDaBase> {
  const atual = () => db.operacaoDaBase.findUniqueOrThrow({ where: { id: op.id } })
  const tentativa = new Date(Math.max(Date.now(), op.atualizadaEm.getTime() + 1))
  const tomada = await db.operacaoDaBase.updateMany({ where: { id: op.id, atualizadaEm: op.atualizadaEm, status: { in: DEVE_INDEXACAO } }, data: { atualizadaEm: tentativa } })
  if (tomada.count === 0) return atual()
  let status = 'CONCLUIDA'
  let erroIndexacao: string | null = null
  try {
    await reindexEntry(op.entryId, { projectId: op.projectId, userId: op.autor })
  } catch (erro) {
    console.error(`[knowledge] operação ${op.operacaoId}: a reindexação da entrada ${op.entryId} não terminou:`, erro)
    const pendente = indexacaoPendenteDe(erro)
    status = pendente ? 'INDEXACAO_PENDENTE' : 'INDEXACAO_FALHOU'
    erroIndexacao = pendente?.aviso ?? (erro instanceof Error ? erro.message : String(erro))
  }
  await invalidateProjectCache(op.projectId).catch((e) => console.error('[knowledge] invalidateProjectCache falhou:', e))
  await db.operacaoDaBase.updateMany({ where: { id: op.id, atualizadaEm: tentativa }, data: { status, erroIndexacao } })
  return atual()
}

/** A repetição: mesmo pedido devolve o registrado e, se confirmado, retoma só a indexação; pedido diferente é reuso indevido do id. */
async function repetir(op: OperacaoDaBase, hash: string, confirmado: boolean) {
  if (op.hashDoPedido !== hash) {
    throw new CreativeError(
      'OPERACAO_REUTILIZADA',
      `O operacaoId "${op.operacaoId}" já foi usado para outro pedido. Nada foi gravado: gere um id novo para esta alteração.`,
      409,
    )
  }
  if (!confirmado || !DEVE_INDEXACAO.includes(op.status)) return resultado(op, { repetida: true })
  const entrada = await db.knowledgeBaseEntry.findUnique({ where: { id: op.entryId }, select: { content: true } })
  // A autorização cobre o texto desta operação: outro texto na linha não se indexa por conta dela.
  if (entrada?.content !== (op.depois as unknown as Foto).content) {
    return resultado(await db.operacaoDaBase.update({ where: { id: op.id }, data: { status: 'SUPERADA', erroIndexacao: null } }), { repetida: true })
  }
  return resultado(await indexar(op), { repetida: true })
}

export async function executarOperacaoDaBase(pedido: PedidoDeOperacao) {
  const { projectId, entradaId, operacaoId, versaoEsperada, autor, ator } = pedido
  const reversao = pedido.reverterOperacaoId
  const confirmado = pedido.confirmado === true
  const hash = hashDoPedido({ entradaId, versaoEsperada, alteracoes: pedido.alteracoes ?? null, content: pedido.content ?? null, reversao: reversao ?? null })

  const jaFeita = await lerOperacao(projectId, operacaoId)
  if (jaFeita) return repetir(jaFeita, hash, confirmado)

  if (reversao ? pedido.alteracoes || pedido.content !== undefined : !pedido.alteracoes?.length && pedido.content === undefined) {
    throw new CreativeError('PEDIDO_INVALIDO', 'Envie alteracoes e/ou content, ou então só reverterOperacaoId.', 400)
  }

  const entrada = await db.knowledgeBaseEntry.findUnique({ where: { id: entradaId } })
  // Mesma resposta para "não existe" e "é de outro cliente": a recusa não revela o que existe fora do projeto.
  if (!entrada || entrada.projectId !== projectId) {
    throw new CreativeError('ENTRADA_NAO_ENCONTRADA', 'Entrada não encontrada neste cliente.', 404)
  }
  if (entrada.status !== 'ACTIVE') {
    throw new CreativeError('ENTRADA_INATIVA', 'Esta entrada não está ativa e não alimenta os textos. Reative pela interface do Studio antes de alterar.', 400)
  }
  if (entrada.metadata !== null && (typeof entrada.metadata !== 'object' || Array.isArray(entrada.metadata))) {
    throw new CreativeError('DADOS_ILEGIVEIS', 'O metadata desta entrada não é um objeto: alterar aqui destruiria o que está gravado.', 422)
  }
  const pendente = await db.operacaoDaBase.findFirst({ where: { projectId, entryId: entradaId, status: { in: DEVE_INDEXACAO } }, select: { operacaoId: true } })
  if (pendente) {
    throw new CreativeError(
      'INDEXACAO_PENDENTE_NA_ENTRADA',
      `A operação "${pendente.operacaoId}" ainda não terminou de indexar esta entrada. Nada foi gravado: repita aquela operação primeiro.`,
      409,
      { operacaoPendente: pendente.operacaoId },
    )
  }

  const versaoAtual = versaoDaEntrada(entrada)
  const recusarVersao = (versaoLida: string): never => {
    throw new CreativeError(
      'VERSAO_DIVERGENTE',
      'A entrada mudou desde a leitura. Nada foi gravado: consulte de novo, mostre o estado novo à pessoa e refaça o pedido.',
      409,
      { versaoEsperada, versaoAtual: versaoLida },
    )
  }
  if (versaoAtual !== versaoEsperada) recusarVersao(versaoAtual)

  const antes = fotoDe(entrada)
  const alvo = reversao ? await lerOperacao(projectId, reversao) : null
  if (reversao) {
    if (!alvo || alvo.entryId !== entradaId) throw new CreativeError('OPERACAO_NAO_ENCONTRADA', 'Operação não encontrada nesta entrada.', 404)
    // A foto é da versão anterior à operação: aplicar sobre outra versão apagaria a mudança que veio depois.
    if (alvo.versaoDepois !== versaoAtual) {
      throw new CreativeError('REVERSAO_SOBRE_OUTRA_VERSAO', 'A entrada mudou depois dessa operação. Nada foi gravado: reverter agora apagaria a mudança posterior.', 409, {
        versaoAtual,
        versaoDepoisDaOperacao: alvo.versaoDepois,
      })
    }
  } else {
    const problemas = problemasDasAlteracoes(antes.dados, pedido.alteracoes ?? [])
    if (problemas.length > 0) {
      throw new CreativeError('DADOS_INVALIDOS', `Nada foi gravado: ${problemas.map((p) => `${p.campo}: ${p.motivo}`).join('; ')}.`, 422, { problemas, camposPermitidos: CAMPOS_PERMITIDOS })
    }
  }

  const contentNovo = reversao ? (alvo?.antes as unknown as Foto).content : pedido.content?.trim() || undefined
  if (pedido.content !== undefined && !contentNovo) {
    throw new CreativeError('TEXTO_VAZIO', 'O texto não pode ficar vazio. Para tirar a entrada de circulação, use arquivar-entrada-base.', 400)
  }
  const depois: Foto = {
    content: contentNovo ?? antes.content,
    dados: reversao ? (alvo?.antes as unknown as Foto).dados : aplicarAlteracoes(antes.dados, pedido.alteracoes ?? []),
  }
  const mudouTexto = depois.content !== antes.content
  const diffDosDados = diffDeDados(antes.dados, depois.dados)
  const diff = [...diffDosDados, ...(mudouTexto ? [{ campo: 'content', antes: antes.content, depois: depois.content }] : [])]
  if (diff.length === 0) {
    throw new CreativeError('NADA_A_MUDAR', 'O pedido não muda nada: a entrada já tem esses valores. Nada foi gravado.', 400, { versaoAtual })
  }

  const indice = await indiceDoTexto(entradaId, depois.content)
  if (indice.trechos === 0) throw new CreativeError('TEXTO_CURTO_DEMAIS', 'O texto é curto demais para ser indexado. Nada foi gravado.', 400)

  const linhas = (await linhasDaBase(projectId)).map((l) => (l.id === entradaId ? { ...l, content: depois.content, metadata: depois.dados } : l))
  const divergencias = divergenciasDaBase(linhas)
  const tocados = new Set(diffDosDados.map((d) => d.campo))
  const aceitas = new Set(pedido.aceitarDivergencias ?? [])
  // Numa reversão nada se decide de novo: ela devolve um estado que já existiu, e as divergências só são relatadas.
  const bloqueiam = reversao ? [] : divergencias.filter((d) => ((d.entradaDosDados === entradaId && tocados.has(d.campo)) || (mudouTexto && d.origem.entradaId === entradaId)) && !aceitas.has(d.campo))
  const excecoesRemovidas = reversao ? [] : linhasDatadas(antes.content).filter((l) => !depois.content.includes(l))
  const excecoesBloqueiam = excecoesRemovidas.length > 0 && !aceitas.has(ACEITE_DE_EXCECOES)
  const indexacao = { necessaria: !indice.confere, motivo: indice.motivo, trechos: indice.trechos, tokens: indice.tokens, tetoDeTokens: TETO_DE_TOKENS_DA_ENTRADA }
  const acimaDoTeto = !reversao && mudouTexto && indice.tokens > TETO_DE_TOKENS_DA_ENTRADA

  const analise = { versaoAtual, diff, mudouTexto, divergencias, camposSemConferencia: camposSemConferencia(depois.dados, [...tocados]), excecoesPreservadas: linhasDatadas(depois.content), excecoesRemovidas, indexacao, origemDosDados: { atualizadaEm: entrada.updatedAt.toISOString(), atualizadaPor: entrada.updatedBy ?? entrada.createdBy } }

  if (!confirmado) {
    return {
      estado: 'proposta' as const,
      gravado: false,
      ...analise,
      bloqueiam: [...bloqueiam.map((d) => d.campo), ...(excecoesBloqueiam ? [ACEITE_DE_EXCECOES] : [])],
      acimaDoTeto,
      mensagem: 'Proposta montada, NADA foi gravado. Mostre o diff e as divergências à pessoa e só repita com confirmado: true depois do OK dela.',
    }
  }

  if (bloqueiam.length > 0 || excecoesBloqueiam) {
    throw new CreativeError(
      'DIVERGENCIA_NAO_RESOLVIDA',
      'Nada foi gravado: há contradição com os textos ou remoção de exceção datada. Mostre à pessoa; ajuste o texto ou aceite nominalmente em aceitarDivergencias.',
      409,
      { divergencias: bloqueiam, excecoesRemovidas },
    )
  }
  if (acimaDoTeto) {
    throw new CreativeError('TEXTO_ACIMA_DO_TETO', `Nada foi gravado: o texto novo tem ~${indice.tokens} tokens, acima do teto de ${TETO_DE_TOKENS_DA_ENTRADA} por entrada. Resuma ou separe em duas entradas.`, 422, { indexacao })
  }
  if (indexacao.necessaria && pedido.autorizarIndexacao !== true) {
    throw new CreativeError('INDEXACAO_NAO_AUTORIZADA', 'Nada foi gravado: esta operação exige reindexar (custo de embeddings). Mostre o custo à pessoa e repita com autorizarIndexacao: true.', 409, { indexacao })
  }

  let versaoDepois = versaoAtual
  let registrada: OperacaoDaBase | undefined
  try {
    await editarEntradaCoordenada(
      entradaId,
      (lida: Lida) => {
        const versaoLida = versaoDaEntrada(lida)
        if (versaoLida !== versaoEsperada) recusarVersao(versaoLida)
        const metadata = depois.dados as Prisma.JsonObject
        versaoDepois = versaoDaEntrada({ ...lida, content: depois.content, metadata })
        return { metadata, updatedBy: autor, ...(mudouTexto ? { content: depois.content } : {}) }
      },
      {
        noMesmoCommit: async (tx) => {
          registrada = await tx.operacaoDaBase.create({
            data: {
              projectId,
              entryId: entradaId,
              operacaoId,
              hashDoPedido: hash,
              tipo: reversao ? 'reversao' : 'dados',
              status: indexacao.necessaria ? 'INDEXACAO_PENDENTE' : 'CONCLUIDA',
              autor,
              ator: ator as Prisma.InputJsonValue,
              pedido: {
                alteracoes: pedido.alteracoes,
                textoTrocado: mudouTexto,
                reverterOperacaoId: reversao,
                aceitarDivergencias: pedido.aceitarDivergencias,
                autorizarIndexacao: pedido.autorizarIndexacao,
              } as unknown as Prisma.InputJsonValue,
              versaoAntes: versaoAtual,
              versaoDepois,
              antes: antes as unknown as Prisma.InputJsonValue,
              depois: depois as unknown as Prisma.InputJsonValue,
              diff: diff as unknown as Prisma.InputJsonValue,
            },
          })
        },
      },
    )
  } catch (erro) {
    // Duas chamadas iguais ao mesmo tempo: a segunda perde o compare-and-set ou o unique e tem de ver a primeira.
    const outra = await lerOperacao(projectId, operacaoId)
    if (outra) return repetir(outra, hash, confirmado)
    if (ehIndexacaoEmAndamento(erro)) {
      throw new CreativeError('INDEXACAO_EM_ANDAMENTO', 'Esta entrada está sendo indexada para a busca agora. Nada foi gravado: tente de novo em alguns minutos.', 409)
    }
    throw erro
  }

  const op = registrada as unknown as OperacaoDaBase
  const final = indexacao.necessaria ? await indexar(op) : op
  return resultado(final, { divergencias, camposSemConferencia: analise.camposSemConferencia, excecoesPreservadas: analise.excecoesPreservadas, indexacao })
}

/** A consulta depois de um timeout, e a trilha da entrada. Só lê: é o que evita repetir a escrita às cegas. */
export async function consultarOperacaoDaBase(args: { projectId: number; operacaoId?: string; entradaId?: string }) {
  const { projectId, operacaoId, entradaId } = args
  if (operacaoId) {
    const op = await lerOperacao(projectId, operacaoId)
    if (!op) {
      return {
        estado: 'nao_encontrada' as const,
        gravado: false,
        operacaoId,
        mensagem: 'Nenhuma operação com este id neste cliente: nada foi gravado até agora. É seguro repetir com o MESMO operacaoId.',
      }
    }
    const entrada = await db.knowledgeBaseEntry.findUnique({ where: { id: op.entryId } })
    const indice = entrada ? await indiceDoTexto(op.entryId, entrada.content) : null
    const versaoAtual = entrada ? versaoDaEntrada(entrada) : null
    return resultado(op, {
      autor: op.autor,
      ator: op.ator,
      antes: op.antes,
      depois: op.depois,
      versaoAtual,
      indiceConfere: indice?.confere ?? null,
      // O estado é da operação, quando terminou; aqui se diz como a entrada está AGORA.
      ...(op.status === 'CONCLUIDA' && (versaoAtual !== op.versaoDepois || !indice?.confere)
        ? { mensagem: `A operação foi concluída, mas a entrada ${entrada ? 'mudou depois ou o índice dela não confere agora' : 'não existe mais'}: veja versaoAtual e indiceConfere.` }
        : {}),
    })
  }
  if (!entradaId) throw new CreativeError('PEDIDO_INVALIDO', 'Envie operacaoId ou entradaId.', 400)
  const ops = await db.operacaoDaBase.findMany({ where: { projectId, entryId: entradaId }, orderBy: { criadaEm: 'desc' }, take: 20 })
  return { count: ops.length, operacoes: ops.map((op) => resultado(op, { autor: op.autor })) }
}
