import { randomUUID } from 'node:crypto'
/**
 * Knowledge base indexing service
 * Handles creating, updating, and deleting indexed entries
 */

import { db } from '@/lib/db'
import { chunkText, parseFileContent } from './chunking'
import { generateEmbeddings } from './embeddings'
import { upsertVectors, deleteVectorsByEntry, type TenantKey } from './vector-client'
import { EscritaAbortada, lancarSeAbortado, motivoDoAborto } from './aborto'
import { CICLO_DE_INDEXACAO, PRAZO_DO_PASSO_MS, indexacaoPendenteDe, metadataDaPessoa, type IndexacaoPendente } from './marca-de-indexado'
import { adquirirArrendamento, editarEntradaCoordenada, type ArrendamentoDaEntrada } from './arrendamento'
import type { KnowledgeCategory, Prisma } from '@prisma/client'

export interface IndexEntryInput {
  title: string
  content: string
  tags?: string[]
  status?: 'ACTIVE' | 'DRAFT' | 'ARCHIVED'
  metadata?: Prisma.JsonValue
  category: KnowledgeCategory
  createdBy: string
  updatedBy?: string
  /** Prazo de validade (F0.1). Ausente/null = vale para sempre. */
  expiresAt?: Date | null
  tenant: TenantKey
}

export interface IndexFileInput {
  title: string
  filename: string
  fileContent: string
  tags?: string[]
  status?: 'ACTIVE' | 'DRAFT' | 'ARCHIVED'
  metadata?: Prisma.JsonValue
  category: KnowledgeCategory
  createdBy: string
  updatedBy?: string
  expiresAt?: Date | null
  tenant: TenantKey
}

/**
 * Index a new knowledge base entry from text content
 * @param input Entry data
 * @returns Created entry with chunks
 */
export async function indexEntry(input: IndexEntryInput) {
  const {
    title,
    content,
    tags = [],
    status = 'ACTIVE',
    metadata,
    category,
    createdBy,
    updatedBy,
    expiresAt,
    tenant,
  } = input

  // Create entry in database
  const entry = await db.knowledgeBaseEntry.create({
    data: {
      projectId: tenant.projectId,
      category,
      title,
      content,
      tags,
      status,
      expiresAt: expiresAt ?? null,
      // Quem cria por aqui é a PESSOA (confirmação do chat, POST da base, admin): o metadata dela nunca carrega chave
      // do sistema — nem identidade de fato da migração, nem marca, token ou prazo de indexação (PR13-47).
      metadata: metadata != null ? (metadataDaPessoa(metadata) as Prisma.InputJsonValue) : undefined,
      createdBy,
      updatedBy,
      userId: tenant.userId,
      workspaceId: tenant.workspaceId,
    },
  })

  // Chunk the content
  const chunks = chunkText(content)

  if (chunks.length === 0) {
    throw new Error('Content is too short to create chunks')
  }

  // Generate embeddings for all chunks
  const embeddings = await generateEmbeddings(chunks.map(c => c.content))

  // Create chunks in database
  const createdChunks = await Promise.all(
    chunks.map((chunk) =>
      db.knowledgeChunk.create({
        data: {
          entryId: entry.id,
          ordinal: chunk.ordinal,
          content: chunk.content,
          tokens: chunk.tokens,
          vectorId: `${entry.id}:${chunk.ordinal}`,
        },
      })
    )
  )

  // Upsert vectors to Upstash
  await upsertVectors(
    createdChunks.map((chunk, index) => ({
      id: chunk.vectorId,
      vector: embeddings[index],
      metadata: {
        entryId: chunk.entryId,
        ordinal: chunk.ordinal,
        projectId: tenant.projectId,
        category,
        status: entry.status,
        userId: tenant.userId,
        workspaceId: tenant.workspaceId,
      },
    }))
  )

  return {
    entry,
    chunks: createdChunks,
  }
}

/**
 * Index a knowledge base entry from uploaded file
 * @param input File upload data
 * @returns Created entry with chunks
 */
export async function indexFile(input: IndexFileInput) {
  const { filename, fileContent, ...rest } = input

  // Parse file content based on extension
  const parsedContent = parseFileContent(filename, fileContent)

  return indexEntry({
    ...rest,
    content: parsedContent,
  })
}

