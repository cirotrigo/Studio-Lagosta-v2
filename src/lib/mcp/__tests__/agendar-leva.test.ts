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
