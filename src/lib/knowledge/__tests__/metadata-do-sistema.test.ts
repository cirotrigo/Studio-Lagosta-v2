import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'
import { barreira, base, dbFalso } from './fixtures/base-falsa'

vi.mock('@/lib/db', async () => ({ db: (await import('./fixtures/base-falsa')).dbFalso }))
vi.mock('@upstash/vector', async () => ({ Index: (await import('./fixtures/base-falsa')).IndiceFalso }))
vi.mock('../embeddings', () => ({ generateEmbeddings: vi.fn() }))
vi.mock('../cache', () => ({ invalidateProjectCache: vi.fn(async () => 1) }))
vi.mock('@clerk/nextjs/server', () => ({ auth: vi.fn(async () => ({ userId: 'clerk_u', orgId: 'org_1' })) }))
vi.mock('@/lib/auth-utils', () => ({ getUserFromClerkId: vi.fn(async () => ({ id: 'u', email: null })) }))
vi.mock('@/lib/mcp/tools', () => ({ resolverAutor: vi.fn(async () => 'u') }))
vi.mock('@prisma/client', () => ({ KnowledgeCategory: { ESTABELECIMENTO_INFO: 'ESTABELECIMENTO_INFO', CAMPANHAS: 'CAMPANHAS' } }))

import { generateEmbeddings } from '../embeddings'
import { invalidateProjectCache } from '../cache'
import { reindexEntry } from '../indexer'
import { criarEntradaBase } from '../entries'
import { adquirirArrendamento, editarEntradaCoordenada } from '../arrendamento'
import { CICLO_DE_INDEXACAO, EXPIRACAO_DO_CICLO, MARCA_DE_INDEXADO } from '../marca-de-indexado'
import { chaveDoFato, fatosNoDna, manifestoEmBranco, type Manifesto } from '../../brand/migracao-da-voz'
import { aplicarManifesto, criarFatoPeloIndexador, lerEstadoDoCliente, marcarFatoIndexado, type ComTrava } from '../../../../scripts/migrar-voz-da-marca'
import { POST as confirmar } from '@/app/api/knowledge/confirm/route'
import { PUT as editarPelaApi } from '@/app/api/knowledge/[id]/route'
import { PUT as editarPeloAdmin } from '@/app/api/admin/knowledge/[id]/route'
import { toolsDeBaseEDna } from '@/lib/mcp/catalogo/base-e-dna'

const tenant = { projectId: 6, userId: 'u' }
const embeddings = vi.mocked(generateEmbeddings)
const ANTIGO = 'Rodízio completo de terça a domingo, das 11h às 23h, com buffet de saladas e cortes nobres na brasa.'
const NOVO = 'Rodízio completo de terça a sábado, das 11h às 22h, com buffet de saladas, sobremesa e cortes nobres na brasa.'
const IDENTIDADE = { chaveDoFato: 'chave-1', origem: 'migracao-da-voz', versaoDaPrevia: 'v1' }
const MARCA_ANTIGA = '2026-09-01T10:00:00.000Z'

const json = (corpo: Record<string, unknown>) => ({ body: JSON.stringify(corpo), headers: { 'content-type': 'application/json' } })
const confirmarPelaRota = (corpo: Record<string, unknown>) => confirmar(new Request('http://localhost/api/knowledge/confirm', { method: 'POST', ...json(corpo) }))
const editarPelaApiRota = (id: string, corpo: Record<string, unknown>) => editarPelaApi(new NextRequest(`http://localhost/api/knowledge/${id}`, { method: 'PUT', ...json(corpo) }), { params: Promise.resolve({ id }) })
const editarPeloAdminRota = (id: string, corpo: Record<string, unknown>) => editarPeloAdmin(new NextRequest(`http://localhost/api/admin/knowledge/${id}`, { method: 'PUT', ...json(corpo) }), { params: Promise.resolve({ id }) })

beforeEach(() => {
  base.reset()
  vi.clearAllMocks()
  process.env.UPSTASH_VECTOR_REST_URL = 'https://x.upstash.io'
  process.env.UPSTASH_VECTOR_REST_TOKEN = 't'
  embeddings.mockImplementation(async (textos: string[]) => textos.map(() => [0.1, 0.2]))
})

