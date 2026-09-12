import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'
import { barreira, base, dbFalso } from './fixtures/base-falsa'

vi.mock('@/lib/db', async () => ({ db: (await import('./fixtures/base-falsa')).dbFalso }))
vi.mock('@upstash/vector', async () => ({ Index: (await import('./fixtures/base-falsa')).IndiceFalso }))
vi.mock('../embeddings', () => ({ generateEmbeddings: vi.fn() }))
vi.mock('../cache', () => ({ invalidateProjectCache: vi.fn(async () => 1) }))
vi.mock('@clerk/nextjs/server', () => ({ auth: vi.fn(async () => ({ userId: 'clerk_u', orgId: 'org_1' })) }))
vi.mock('@/lib/auth-utils', () => ({ getUserFromClerkId: vi.fn(async () => ({ id: 'u', email: null })) }))
vi.mock('@prisma/client', () => ({ KnowledgeCategory: { ESTABELECIMENTO_INFO: 'ESTABELECIMENTO_INFO', CAMPANHAS: 'CAMPANHAS' } }))

import { generateEmbeddings } from '../embeddings'
import { chunkText } from '../chunking'
import { reindexEntry } from '../indexer'
import { adquirirArrendamento, editarEntradaCoordenada } from '../arrendamento'
import { CICLO_DE_INDEXACAO, EXPIRACAO_DO_CICLO, metadataDaEdicao, perdeuOArrendamento } from '../marca-de-indexado'
import { marcarFatoIndexado } from '../../../../scripts/migrar-voz-da-marca'
import { PUT } from '@/app/api/knowledge/[id]/route'

const tenant = { projectId: 6, userId: 'u' }
const embeddings = vi.mocked(generateEmbeddings)
/** O vetor denuncia o texto que o gerou: é assim que o teste confere que a busca tem o conteúdo certo. */
const vetorDe = (texto: string) => [texto.length, 1]
const ANTIGO = 'Rodízio completo de terça a domingo, das 11h às 23h, com buffet de saladas e cortes nobres na brasa.'
const NOVO = 'Rodízio completo de terça a sábado, das 11h às 22h, com buffet de saladas, sobremesa e cortes nobres na brasa.'
const MARCA = { chaveDoFato: 'chave-1', indexadoEm: '2026-09-01T10:00:00.000Z' }

function editarPelaRota(id: string, corpo: Record<string, unknown>) {
  const req = new NextRequest(`http://localhost/api/knowledge/${id}`, { method: 'PUT', body: JSON.stringify(corpo), headers: { 'content-type': 'application/json' } })
  return PUT(req, { params: Promise.resolve({ id }) })
}

/** Cadastro, chunks e vetores dizem o MESMO texto. */
function indiceDiz(id: string, texto: string) {
  const esperados = chunkText(texto)
  expect(base.linha(id).content).toBe(texto)
  expect(base.chunks.filter((c) => c.entryId === id).sort((a, b) => a.ordinal - b.ordinal).map((c) => c.content)).toEqual(esperados.map((c) => c.content))
  expect(esperados.map((c) => base.vetores.get(`${id}:${c.ordinal}`)?.vector)).toEqual(esperados.map((c) => vetorDe(c.content)))
}

/** Suspende a PRÓXIMA chamada de embeddings (a de A) numa barreira. */
function suspenderEmbeddings() {
  const b = barreira()
  embeddings.mockImplementationOnce(async (textos: string[]) => {
    await b.parar()
    return textos.map(vetorDe)
  })
  return b
}

beforeEach(() => {
  base.reset()
  vi.clearAllMocks()
  process.env.UPSTASH_VECTOR_REST_URL = 'https://x.upstash.io'
  process.env.UPSTASH_VECTOR_REST_TOKEN = 't'
  embeddings.mockImplementation(async (textos: string[]) => textos.map(vetorDe))
})

