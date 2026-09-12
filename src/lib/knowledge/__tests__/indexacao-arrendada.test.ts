import { beforeEach, describe, expect, it, vi } from 'vitest'
import { barreira, base, dbFalso } from './fixtures/base-falsa'

vi.mock('@/lib/db', async () => ({ db: (await import('./fixtures/base-falsa')).dbFalso }))
vi.mock('@upstash/vector', async () => ({ Index: (await import('./fixtures/base-falsa')).IndiceFalso }))
vi.mock('../embeddings', () => ({ generateEmbeddings: vi.fn() }))
vi.mock('../cache', () => ({ invalidateProjectCache: vi.fn(async () => 1) }))

import { generateEmbeddings } from '../embeddings'
import { invalidateProjectCache } from '../cache'
import { reindexEntry } from '../indexer'
import { EXPIRACAO_DO_CICLO, IndexacaoEmAndamento } from '../marca-de-indexado'
import { classificarFato } from '../../brand/migracao-da-voz'
import { criarFatoPeloIndexador, marcarFatoIndexado, motivoDeBloqueioPorIndexacao, reindexarFatoPeloIndexador, type FatoACriar } from '../../../../scripts/migrar-voz-da-marca'

const tenant = { projectId: 6, userId: 'u' }
const embeddings = vi.mocked(generateEmbeddings)
const FATO: FatoACriar = {
  projectId: 6,
  categoria: 'ESTABELECIMENTO_INFO',
  titulo: 'Aniversário',
  trecho: 'Aniversário só com bolo próprio, e a casa oferece o brinde à escolha do aniversariante.',
  validaAte: null,
  versaoDaPrevia: 'v1',
  chave: 'chave-do-fato-1',
}
const db = dbFalso as never

beforeEach(() => {
  base.reset()
  vi.clearAllMocks()
  process.env.UPSTASH_VECTOR_REST_URL = 'https://x.upstash.io'
  process.env.UPSTASH_VECTOR_REST_TOKEN = 't'
  embeddings.mockImplementation(async (textos: string[]) => textos.map(() => [0.1, 0.2]))
})

describe('PR13-40 — o ciclo que a indexação carimba é o MESMO que o registrador padrão usa para publicar a marca', () => {
  it('fato novo pelo caminho padrão (criarEntradaBase → reindexEntry → marcarFatoIndexado): termina COMPLETO, sem falso conflito', async () => {
    await expect(criarFatoPeloIndexador(db, FATO, 'u')).resolves.toBeUndefined()
    const [linha] = [...base.entradas.values()]
    const meta = linha.metadata as Record<string, unknown>
    expect(meta.chaveDoFato).toBe(FATO.chave)
    expect(typeof meta.cicloDeIndexacao).toBe('string')
    expect(typeof meta.indexadoEm).toBe('string')
    expect(meta[EXPIRACAO_DO_CICLO]).toBeUndefined()
    expect(classificarFato(linha)).toBe('completo')
    expect(base.chunks.filter((c) => c.entryId === linha.id).length).toBeGreaterThan(0)
    expect(base.vetores.get(`${linha.id}:0`)?.metadata.entryId).toBe(linha.id)
    // a marca foi gravada contra o token que a indexação carimbou (nenhum updateMany recusado no fim)
    const ultimo = dbFalso.knowledgeBaseEntry.updateMany.mock.results.at(-1)
    await expect(ultimo?.value).resolves.toEqual({ count: 1 })
  })

  it('outra execução troca o ciclo entre a indexação e a marca: a marca continua RECUSADA e a linha fica incompleta', async () => {
    vi.mocked(invalidateProjectCache).mockImplementationOnce(async () => {
      const [linha] = [...base.entradas.values()]
      await reindexEntry(linha.id, tenant) // outra indexação completa, com token próprio
      return 1
    })
    await expect(criarFatoPeloIndexador(db, FATO, 'u')).rejects.toThrow(/outra indexação assumiu a entrada .* não é gravada por esta execução/)
    const [linha] = [...base.entradas.values()]
    expect((linha.metadata as Record<string, unknown>).indexadoEm).toBeUndefined()
    expect(classificarFato(linha)).toBe('incompleto')
  })
})

