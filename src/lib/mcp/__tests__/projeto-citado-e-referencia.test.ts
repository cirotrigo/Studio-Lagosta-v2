import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * O gate da porta confere só o `projectId`. Dois outros ids que as tools usam
 * também precisam ser do alcance de quem chama:
 * - `clienteCitadoId` (gerar-imagem, criar-plano, editar-item-do-plano): passa
 *   pelo mesmo `assertProjetoPermitido` antes de ser usado;
 * - `generationId` de marcar-referencia-de-estilo: tem de ser do `projectId`,
 *   senão é "não encontrada", igual à que não existe.
 */
const m = vi.hoisted(() => ({
  permitidos: [6] as number[],
  assert: vi.fn(),
  start: vi.fn(),
  criarPlano: vi.fn(),
  atualizarItem: vi.fn(),
  definirRef: vi.fn(),
}))

vi.mock('@/lib/mcp/tools', () => ({
  assertProjetoPermitido: m.assert,
  resolverDono: vi.fn(async () => ({ clerkId: 'user_1' })),
  canalDoPrincipal: vi.fn(() => 'claude-ai'),
  quemDecidiu: vi.fn(async () => 'user_1'),
  itemParaChat: vi.fn((i: unknown) => i),
  resolverPlano: vi.fn(async () => 'plano-1'),
}))
vi.mock('@/lib/ai/creative-generation-service', () => ({ startArtGeneration: m.start }))
vi.mock('@/lib/ai/generation-queue', () => ({ enfileirarArte: vi.fn() }))
vi.mock('@/lib/planos/plano-service', () => ({
  criarPlano: m.criarPlano,
  anexarItensAoPlanoAtivo: vi.fn(),
  atualizarItem: m.atualizarItem,
  transicionarItem: vi.fn(),
}))
vi.mock('@/lib/ai/style-references', () => ({ definirReferenciaDeEstilo: m.definirRef, listarReferenciasDeEstilo: vi.fn() }))
vi.mock('@/lib/db', () => ({ db: {} }))

import { toolsDeArteIA } from '../catalogo/arte-ia'
import { toolsDePlanos } from '../catalogo/planos'
import { CreativeError } from '@/lib/creatives/errors'

const principal = { kind: 'user' } as never
const tool = (nome: string) => [...toolsDeArteIA, ...toolsDePlanos].find((t) => t.nome === nome)!
const rodar = (nome: string, args: Record<string, unknown>) => tool(nome).handler(args as never, principal)

beforeEach(() => {
  vi.clearAllMocks()
  m.assert.mockImplementation(async (id: number) => {
    if (!m.permitidos.includes(id)) throw new CreativeError('PROJETO_SEM_ACESSO', 'sem acesso', 403)
  })
  m.start.mockResolvedValue({ reused: false, runnerArgs: null, jobGenerationId: 'g1', creditosCobrados: 10 })
  m.criarPlano.mockResolvedValue({ plano: { id: 'plano-1', titulo: 't', itens: [], progresso: { frase: '' } }, avisos: [] })
  m.atualizarItem.mockResolvedValue({ item: { id: 'item-1' }, avisos: [] })
  m.definirRef.mockResolvedValue({ generationId: 'g1', marcada: true })
})

describe('clienteCitadoId passa pelo gate de projeto', () => {
  it('gerar-imagem: cliente citado fora do alcance → recusa antes de gerar', async () => {
    await expect(rodar('gerar-imagem', { projectId: 6, trilha: 'imagem', formato: 'story', clienteCitadoId: 9 })).rejects.toThrow(/sem acesso/)
    expect(m.assert).toHaveBeenCalledWith(9, principal)
    expect(m.start).not.toHaveBeenCalled()
  })
  it('gerar-imagem: cliente citado permitido → gera com a marca dele', async () => {
    m.permitidos = [6, 9]
    await rodar('gerar-imagem', { projectId: 6, trilha: 'imagem', formato: 'story', clienteCitadoId: 9 })
    expect(m.start).toHaveBeenCalledWith(expect.objectContaining({ marcaDoClienteProjectId: 9 }))
    m.permitidos = [6]
  })

  it('criar-plano: item com cliente citado fora do alcance → recusa antes de criar', async () => {
    await expect(
      rodar('criar-plano', { projectId: 6, inicio: '2026-10-13', fim: '2026-10-19', itens: [{ tema: 'a' }, { tema: 'b', clienteCitadoId: 9 }] }),
    ).rejects.toThrow(/sem acesso/)
    expect(m.criarPlano).not.toHaveBeenCalled()
  })
  it('criar-plano: cliente citado permitido → cria', async () => {
    m.permitidos = [6, 9]
    await rodar('criar-plano', { projectId: 6, inicio: '2026-10-13', fim: '2026-10-19', itens: [{ tema: 'b', clienteCitadoId: 9 }] })
    expect(m.criarPlano).toHaveBeenCalled()
    m.permitidos = [6]
  })

  it('editar-item-do-plano: cliente citado fora do alcance → recusa antes de gravar', async () => {
    await expect(rodar('editar-item-do-plano', { projectId: 6, itemId: 'item-1', clienteCitadoId: 9 })).rejects.toThrow(/sem acesso/)
    expect(m.atualizarItem).not.toHaveBeenCalled()
  })
  it('editar-item-do-plano: 0 limpa o cliente citado, sem checagem', async () => {
    await rodar('editar-item-do-plano', { projectId: 6, itemId: 'item-1', clienteCitadoId: 0 })
    expect(m.atualizarItem).toHaveBeenCalledWith(expect.objectContaining({ patch: expect.objectContaining({ clienteProjectId: null }) }))
  })
})

describe('marcar-referencia-de-estilo', () => {
  it('passa o projectId do gate ao serviço', async () => {
    await rodar('marcar-referencia-de-estilo', { projectId: 6, generationId: 'g1' })
    expect(m.definirRef).toHaveBeenCalledWith('g1', true, 6)
  })
})