describe('PR13-47 — a identidade do fato sobrevive à edição pela confirmação: a reaplicação não duplica, e a correção da pessoa bloqueia', () => {
  const DNA = {
    toneOfVoice: null,
    contentRules: 'Happy hour das 17h às 19h, com petiscos da casa e música ao vivo no salão principal.\nO gelato custa R$ 25 hoje, em qualquer sabor da vitrine, na casquinha ou no copo.',
    updatedAt: new Date('2026-09-10T12:00:00Z'),
  }
  const PARADA = 'parada da prova depois dos fatos, antes da voz'

  async function manifestoAprovado(): Promise<Manifesto> {
    base.dna = DNA
    const lido = await lerEstadoDoCliente(dbFalso as never, 6)
    if (!lido) throw new Error('o projeto 6 não tem voz proposta')
    const trechos = fatosNoDna(DNA).map((f) => f.trecho)
    expect(trechos).toHaveLength(2)
    const m = manifestoEmBranco([lido.previa])
    m.clientes[0] = { ...m.clientes[0], decisao: 'migrar', aprovadoPor: 'Ciro', aprovadoEm: '2026-09-12', fatosParaABase: trechos.map((trecho, i) => ({ trecho, categoria: 'ESTABELECIMENTO_INFO', titulo: `Fato ${i + 1}` })) }
    return m
  }
  const chavesDe = (m: Manifesto) => m.clientes[0].fatosParaABase.map((f) => chaveDoFato({ projectId: 6, versaoDaPrevia: m.clientes[0].versaoDaPrevia, trecho: f.trecho }))
  const linhasDaChave = (chave: string) => [...base.entradas.values()].filter((l) => (l.metadata as Record<string, unknown> | null)?.chaveDoFato === chave)
  const completa = (chave: string) => linhasDaChave(chave).some((l) => typeof (l.metadata as Record<string, unknown>)[MARCA_DE_INDEXADO] === 'string')

  /** A trava da prova: sem banco de verdade; para a aplicação na conferência em que todos os fatos já estão completos (antes da voz). */
  function travaDaProva(chaves: string[]): ComTrava {
    return (async (_projectId: number, corpo: (t: never) => Promise<unknown>) =>
      corpo({
        conferir: async () => {
          if (chaves.every(completa)) throw new Error(PARADA)
        },
        vigiar: <T,>(escrita: (signal: AbortSignal) => Promise<T>) => escrita(new AbortController().signal),
        pid: 1,
      } as never)) as ComTrava
  }
  const aplicar = (m: Manifesto) =>
    aplicarManifesto(dbFalso as never, m, { comTrava: travaDaProva(chavesDe(m)), criarFato: (fato, autor, signal) => criarFatoPeloIndexador(dbFalso as never, fato, autor, signal) })

  /** A aplicação cria o 1º fato e falha no 2º (embeddings fora do ar): o 2º é desfeito, o 1º fica completo. */
  async function falhaParcial(m: Manifesto) {
    const [ch1, ch2] = chavesDe(m)
    embeddings.mockImplementationOnce(async (textos: string[]) => textos.map(() => [0.1, 0.2])).mockImplementationOnce(async () => {
      throw new Error('embeddings fora do ar')
    })
    const [r] = await aplicar(m)
    expect(r).toMatchObject({ acao: 'migrar', fatosCriados: 1, fatosJaExistentes: 0, erro: expect.any(String) })
    expect(linhasDaChave(ch1)).toHaveLength(1)
    expect(completa(ch1)).toBe(true)
    expect(linhasDaChave(ch2)).toHaveLength(0)
    return linhasDaChave(ch1)[0]
  }

  it.each([
    ['omitido', {}],
    ['nulo', { metadata: null }],
    ['substituído', { metadata: { nota: 'conferido pela Roberta' } }],
  ])('metadata %s na confirmação real: a reaplicação acha o fato pela chave e cria só o que faltava', async (_rotulo, extra) => {
    const m = await manifestoAprovado()
    const [ch1, ch2] = chavesDe(m)
    const linha1 = await falhaParcial(m)

    const r = await confirmarPelaRota({ projectId: 6, preview: { operation: 'UPDATE', category: 'ESTABELECIMENTO_INFO', title: 'Fato 1 revisado', content: linha1.content, tags: ['migracao-da-voz'], targetEntryId: linha1.id, ...extra } })
    expect(r.status).toBe(200)
    expect(base.meta(linha1.id)).toMatchObject({ chaveDoFato: ch1, origem: 'migracao-da-voz', versaoDaPrevia: m.clientes[0].versaoDaPrevia })

    const [r2] = await aplicar(m)
    expect(r2).toMatchObject({ acao: 'migrar', fatosCriados: 1, fatosJaExistentes: 1, fatosReindexados: 0, erro: PARADA })
    expect(linhasDaChave(ch1)).toHaveLength(1)
    expect(linhasDaChave(ch2)).toHaveLength(1)
    expect(base.entradas.size).toBe(2)
  })

  it('conteúdo corrigido pela confirmação real: a identidade fica, e a reaplicação BLOQUEIA pela divergência em vez de recriar o texto anterior', async () => {
    const m = await manifestoAprovado()
    const [ch1] = chavesDe(m)
    const linha1 = await falhaParcial(m)
    const CORRIGIDO = 'Happy hour das 18h às 20h, com petiscos da casa e música ao vivo no salão principal.'

    const r = await confirmarPelaRota({ projectId: 6, preview: { operation: 'UPDATE', category: 'ESTABELECIMENTO_INFO', title: 'Fato 1', content: CORRIGIDO, tags: [], targetEntryId: linha1.id, metadata: null } })
    expect(r.status).toBe(200)
    expect(base.meta(linha1.id).chaveDoFato).toBe(ch1)

    const [r2] = await aplicar(m)
    expect(r2).toMatchObject({ acao: 'bloqueado', motivo: expect.stringMatching(/conteúdo editado/) })
    expect(base.entradas.size).toBe(1)
    expect(base.linha(linha1.id).content).toBe(CORRIGIDO)
  })
})