/**
 * Um passo destrutivo ou de publicação da reindexação (PR13-41): confere o
 * sinal, RENOVA o arrendamento com o próprio token (lança `ArrendamentoPerdido`
 * se outra execução tomou a entrada), confere o sinal de novo e roda a escrita
 * com um prazo (`PRAZO_DO_PASSO_MS`) muito menor que o arrendamento renovado.
 * Estourado o prazo — ou disparado o sinal com a chamada em voo —, `emVoo` fica
 * `true`: o arrendamento NÃO é liberado e vence sozinho, para uma chamada
 * cancelada que ainda chegue ao destino não cair sobre o ciclo de outra execução.
 */
async function passoArrendado<T>(
  etapa: string,
  arrendamento: ArrendamentoDaEntrada,
  signal: AbortSignal | undefined,
  controle: { emVoo: boolean },
  escrita: (sinal: AbortSignal) => Promise<T>,
): Promise<T> {
  lancarSeAbortado(signal, etapa)
  await arrendamento.renovar(etapa)
  lancarSeAbortado(signal, etapa)
  const prazo = new AbortController()
  const timer = setTimeout(() => prazo.abort(new Error(`o passo passou do prazo de ${PRAZO_DO_PASSO_MS / 1000}s`)), PRAZO_DO_PASSO_MS)
  const sinal = signal ? AbortSignal.any([signal, prazo.signal]) : prazo.signal
  const noPrazo = new Promise<never>((_, rejeitar) => {
    prazo.signal.addEventListener('abort', () => rejeitar(new EscritaAbortada(etapa, motivoDoAborto(prazo.signal))), { once: true })
  })
  noPrazo.catch(() => undefined)
  try {
    const trabalho = escrita(sinal)
    trabalho.catch(() => undefined)
    const resultado = await Promise.race([trabalho, noPrazo])
    if (prazo.signal.aborted) throw new EscritaAbortada(etapa, motivoDoAborto(prazo.signal))
    return resultado
  } finally {
    clearTimeout(timer)
    if (sinal.aborted) controle.emVoo = true
  }
}

/**
 * Reindex an existing entry (update chunks and vectors)
 * @param entryId Entry ID to reindex
 * @param tenant Tenant keys
 *
 * `opcoes.signal`: aborto cooperativo — conferido antes de cada escrita
 * (apagar chunks/vetores, gravar chunks, subir vetores). Quem segura uma
 * exclusão externa (a migração da voz) dispara o sinal ao perdê-la, e a
 * reindexação para sem tocar em nada que outra aplicação possa ter retomado.
 *
 * `opcoes.ciclo`: o token do ciclo, quando quem chama vai publicar a marca de
 * indexado DEPOIS do retorno (`criarEntradaBase` → `marcarFatoIndexado`,
 * PR13-40). Sem ele, um token novo. O token EFETIVO sai no retorno.
 *
 * A entrada é ARRENDADA do começo ao fim (PR13-41): quem encontra outro ciclo
 * vigente lança `IndexacaoEmAndamento` sem tocar em nada (a API responde 409);
 * quem perde o arrendamento no meio lança `ArrendamentoPerdido` antes da
 * próxima escrita, sem compensar; e se o conteúdo, a categoria ou o status
 * mudaram por baixo (escrita que não passou por `editarEntradaCoordenada`),
 * `IndexacaoSuperada` antes de publicar a versão antiga (PR13-42).
 */
