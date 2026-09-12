import { describe, expect, it, vi } from 'vitest'
import { limparRodada, type AlvosDaLimpeza, type BancoDaLimpeza } from '../../../scripts/lib/limpeza-contexto-da-semana'

/**
 * R48 (oitava revisão final de 74afb769): o cleanup da prova do contexto da semana roda em passos independentes —
 * a falha de UMA exclusão não pula as outras, e o resultado a registra.
 */
const alvos: AlvosDaLimpeza = {
  projeto: 8,
  marca: '[PROVA]',
  inicio: new Date('2026-09-12T20:00:00Z'),
  posts: ['p1', 'p2'],
  geracoes: ['g-isolamento', 'g1', 'g1'],
  entradas: ['e1'],
  usos: ['u1'],
  sinais: ['s1'],
  sinaisDeSlot: ['ss1'],
}

function bancoFalso(falhar: Partial<Record<'generation.deleteMany' | 'socialPost.findMany' | 'knowledgeBaseEntry.deleteMany' | 'photoUsage.deleteMany' | 'learningSignal.count', true>> = {}) {
  const erro = () => Promise.reject(new Error('conexão caiu'))
  const db = {
    generation: { deleteMany: vi.fn((_: unknown) => (falhar['generation.deleteMany'] ? erro() : Promise.resolve({ count: 2 }))) },
    socialPost: {
      findMany: vi.fn((_: unknown) => (falhar['socialPost.findMany'] ? erro() : Promise.resolve([{ id: 'p1' }, { id: 'p2' }, { id: 'p-da-marca' }]))),
      deleteMany: vi.fn((_: unknown) => Promise.resolve({ count: 3 })),
    },
    learningSignal: {
      deleteMany: vi.fn((_: { where: Record<string, unknown> }) => Promise.resolve({ count: 1 })),
      count: vi.fn((_: unknown) => (falhar['learningSignal.count'] ? erro() : Promise.resolve(0))),
    },
    knowledgeBaseEntry: { deleteMany: vi.fn((_: unknown) => (falhar['knowledgeBaseEntry.deleteMany'] ? erro() : Promise.resolve({ count: 1 }))) },
    photoUsage: { deleteMany: vi.fn((_: unknown) => (falhar['photoUsage.deleteMany'] ? erro() : Promise.resolve({ count: 1 }))) },
  }
  return db as typeof db & BancoDaLimpeza
}

describe('limparRodada — o cleanup da prova em passos independentes (R48)', () => {
  it('tudo dá certo: nenhuma falha, cada exclusão restrita ao projeto, as Generations num passo só e sem id repetido', async () => {
    const db = bancoFalso()
    const r = await limparRodada(db, alvos)
    expect(r.falhas).toEqual([])
    expect(r.apagados).toEqual({ posts: 3, sinaisDePost: 1, entradas: 1, sinais: 1, sinaisDeSlot: 1, geracoes: 2, usos: 1 })
    expect(db.generation.deleteMany).toHaveBeenCalledTimes(1)
    expect(db.generation.deleteMany.mock.calls[0][0]).toEqual({ where: { id: { in: ['g-isolamento', 'g1'] }, projectId: 8 } })
    // os posts recuperados pela marca entram na exclusão dos sinais e dos posts
    expect(db.socialPost.deleteMany.mock.calls[0][0]).toEqual({ where: { projectId: 8, id: { in: ['p1', 'p2', 'p-da-marca'] } } })
  })

  it('só a exclusão das Generations falha: posts, entradas, usos e sinais são apagados do mesmo jeito, a conferência roda e a falha fica registrada', async () => {
    const db = bancoFalso({ 'generation.deleteMany': true })
    const r = await limparRodada(db, alvos)
    expect(r.falhas).toEqual(['geracoes: conexão caiu'])
    expect(db.socialPost.deleteMany).toHaveBeenCalledTimes(1)
    expect(db.knowledgeBaseEntry.deleteMany).toHaveBeenCalledTimes(1)
    expect(db.photoUsage.deleteMany).toHaveBeenCalledTimes(1)
    // sinais dos posts + sinais de foto + sinais de slot
    expect(db.learningSignal.deleteMany).toHaveBeenCalledTimes(3)
    expect(db.learningSignal.count).toHaveBeenCalledTimes(1)
    expect(r.apagados).toMatchObject({ posts: 3, entradas: 1, usos: 1, sinais: 1, sinaisDeSlot: 1, geracoes: 0 })
  })

  it.each([
    ['socialPost.findMany', 'posts'],
    ['knowledgeBaseEntry.deleteMany', 'entradas'],
    ['photoUsage.deleteMany', 'usos'],
    ['learningSignal.count', 'conferência R39'],
  ] as const)('a falha em %s não impede os outros passos', async (onde, passo) => {
    const db = bancoFalso({ [onde]: true })
    const r = await limparRodada(db, alvos)
    expect(r.falhas).toEqual([`${passo}: conexão caiu`])
    expect(db.generation.deleteMany).toHaveBeenCalledTimes(1)
    if (onde !== 'photoUsage.deleteMany') expect(db.photoUsage.deleteMany).toHaveBeenCalledTimes(1)
    if (onde !== 'knowledgeBaseEntry.deleteMany') expect(db.knowledgeBaseEntry.deleteMany).toHaveBeenCalledTimes(1)
  })

  it('sobra de sinal amarrado aos posts da rodada é falha do cleanup, não aviso', async () => {
    const db = bancoFalso()
    db.learningSignal.count.mockImplementation(() => Promise.resolve(2))
    const r = await limparRodada(db, alvos)
    expect(r.falhas).toEqual(['conferência R39: 2 sinal(is) de aprendizado ainda amarrado(s) aos posts desta rodada'])
  })
})