describe('PR13-47 — todo escritor de metadata respeita a partição: pessoa × identidade × marcas da indexação', () => {
  const SEMENTE = { ...IDENTIDADE, nota: 'da pessoa', [MARCA_DE_INDEXADO]: MARCA_ANTIGA }

  it('PUT /api/knowledge/[id] (rota real), conteúdo novo e metadata substituído: a identidade fica, a pessoa troca o dela, forjar não pega', async () => {
    base.semear({ id: 'e1', content: ANTIGO, metadata: SEMENTE })
    const r = await editarPelaApiRota('e1', { content: NOVO, metadata: { nota: 'nova', chaveDoFato: 'forjada', origem: 'forjada', [MARCA_DE_INDEXADO]: 'forjada' } })
    expect(r.status).toBe(200)
    expect(base.linha('e1').content).toBe(NOVO)
    expect(base.meta('e1')).toMatchObject({ ...IDENTIDADE, nota: 'nova' })
    expect(base.meta('e1')[MARCA_DE_INDEXADO]).toBeUndefined() // a marca atestava os chunks do texto anterior
  })

  it('PUT /api/knowledge/[id] (rota real), metadata nulo sem mudar o índice: só o da pessoa sai', async () => {
    base.semear({ id: 'e1', content: ANTIGO, metadata: SEMENTE })
    const r = await editarPelaApiRota('e1', { tags: ['almoco'], metadata: null })
    expect(r.status).toBe(200)
    expect(base.meta('e1')).toEqual({ ...IDENTIDADE, [MARCA_DE_INDEXADO]: MARCA_ANTIGA })
  })

  it('PUT /api/admin/knowledge/[id] (rota real, updateEntry), conteúdo novo e metadata nulo: a identidade fica', async () => {
    process.env.ADMIN_USER_IDS = 'clerk_u'
    try {
      base.semear({ id: 'e1', content: ANTIGO, metadata: SEMENTE })
      const r = await editarPeloAdminRota('e1', { content: NOVO, metadata: null })
      expect(r.status).toBe(200)
      expect(base.meta('e1')).toMatchObject(IDENTIDADE)
      expect(base.meta('e1').nota).toBeUndefined()
      expect(base.meta('e1')[MARCA_DE_INDEXADO]).toBeUndefined()
    } finally {
      delete process.env.ADMIN_USER_IDS
    }
  })

  it('tool atualizar-entrada-base (handler real), conteúdo novo: identidade e metadata da pessoa ficam', async () => {
    base.semear({ id: 'e1', content: ANTIGO, metadata: SEMENTE })
    const tool = toolsDeBaseEDna.find((t) => t.nome === 'atualizar-entrada-base')!
    await expect(tool.handler({ projectId: 6, entradaId: 'e1', content: NOVO }, { kind: 'service' })).resolves.toMatchObject({ atualizada: true })
    expect(base.linha('e1').content).toBe(NOVO)
    expect(base.meta('e1')).toMatchObject({ ...IDENTIDADE, nota: 'da pessoa' })
  })

  it('confirmação real CREATE (indexEntry): o metadata da pessoa não carrega identidade de fato nem marca, token ou prazo', async () => {
    const r = await confirmarPelaRota({ projectId: 6, preview: { operation: 'CREATE', category: 'ESTABELECIMENTO_INFO', title: 'Horário', content: ANTIGO, tags: [], metadata: { horario: '11h às 23h', chaveDoFato: 'forjada', [MARCA_DE_INDEXADO]: 'forjada', [CICLO_DE_INDEXACAO]: 'forjado', [EXPIRACAO_DO_CICLO]: '2099-01-01T00:00:00.000Z' } } })
    expect(r.status).toBe(200)
    const [linha] = [...base.entradas.values()]
    expect(linha.metadata).toEqual({ horario: '11h às 23h' })
  })

  it('criarEntradaBase: a identidade vem de quem cria; marca e prazo prontos no metadata são descartados e a indexação desta criação não é recusada', async () => {
    const entrada = await criarEntradaBase(
      { projectId: 6, category: 'ESTABELECIMENTO_INFO', title: 'Fato', content: ANTIGO, autor: 'u', metadata: { ...IDENTIDADE, [MARCA_DE_INDEXADO]: 'forjada', [EXPIRACAO_DO_CICLO]: '2099-01-01T00:00:00.000Z' } },
      { ciclo: 'ciclo-criacao' },
    )
    expect(entrada.ciclo).toBe('ciclo-criacao')
    expect(base.meta(entrada.id)).toEqual({ ...IDENTIDADE, [CICLO_DE_INDEXACAO]: 'ciclo-criacao' })
    expect(base.chunks.filter((c) => c.entryId === entrada.id).length).toBeGreaterThan(0)
  })

  it('o ciclo (adquirir, renovar, repor a marca, liberar): só as marcas transitórias mudam — identidade e pessoa ficam no meio e no fim', async () => {
    base.semear({ id: 'e1', content: ANTIGO, metadata: SEMENTE })
    const b = barreira()
    embeddings.mockImplementationOnce(async (textos: string[]) => {
      await b.parar()
      return textos.map(() => [0.1, 0.2])
    })
    const execucao = reindexEntry('e1', tenant, { ciclo: 'ciclo-A' })
    await b.chegou
    expect(base.meta('e1')).toMatchObject({ ...IDENTIDADE, nota: 'da pessoa', [CICLO_DE_INDEXACAO]: 'ciclo-A', [EXPIRACAO_DO_CICLO]: expect.any(String) })
    expect(base.meta('e1')[MARCA_DE_INDEXADO]).toBeUndefined()
    b.liberar()
    await execucao
    expect(base.meta('e1')).toMatchObject({ ...IDENTIDADE, nota: 'da pessoa', [CICLO_DE_INDEXACAO]: 'ciclo-A', [MARCA_DE_INDEXADO]: expect.any(String) })
    expect(base.meta('e1')[EXPIRACAO_DO_CICLO]).toBeUndefined()
  })
})