describe('PR13-42 — a edição de campo indexado durante o arrendamento é recusada ANTES de salvar', () => {
  it('pela rota real: A reindexa e espera embeddings; a edição do conteúdo responde 409 sem tocar na linha; A conclui; a mesma edição depois passa e cadastro, chunks e vetores terminam com o texto novo', async () => {
    base.semear({ id: 'e1', content: ANTIGO, metadata: MARCA })
    const b = suspenderEmbeddings()
    const execucaoA = reindexEntry('e1', tenant, { ciclo: 'ciclo-A' })
    execucaoA.catch(() => undefined)
    await b.chegou

    const antes = structuredClone(base.linha('e1'))
    const escritas = () => dbFalso.knowledgeBaseEntry.updateMany.mock.calls.length + dbFalso.knowledgeBaseEntry.update.mock.calls.length
    const escritasAntes = escritas()
    const recusada = await editarPelaRota('e1', { content: NOVO })
    expect(recusada.status).toBe(409)
    await expect(recusada.json()).resolves.toMatchObject({ code: 'INDEXACAO_EM_ANDAMENTO', error: expect.stringMatching(/Nada foi salvo/), expiraEm: expect.any(String) })
    expect(base.linha('e1')).toEqual(antes)
    expect(escritas()).toBe(escritasAntes)

    // A conclui com o texto que o cadastro TEM (a edição não entrou): cadastro, chunks, vetores e marca concordam
    b.liberar()
    await expect(execucaoA).resolves.toMatchObject({ ciclo: 'ciclo-A' })
    indiceDiz('e1', ANTIGO)
    expect(typeof base.meta('e1').indexadoEm).toBe('string')

    // sem arrendamento, a mesma edição passa e a reindexação da rota indexa o texto novo
    const aceita = await editarPelaRota('e1', { content: NOVO })
    expect(aceita.status).toBe(200)
    indiceDiz('e1', NOVO)
    expect(base.meta('e1').chaveDoFato).toBe('chave-1')
    expect(base.meta('e1').indexadoEm).toBeUndefined() // a marca atestava os chunks do texto anterior
    expect(base.meta('e1')[EXPIRACAO_DO_CICLO]).toBeUndefined()
  })

  it('pela rota real: edição só de etiquetas e metadata durante o arrendamento passa, sem apagar nem forjar o arrendamento — e A conclui', async () => {
    base.semear({ id: 'e1', content: ANTIGO, metadata: MARCA })
    const b = suspenderEmbeddings()
    const execucaoA = reindexEntry('e1', tenant, { ciclo: 'ciclo-A' })
    execucaoA.catch(() => undefined)
    await b.chegou
    const prazo = base.meta('e1')[EXPIRACAO_DO_CICLO]

    const r = await editarPelaRota('e1', { tags: ['almoco'], metadata: { nota: 'revisado', [CICLO_DE_INDEXACAO]: 'forjado', [EXPIRACAO_DO_CICLO]: null } })
    expect(r.status).toBe(200)
    expect(base.linha('e1').tags).toEqual(['almoco'])
    expect(base.meta('e1')).toMatchObject({ nota: 'revisado', [CICLO_DE_INDEXACAO]: 'ciclo-A', [EXPIRACAO_DO_CICLO]: prazo })

    b.liberar()
    await expect(execucaoA).resolves.toMatchObject({ ciclo: 'ciclo-A' })
    indiceDiz('e1', ANTIGO)
  })

  it('arrendamento adquirido ENTRE a leitura e a escrita da edição: o compare-and-set falha, a edição relê e é recusada', async () => {
    base.semear({ id: 'e1', content: ANTIGO, metadata: MARCA })
    const lerDeVerdade = dbFalso.knowledgeBaseEntry.findUnique.getMockImplementation()!
    dbFalso.knowledgeBaseEntry.findUnique.mockImplementationOnce(async (args: Parameters<typeof lerDeVerdade>[0]) => {
      const lida = await lerDeVerdade(args)
      await adquirirArrendamento('e1', 'ciclo-A')
      return lida
    })
    await expect(editarEntradaCoordenada('e1', { content: NOVO })).rejects.toMatchObject({ code: 'INDEXACAO_EM_ANDAMENTO' })
    expect(base.linha('e1').content).toBe(ANTIGO)
    expect(base.meta('e1')[CICLO_DE_INDEXACAO]).toBe('ciclo-A')
  })
})

