import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * PR 12 de "Marca simples, copy melhor": `agendar-leva` leva as peças de uma
 * leva de `compor-leva` até a agenda como rascunho, com a MESMA identidade de
 * lote. A porta só valida o schema, resolve quem decidiu e repassa ao serviço
 * (`agendarItensDoLote`, testado com banco falso em src/lib/lotes).
 */
const mocks = vi.hoisted(() => ({ agendarItensDoLote: vi.fn() }))
vi.mock('@/lib/compositor/compor', () => ({ comporPeca: vi.fn() }))
vi.mock('@/lib/compositor/fila', () => ({ enfileirarPeca: vi.fn() }))
vi.mock('@/lib/compositor/medir-copy-service', () => ({ medirCopyDoProjeto: vi.fn() }))
vi.mock('@/lib/lotes/agendar-itens', () => ({ agendarItensDoLote: mocks.agendarItensDoLote }))
vi.mock('@/lib/mcp/tools', () => ({ quemDecidiu: vi.fn(async () => 'u1'), canalDoPrincipal: vi.fn(() => 'claude-ai') }))

import { toolsDoCompositor } from '../catalogo/compositor'

const tool = toolsDoCompositor.find((t) => t.nome === 'agendar-leva')!
const principal = { kind: 'user' } as never

beforeEach(() => {
  vi.clearAllMocks()
  mocks.agendarItensDoLote.mockImplementation(async (e: { loteId: string; simular: boolean }) => ({
    loteId: e.loteId,
    simulado: e.simular,
    resumo: { concluidos: 1, pendentes: 1, falhas: 0 },
    itens: [
      { itemId: 'seg', situacao: 'concluido', desfecho: 'criado', postId: 'p1' },
      { itemId: 'ter', situacao: 'pendente', codigo: 'PECA_EM_ANDAMENTO' },
    ],
  }))
})

describe('agendar-leva: o registro', () => {
  it('existe, é idempotente e não destrutivo, com acesso de projeto nas duas superfícies', () => {
    expect(tool).toBeDefined()
    expect(tool.annotations).toEqual({ readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false })
    expect(tool.acesso).toEqual({ tipo: 'projeto' })
    expect([...tool.superficies]).toEqual(['remoto', 'local'])
  })

  it('exige loteId e itemId, recusa chave desconhecida na raiz e leva acima de 60 itens', () => {
    expect(tool.schema.safeParse({ projectId: 8, loteId: 'semana-2026-09-14', itens: [{ itemId: 'seg', quando: '2026-09-14 19:00', escopo: 'campanha' }], simular: true }).success).toBe(true)
    expect(tool.schema.safeParse({ projectId: 8, itens: [{ itemId: 'seg' }] }).success).toBe(false)
    expect(tool.schema.safeParse({ projectId: 8, loteId: 'l', itens: [{ quando: '2026-09-14 19:00' }] }).success).toBe(false)
    expect(tool.schema.safeParse({ projectId: 8, loteId: 'l', itens: [{ itemId: 'a' }], situacao: 'agendado' }).success).toBe(false)
    expect(tool.schema.safeParse({ projectId: 8, loteId: 'l', itens: Array.from({ length: 61 }, (_, i) => ({ itemId: `i${i}` })) }).success).toBe(false)
    expect(tool.schema.safeParse({ projectId: 8, loteId: 'l', itens: [{ itemId: 'a', postType: 'CAROUSEL' }] }).success).toBe(false)
  })

  it('campo do pedido que o serviço recusa POR ITEM passa pela porta: quando vazio e legenda longa não derrubam a leva (C12-1c)', () => {
    expect(tool.schema.safeParse({ projectId: 8, loteId: 'l', itens: [{ itemId: 'a', quando: '' }, { itemId: 'b', caption: 'x'.repeat(3000) }, { itemId: 'c', campanhaId: '' }] }).success).toBe(true)
  })
})