describe('PR13-48 — a marca de indexado toca só a própria chave, por compare-and-set no updatedAt', () => {
  /** Suspende `marcarFatoIndexado` logo DEPOIS da leitura dele (o `findUnique` que lê o metadata sem ler o conteúdo). */
  function suspenderDepoisDaLeituraDaMarca() {
    const b = barreira()
    const lerDeVerdade = dbFalso.knowledgeBaseEntry.findUnique.getMockImplementation()!
    let parou = false
    dbFalso.knowledgeBaseEntry.findUnique.mockImplementation(async (args: Parameters<typeof lerDeVerdade>[0]) => {
      const lida = await lerDeVerdade(args)
      if (!parou && args.select?.metadata && !args.select?.content) {
        parou = true
        await b.parar()
      }
      return lida
    })
    return { b, restaurar: () => dbFalso.knowledgeBaseEntry.findUnique.mockImplementation(lerDeVerdade) }
  }

  it('edição coordenada de metadata ENTRE a leitura e a escrita da marca: a nota nova fica junto com indexadoEm', async () => {
    base.semear({ id: 'e1', content: ANTIGO, metadata: { ...IDENTIDADE, nota: 'antiga', [CICLO_DE_INDEXACAO]: 'ciclo-A' } })
    const { b, restaurar } = suspenderDepoisDaLeituraDaMarca()
    try {
      const marca = marcarFatoIndexado(dbFalso as never, 'e1', new Date('2026-09-12T12:00:00.000Z'), undefined, 'ciclo-A')
      marca.catch(() => undefined)
      await b.chegou
      await editarEntradaCoordenada('e1', { metadata: { nota: 'revisada' } })
      expect(base.meta('e1')).toMatchObject({ nota: 'revisada', [CICLO_DE_INDEXACAO]: 'ciclo-A' }) // não trocou o token
      b.liberar()
      await expect(marca).resolves.toBeUndefined()
      expect(base.meta('e1')).toEqual({ ...IDENTIDADE, nota: 'revisada', [CICLO_DE_INDEXACAO]: 'ciclo-A', [MARCA_DE_INDEXADO]: '2026-09-12T12:00:00.000Z' })
    } finally {
      restaurar()
    }
  })

  it('outra execução adquire ENTRE a leitura e a escrita da marca: a troca de ciclo continua recusando a marca', async () => {
    base.semear({ id: 'e1', content: ANTIGO, metadata: { ...IDENTIDADE, [CICLO_DE_INDEXACAO]: 'ciclo-A' } })
    const { b, restaurar } = suspenderDepoisDaLeituraDaMarca()
    try {
      const marca = marcarFatoIndexado(dbFalso as never, 'e1', new Date(), undefined, 'ciclo-A')
      marca.catch(() => undefined)
      await b.chegou
      await adquirirArrendamento('e1', 'ciclo-B')
      b.liberar()
      await expect(marca).rejects.toThrow(/outra indexação assumiu a entrada e1/)
      expect(base.meta('e1')[MARCA_DE_INDEXADO]).toBeUndefined()
      expect(base.meta('e1')).toMatchObject({ ...IDENTIDADE, [CICLO_DE_INDEXACAO]: 'ciclo-B' })
    } finally {
      restaurar()
    }
  })
})