describe('PR13-42 — nenhuma indexação publica chunks, vetores ou marca de uma versão superada', () => {
  it('escrita que NÃO passa pela coordenação troca o conteúdo durante os embeddings: A para antes de gravar chunks, não publica nada, solta a entrada — e a reindexação seguinte indexa o texto novo', async () => {
    base.semear({ id: 'e1', content: ANTIGO, metadata: MARCA })
    const b = suspenderEmbeddings()
    const execucaoA = reindexEntry('e1', tenant, { ciclo: 'ciclo-A' })
    execucaoA.catch(() => undefined)
    await b.chegou
    await dbFalso.knowledgeBaseEntry.update({ where: { id: 'e1' }, data: { content: NOVO } }) // SQL direto, fora do serviço

    b.liberar()
    const erro = await execucaoA.catch((e: unknown) => e)
    expect(erro).toMatchObject({ code: 'INDEXACAO_SUPERADA', message: expect.stringMatching(/antes de "gravar chunks"/) })
    expect(perdeuOArrendamento(erro)).toBe(true)
    expect(dbFalso.knowledgeChunk.create).not.toHaveBeenCalled()
    expect(base.chamadas.upsert).toBe(0)
    expect(base.meta('e1').indexadoEm).toBeUndefined()
    expect(base.meta('e1')[EXPIRACAO_DO_CICLO]).toBeUndefined() // o ciclo superado ainda solta a entrada

    await reindexEntry('e1', tenant)
    indiceDiz('e1', NOVO)
  })

  it('conteúdo trocado por fora enquanto os vetores sobem: a marca de indexado NÃO volta', async () => {
    base.semear({ id: 'e1', content: ANTIGO, metadata: MARCA })
    base.aoSubir = async () => {
      base.aoSubir = undefined
      await dbFalso.knowledgeBaseEntry.update({ where: { id: 'e1' }, data: { content: NOVO } })
    }
    await expect(reindexEntry('e1', tenant, { ciclo: 'ciclo-A' })).rejects.toMatchObject({ code: 'INDEXACAO_SUPERADA', message: expect.stringMatching(/antes de "repor a marca de indexado"/) })
    expect(base.meta('e1').indexadoEm).toBeUndefined()
    expect(base.meta('e1')[EXPIRACAO_DO_CICLO]).toBeUndefined()
  })

  it('publicarMarca e renovar recusam a versão superada (status arquivado por fora); liberar ainda solta', async () => {
    base.semear({ id: 'e1', content: ANTIGO, metadata: MARCA })
    const arrendamento = await adquirirArrendamento('e1', 'ciclo-A')
    expect(arrendamento.indexada).toEqual({ content: ANTIGO, category: 'ESTABELECIMENTO_INFO', status: 'ACTIVE' })
    await dbFalso.knowledgeBaseEntry.update({ where: { id: 'e1' }, data: { status: 'ARCHIVED' } })
    await expect(arrendamento.renovar('subir vetores')).rejects.toMatchObject({ code: 'INDEXACAO_SUPERADA' })
    await expect(arrendamento.publicarMarca(new Date())).rejects.toMatchObject({ code: 'INDEXACAO_SUPERADA' })
    expect(base.meta('e1').indexadoEm).toBeUndefined()
    await expect(arrendamento.liberar()).resolves.toBe(true)
    expect(base.meta('e1')[EXPIRACAO_DO_CICLO]).toBeUndefined()
  })

  it('edição coordenada DEPOIS do retorno da indexação e ANTES da marca: a marca atrasada do ciclo anterior é recusada', async () => {
    base.semear({ id: 'e1', content: ANTIGO, metadata: { chaveDoFato: 'chave-1' } })
    const { ciclo } = await reindexEntry('e1', tenant)
    await editarEntradaCoordenada('e1', { content: NOVO })
    expect(base.meta('e1')[CICLO_DE_INDEXACAO]).toBeUndefined()
    await expect(marcarFatoIndexado(dbFalso as never, 'e1', new Date(), undefined, ciclo)).rejects.toThrow(/outra indexação assumiu a entrada e1/)
    expect(base.meta('e1').indexadoEm).toBeUndefined()
  })
})

describe('metadataDaEdicao — as chaves do sistema vêm da linha; mudando o índice, saem', () => {
  const ATUAL = { chaveDoFato: 'k', indexadoEm: 'x', cicloDeIndexacao: 'c', cicloExpiraEm: 'p' }
  it('sem metadata no pedido e sem mudar o índice: não escreve metadata', () => {
    expect(metadataDaEdicao(ATUAL, undefined, false)).toBeUndefined()
  })
  it('mudando o índice: marca, token e prazo saem; o resto fica', () => {
    expect(metadataDaEdicao(ATUAL, undefined, true)).toEqual({ chaveDoFato: 'k' })
    expect(metadataDaEdicao({ a: 1 }, undefined, true)).toBeUndefined()
  })
  it('o metadata da pessoa substitui o dela, mas não apaga nem forja as chaves do sistema', () => {
    expect(metadataDaEdicao(ATUAL, { nota: 1, cicloDeIndexacao: 'forjado' }, false)).toEqual({ nota: 1, indexadoEm: 'x', cicloDeIndexacao: 'c', cicloExpiraEm: 'p' })
    expect(metadataDaEdicao(ATUAL, null, false)).toEqual({ indexadoEm: 'x', cicloDeIndexacao: 'c', cicloExpiraEm: 'p' })
    expect(metadataDaEdicao({ a: 1 }, null, false)).toBeNull()
  })
})