export async function reindexEntry(entryId: string, tenant: TenantKey, opcoes: { signal?: AbortSignal; ciclo?: string } = {}) {
  const { signal } = opcoes
  const ciclo = opcoes.ciclo ?? randomUUID()
  // Get entry
  const entry = await db.knowledgeBaseEntry.findUnique({
    where: { id: entryId },
    include: { chunks: true },
  })

  if (!entry) {
    throw new Error('Entry not found')
  }

  // Verify tenant ownership by project (project is the isolation boundary)
  if (entry.projectId !== tenant.projectId) {
    throw new Error('Unauthorized access to entry')
  }

  // A marca durável de indexado (`metadata.indexadoEm`, a que a migração da voz lê) atesta chunks e vetores que
  // vão ser APAGADOS já já (PR13-36): adquirir o arrendamento a INVALIDA na mesma escrita — preservando
  // `chaveDoFato` e o resto do metadata — e ela só volta depois de subir os vetores. Entrada sem a marca (a criação
  // normal, ou a retomada de uma linha incompleta) não ganha marca aqui: quem a grava é quem sabe que a indexação
  // inteira fechou (`marcarFatoIndexado`, depois deste retorno, contra o token do ciclo — PR13-39/40).
  // O token sozinho protegia só a publicação da marca; a execução que perdia o ciclo ainda apagava os chunks e os
  // vetores da vencedora (PR13-41). Por isso o ciclo inteiro é ARRENDADO: ninguém adquire enquanto ele vale, e
  // cada passo abaixo renova com o próprio token antes de escrever.
  lancarSeAbortado(signal, 'invalidar a marca de indexado')
  const arrendamento = await adquirirArrendamento(entryId, ciclo)
  const controle = { emVoo: false }

  try {
    // A exclusão dos chunks é condicionada ao token no PRÓPRIO delete: mesmo que ela chegue ao banco atrasada, não
    // apaga os chunks de um ciclo que outra execução já tenha tomado.
    await passoArrendado('apagar chunks antigos', arrendamento, signal, controle, () =>
      db.knowledgeChunk.deleteMany({
        where: { entryId, entry: { metadata: { path: [CICLO_DE_INDEXACAO], equals: ciclo } } },
      }),
    )

    // O sinal pode ter disparado enquanto o `deleteMany` esperava (PR13-22) — o passo confere de novo. E a consulta
    // dos ids pode esperar o bastante para o arrendamento vencer: a renovação roda de novo entre ela e o `delete`.
    await passoArrendado('apagar vetores antigos', arrendamento, signal, controle, (sinal) =>
      deleteVectorsByEntry(entryId, tenant, { signal: sinal, antesDeApagar: () => arrendamento.renovar('apagar vetores') }),
    )

    // Re-chunk content — o conteúdo lido NA AQUISIÇÃO (PR13-42), não o de `entry`: uma edição entre a primeira leitura
    // e a aquisição já o teria superado. E cada passo seguinte confere que a linha ainda indexa esta versão.
    const { indexada } = arrendamento
    const chunks = chunkText(indexada.content)

    if (chunks.length === 0) {
      throw new Error('Content is too short to create chunks')
    }

    // Generate new embeddings (não escreve nada: o arrendamento pode vencer aqui, e o passo seguinte descobre)
    const embeddings = await generateEmbeddings(chunks.map(c => c.content))

    // Os embeddings demoram: é AQUI que a posse externa costuma ter se perdido (PR13-20).
    const createdChunks = await passoArrendado('gravar chunks', arrendamento, signal, controle, () =>
      Promise.all(
        chunks.map((chunk) =>
          db.knowledgeChunk.create({
            data: {
              entryId: entry.id,
              ordinal: chunk.ordinal,
              content: chunk.content,
              tokens: chunk.tokens,
              vectorId: `${entry.id}:${chunk.ordinal}`,
            },
          })
        )
      ),
    )

    await passoArrendado('subir vetores', arrendamento, signal, controle, (sinal) =>
      upsertVectors(
        createdChunks.map((chunk, index) => ({
          id: chunk.vectorId,
          vector: embeddings[index],
          metadata: {
            entryId: chunk.entryId,
            ordinal: chunk.ordinal,
            projectId: tenant.projectId,
            category: indexada.category,
            status: indexada.status as 'ACTIVE' | 'DRAFT' | 'ARCHIVED',
            userId: tenant.userId,
            workspaceId: tenant.workspaceId,
          },
        })),
        { signal: sinal },
      ),
    )

    // Chunks e vetores novos no lugar: a marca volta, sobre o metadata COMO ESTÁ AGORA, por compare-and-set no
    // token (PR13-39). Quem perdeu a posse externa não a repõe (PR13-23), e quem perdeu o arrendamento também não.
    if (arrendamento.tinhaMarcaDeIndexado) {
      await passoArrendado('repor a marca de indexado', arrendamento, signal, controle, () => arrendamento.publicarMarca(new Date()))
    } else {
      // Sem marca a repor (entrada nova, ou retomada de uma linha incompleta), a versão é conferida do MESMO jeito
      // depois dos vetores (PR13-44): a escrita que troca o conteúdo ENQUANTO eles sobem só é vista aqui. Sem esta
      // conferência a execução devolvia sucesso, `liberar()` não olha a versão e `marcarFatoIndexado` — que confere
      // só o token — publicava a marca sobre um cadastro com texto novo e chunks/vetores do antigo.
      lancarSeAbortado(signal, 'confirmar a versão indexada')
      await arrendamento.renovar('confirmar a versão indexada')
    }

    return {
      entry,
      chunks: createdChunks,
      ciclo,
    }
  } finally {
    // Libera só se o token ainda é este (senão é no-op) e nenhuma chamada ficou em voo. O token fica como o último
    // ciclo: é contra ele que `marcarFatoIndexado` publica a marca depois deste retorno.
    if (!controle.emVoo) {
      await arrendamento.liberar().catch((e) => console.error(`[knowledge] não consegui liberar o arrendamento da entrada ${entryId}:`, e))
    }
  }
}