describe('PR13-46 — INDEXACAO_PERDIDA não promete que outra execução vai concluir', () => {
  it('pela rota real de confirmação: cinco conflitos de compare-and-set (edição de campo não indexado) com o token AINDA desta execução → 202, cache invalidado, aviso sem promessa', async () => {
    base.semear({ id: 'e1', content: ANTIGO, metadata: { ...IDENTIDADE, [MARCA_DE_INDEXADO]: MARCA_ANTIGA } })
    const gravarDeVerdade = dbFalso.knowledgeBaseEntry.updateMany.getMockImplementation()!
    let conflitos = 0
    let cicloDaExecucao: unknown
    dbFalso.knowledgeBaseEntry.updateMany.mockImplementation(async (args: Parameters<typeof gravarDeVerdade>[0]) => {
      const meta = args.data.metadata as Record<string, unknown> | undefined
      // A renovação (token no filtro, prazo no dado, sem marca): antes de cada uma, outra edição de TAG avança o updatedAt.
      if (args.where.metadata && meta && EXPIRACAO_DO_CICLO in meta && !(MARCA_DE_INDEXADO in meta) && conflitos < 5) {
        conflitos++
        cicloDaExecucao = args.where.metadata.equals
        await dbFalso.knowledgeBaseEntry.update({ where: { id: args.where.id }, data: { tags: [`toque-${conflitos}`] } })
      }
      return gravarDeVerdade(args)
    })
    try {
      const r = await confirmarPelaRota({ projectId: 6, preview: { operation: 'UPDATE', category: 'ESTABELECIMENTO_INFO', title: 't', content: NOVO, tags: [], targetEntryId: 'e1' } })
      const corpo = await r.json()
      expect(conflitos).toBe(5)
      expect(r.status).toBe(202)
      expect(corpo).toMatchObject({ success: true, entryId: 'e1', indexacao: 'pendente', code: 'INDEXACAO_PERDIDA', aviso: expect.stringMatching(/A edição foi salva/) })
      expect(corpo.aviso).not.toMatch(/outra execução|já com o texto novo|quando essa indexação terminar/i)
      expect(base.linha('e1').content).toBe(NOVO)
      expect(base.meta('e1')[CICLO_DE_INDEXACAO]).toBe(cicloDaExecucao) // o token nunca deixou de ser desta execução
      expect(base.meta('e1')[EXPIRACAO_DO_CICLO]).toBeUndefined() // e ela soltou a entrada
      expect(invalidateProjectCache).toHaveBeenCalledWith(6)
    } finally {
      dbFalso.knowledgeBaseEntry.updateMany.mockImplementation(gravarDeVerdade)
    }
  })
})