describe('agendar-leva: decisões do Ciro (13/09/2026)', () => {
  it('recriarRascunhoApagado: a porta aceita só booleano, e só no item', () => {
    expect(tool.schema.safeParse({ projectId: 8, loteId: 'l', itens: [{ itemId: 'a', recriarRascunhoApagado: true }] }).success).toBe(true)
    expect(tool.schema.safeParse({ projectId: 8, loteId: 'l', itens: [{ itemId: 'a', recriarRascunhoApagado: 'true' }] }).success).toBe(false)
    expect(tool.schema.safeParse({ projectId: 8, loteId: 'l', itens: [{ itemId: 'a' }], recriarRascunhoApagado: true }).success).toBe(false)
    expect(tool.descricao).toContain('recriarRascunhoApagado: true')
    expect(tool.descricao).toContain('arteAtualDoItem')
  })

  it('a confirmação chega ao serviço no item, e a nota manda avisar e perguntar quando há rascunho apagado ou peça superada — em simulação também', async () => {
    mocks.agendarItensDoLote.mockImplementationOnce(async (e: { loteId: string; simular: boolean }) => ({
      loteId: e.loteId,
      simulado: e.simular,
      resumo: { concluidos: 0, pendentes: 0, falhas: 2 },
      itens: [
        { itemId: 'seg', situacao: 'falhou', codigo: 'POST_REMOVIDO', rascunhoApagado: { quando: '14/09/2026, 19:00', tema: 'Rodízio', manchete: 'Rodízio em dobro' } },
        { itemId: 'ter', situacao: 'falhou', codigo: 'PECA_SUPERADA_NO_PLANO', arteAtualDoItem: { generationId: 'g2', pageId: null, feitaEm: null, feitaEmBrasilia: null, situacao: 'pronta' } },
      ],
    }))
    const r = (await tool.handler({ projectId: 8, loteId: 'l', itens: [{ itemId: 'seg', recriarRascunhoApagado: true }, { itemId: 'ter' }], simular: true }, principal)) as Record<string, unknown>
    expect(mocks.agendarItensDoLote.mock.calls[0][0].itens).toEqual([{ itemId: 'seg', recriarRascunhoApagado: true }, { itemId: 'ter' }])
    expect(r.nota).toContain('Simulação')
    expect(r.nota).toContain('recriarRascunhoApagado: true')
    expect(r.nota).toContain('Peça superada no plano')
    expect(r.nota).toContain('pergunte')
    // Sem esses casos, a nota não fala deles.
    const comum = (await tool.handler({ projectId: 8, loteId: 'l', itens: [{ itemId: 'seg' }] }, principal)) as Record<string, unknown>
    expect(comum.nota).not.toContain('recriarRascunhoApagado')
  })
})

describe('agendar-leva: a porta', () => {
  it('repassa a leva ao serviço com quem decidiu, superfície chat e simular explícito', async () => {
    const r = (await tool.handler({ projectId: 8, loteId: 'semana-2026-09-14', itens: [{ itemId: 'seg' }, { itemId: 'ter', quando: '2026-09-15 12:00' }] }, principal)) as Record<string, unknown>
    expect(mocks.agendarItensDoLote).toHaveBeenCalledWith({
      projectId: 8,
      loteId: 'semana-2026-09-14',
      itens: [{ itemId: 'seg' }, { itemId: 'ter', quando: '2026-09-15 12:00' }],
      simular: false,
      decididoPor: 'u1',
      superficie: 'chat',
    })
    expect(r).toMatchObject({ simulado: false, resumo: { concluidos: 1, pendentes: 1, falhas: 0 } })
    expect(r.nota).toContain('rascunho')
    expect(r.nota).toContain('Pendentes')
  })

  it('simular: true chega ao serviço e a nota manda mostrar a conta antes', async () => {
    const r = (await tool.handler({ projectId: 8, loteId: 'l', itens: [{ itemId: 'seg' }], simular: true }, principal)) as Record<string, unknown>
    expect(mocks.agendarItensDoLote.mock.calls[0][0]).toMatchObject({ simular: true })
    expect(r.nota).toContain('Simulação')
  })
})