describe('PR13-41 — a entrada é ARRENDADA do começo ao fim: a execução que perdeu o ciclo nunca apaga o que a seguinte recuperou', () => {
  it('A parada antes do delete; B recusada sem tocar em nada; A expira; B toma, conclui e publica; A retoma, perde e não apaga nem publica', async () => {
    base.semear({ id: 'e1', content: FATO.trecho, metadata: { origem: 'migracao-da-voz', chaveDoFato: FATO.chave, indexadoEm: '2026-09-01T10:00:00.000Z' } })
    const b = barreira()
    base.aoConsultar = async () => {
      base.aoConsultar = undefined // só a PRIMEIRA consulta (a de A) para
      await b.parar()
    }

    // A: a reindexação administrativa, sem sinal
    const execucaoA = reindexEntry('e1', tenant, { ciclo: 'ciclo-A' })
    execucaoA.catch(() => undefined)
    await b.chegou
    expect(base.meta('e1').cicloDeIndexacao).toBe('ciclo-A')
    expect(base.meta('e1').indexadoEm).toBeUndefined()

    // B enquanto o arrendamento de A vale: recusada, nada tocado
    const antesDeB = structuredClone(base.linha('e1'))
    const escritasAntesDeB = { update: dbFalso.knowledgeBaseEntry.updateMany.mock.calls.length, chunks: dbFalso.knowledgeChunk.deleteMany.mock.calls.length, consultas: base.chamadas.query }
    await expect(reindexEntry('e1', tenant, { ciclo: 'ciclo-B' })).rejects.toBeInstanceOf(IndexacaoEmAndamento)
    await expect(reindexarFatoPeloIndexador(db, 'e1', FATO, 'u')).rejects.toMatchObject({ code: 'INDEXACAO_EM_ANDAMENTO' })
    expect(base.linha('e1')).toEqual(antesDeB)
    expect(dbFalso.knowledgeBaseEntry.updateMany.mock.calls.length).toBe(escritasAntesDeB.update)
    expect(dbFalso.knowledgeChunk.deleteMany.mock.calls.length).toBe(escritasAntesDeB.chunks)
    expect(base.chamadas.query).toBe(escritasAntesDeB.consultas)
    expect(base.chamadas.delete).toHaveLength(0)

    // o arrendamento de A vence (execução lenta demais)
    await dbFalso.knowledgeBaseEntry.update({ where: { id: 'e1' }, data: { metadata: { ...base.meta('e1'), [EXPIRACAO_DO_CICLO]: new Date(Date.now() - 1000).toISOString() } } })

    // B (a retomada da migração, pelo reindexador padrão) toma, recupera chunks e vetores e publica a marca
    await reindexarFatoPeloIndexador(db, 'e1', FATO, 'u')
    const cicloDeB = base.meta('e1').cicloDeIndexacao
    expect(cicloDeB).not.toBe('ciclo-A')
    expect(typeof base.meta('e1').indexadoEm).toBe('string')
    expect(base.chamadas.delete).toEqual([['e1:0']]) // o delete de B sobre os vetores antigos
    const depoisDeB = structuredClone({ linha: base.linha('e1'), chunks: base.chunks, vetores: [...base.vetores.entries()] })
    expect(depoisDeB.vetores).toEqual([['e1:0', expect.objectContaining({ vector: [0.1, 0.2] })]])

    // A retoma com os ids que consultou (os MESMOS que B acabou de recuperar) — e os embeddings dela falhariam
    embeddings.mockRejectedValue(new Error('embeddings fora do ar'))
    b.liberar()
    await expect(execucaoA).rejects.toMatchObject({ code: 'INDEXACAO_PERDIDA', message: expect.stringMatching(/antes de "apagar vetores"/) })

    // nada de A depois de perder: nenhum delete, nenhum chunk apagado, nenhuma marca, nenhuma escrita na linha
    expect(base.chamadas.delete).toEqual([['e1:0']])
    expect(embeddings).toHaveBeenCalledTimes(1) // só o de B
    expect({ linha: base.linha('e1'), chunks: base.chunks, vetores: [...base.vetores.entries()] }).toEqual(depoisDeB)
    expect(base.meta('e1').cicloDeIndexacao).toBe(cicloDeB)
    expect(classificarFato(base.linha('e1'))).toBe('completo')
    expect(base.vetores.size).toBeGreaterThan(0) // nunca marca válida sem vetores
  })

  it('a marca publicada tarde por uma execução que perdeu o ciclo continua recusada', async () => {
    base.semear({ id: 'e1', content: FATO.trecho, metadata: { chaveDoFato: FATO.chave, cicloDeIndexacao: 'ciclo-B' } })
    await expect(marcarFatoIndexado(db, 'e1', new Date(), undefined, 'ciclo-A')).rejects.toThrow(/outra indexação assumiu a entrada e1/)
    expect(base.meta('e1').indexadoEm).toBeUndefined()
  })

  it('a migração lê arrendamento vigente (ou perdido) como BLOQUEIO com motivo; outro erro segue como erro', () => {
    const motivo = motivoDeBloqueioPorIndexacao(new IndexacaoEmAndamento('e1', '2026-09-12T12:05:00.000Z'), FATO)
    expect(motivo).toMatch(/está sendo indexado por outra execução/)
    expect(motivo).toMatch(/arrendamento vigente até 2026-09-12T12:05:00.000Z/)
    expect(motivo).toMatch(/Nada da voz foi gravado/)
    expect(motivoDeBloqueioPorIndexacao({ code: 'INDEXACAO_PERDIDA', message: 'perdida' }, FATO)).toMatch(/perdida/)
    expect(motivoDeBloqueioPorIndexacao(new Error('embeddings fora do ar'), FATO)).toBeNull()
  })
})