/**
 * Update entry metadata (title, tags, status) and reindex if content changed
 * @param entryId Entry ID
 * @param updates Fields to update
 * @param tenant Tenant keys
 *
 * Lança `IndexacaoEmAndamento` só ANTES de salvar (PR13-42). Depois de salvar, um conflito de arrendamento na
 * reindexação NÃO é lançado: volta em `indexacaoPendente` (PR13-45), porque a edição já está gravada.
 */
export async function updateEntry(
  entryId: string,
  updates: {
    title?: string
    content?: string
    tags?: string[]
    status?: 'ACTIVE' | 'DRAFT' | 'ARCHIVED'
    category?: KnowledgeCategory
    metadata?: Prisma.JsonValue | null
    updatedBy?: string
  },
  tenant: TenantKey
) {
  // Get existing entry
  const existing = await db.knowledgeBaseEntry.findUnique({
    where: { id: entryId },
  })

  if (!existing) {
    throw new Error('Entry not found')
  }

  // Verify tenant ownership
  if (existing.projectId !== tenant.projectId) {
    throw new Error('Unauthorized access to entry')
  }

  // Coordenada com o arrendamento (PR13-42): campo indexado com indexação em curso → `IndexacaoEmAndamento`, nada salvo.
  // É a ÚNICA recusa anterior à escrita: todo `IndexacaoEmAndamento` que sai lançado daqui significa "nada foi salvo".
  const { antes } = await editarEntradaCoordenada(entryId, updates)
  const entry = await db.knowledgeBaseEntry.findUnique({ where: { id: entryId } })

  // If content changed, reindex
  let indexacaoPendente: IndexacaoPendente | null = null
  if (updates.content && updates.content !== antes.content) {
    try {
      await reindexEntry(entryId, tenant)
    } catch (erro) {
      // Depois da edição GRAVADA (PR13-45): outra execução adquiriu (ou tomou) o arrendamento — e leu o texto novo —,
      // ou a linha mudou por fora no meio. A edição vale; o que fica pendente é a indexação, e quem chama responde
      // isso em vez de "nada foi salvo" (e ainda invalida o cache). Erro comum segue lançado.
      indexacaoPendente = indexacaoPendenteDe(erro)
      if (!indexacaoPendente) throw erro
      console.error(`[knowledge] a edição da entrada ${entryId} foi salva, mas a reindexação ficou pendente:`, erro)
    }
  }

  return { entry, indexacaoPendente }
}

/**
 * Delete entry and all associated chunks/vectors
 * @param entryId Entry ID to delete
 * @param tenant Tenant keys
 */
export async function deleteEntry(entryId: string, tenant: TenantKey) {
  // Get entry to verify ownership
  const entry = await db.knowledgeBaseEntry.findUnique({
    where: { id: entryId },
  })

  if (!entry) {
    throw new Error('Entry not found')
  }

  // Verify tenant ownership
  if (entry.projectId !== tenant.projectId) {
    throw new Error('Unauthorized access to entry')
  }

  // Delete vectors
  await deleteVectorsByEntry(entryId, tenant)

  // Delete entry (chunks cascade delete via Prisma schema)
  await db.knowledgeBaseEntry.delete({
    where: { id: entryId },
  })

  return { success: true }
}
