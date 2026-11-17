import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const listar = vi.hoisted(() => vi.fn(async () => ({ total: 0, artes: [] })))
const apagar = vi.hoisted(() => vi.fn(async () => ({ apagada: true })))
const limpar = vi.hoisted(() => vi.fn(async () => ({ simulacao: true })))
vi.mock('@/lib/creatives/galeria', () => ({
  listarArtesDaGaleria: listar,
  apagarArteDaGaleria: apagar,
  limparGaleriaDoCliente: limpar,
}))
vi.mock('@/lib/creatives/persist', () => ({ getPublicAppUrl: () => 'https://studio.test' }))

import { toolsDeGaleria } from '../galeria'
import { executarTool } from '../../registro/porta'
import { TOOLS_DRAFT_ONLY, perfilDoPrincipal, registrarNoStdio } from '../../registro/perfil'

/**
 * A PORTA das duas tools da galeria: gate de membro antes do serviço, payload estrito, e `apagar-arte`
 * inexistente para o perfil só-rascunho. As regras de recusa estão em `creatives/__tests__/galeria-regras.test.ts`.
 */

const [listarArtes, apagarArte, limparGaleria] = toolsDeGaleria
const indice = new Map(toolsDeGaleria.map((t) => [t.nome, t]))
const SERVICO = { kind: 'service' as const }
const gates = () => ({ projeto: vi.fn(async () => undefined), curador: vi.fn(async () => undefined) })

beforeEach(() => {
  listar.mockClear()
  apagar.mockClear()
  limpar.mockClear()
})
afterEach(() => vi.unstubAllEnvs())

describe('catálogo da galeria', () => {
  it('são três tools: a leitura e as duas destrutivas, nas duas superfícies', () => {
    expect(toolsDeGaleria.map((t) => t.nome)).toEqual(['listar-artes', 'apagar-arte', 'limpar-galeria'])
    expect(listarArtes.annotations).toMatchObject({ readOnlyHint: true, destructiveHint: false })
    expect(apagarArte.annotations).toMatchObject({ readOnlyHint: false, destructiveHint: true })
    expect(limparGaleria.annotations).toMatchObject({ readOnlyHint: false, destructiveHint: true })
    expect(listarArtes.acesso).toEqual({ tipo: 'projeto' })
    expect(apagarArte.acesso).toEqual({ tipo: 'projeto' })
    // A faxina muda a galeria de todo mundo: exige curador, não só membro.
    expect(limparGaleria.acesso).toEqual({ tipo: 'curador' })
    for (const tool of toolsDeGaleria) expect([...tool.superficies].sort()).toEqual(['local', 'remoto'])
  })

  it('a descrição de apagar-arte diz que é destrutiva, sem desfazer, e manda confirmar citando a arte', () => {
    expect(apagarArte.descricao).toContain('DESTRUTIVA')
    expect(apagarArte.descricao).toContain('SEM DESFAZER')
    expect(apagarArte.descricao).toMatch(/confirme com a pessoa antes, citando a arte/)
    expect(apagarArte.descricao).toContain('simular')
    expect(apagarArte.descricao).toContain('NÃO é apagada por padrão')
    expect(apagarArte.descricao).toContain('apagarPagina')
  })
})

describe('apagar-arte na porta', () => {
  const args = { projectId: 7, generationId: 'gen1' }

  it('passa pelo gate de membro do projeto ANTES do serviço', async () => {
    const g = gates()
    g.projeto.mockRejectedValueOnce(new Error('PROJETO_SEM_ACESSO'))
    const r = await executarTool(indice, 'remoto', 'apagar-arte', args, SERVICO, { gates: g })
    expect(r.isError).toBe(true)
    expect(g.projeto).toHaveBeenCalledWith(7, SERVICO)
    expect(apagar).not.toHaveBeenCalled()
  })

  it('caminho feliz: chama o serviço com o cliente, a arte e simular false', async () => {
    const r = await executarTool(indice, 'remoto', 'apagar-arte', args, SERVICO, { gates: gates() })
    expect(r.isError).not.toBe(true)
    expect(apagar).toHaveBeenCalledWith({ projectId: 7, generationId: 'gen1', simular: false, apagarPagina: false, appUrl: 'https://studio.test' })
  })

  it('simular: true chega ao serviço como simulação', async () => {
    await executarTool(indice, 'local', 'apagar-arte', { ...args, simular: true }, SERVICO, { gates: gates() })
    expect(apagar).toHaveBeenCalledWith(expect.objectContaining({ simular: true }))
  })

  it('apagarPagina: true chega ao serviço; só o literal true vale', async () => {
    await executarTool(indice, 'remoto', 'apagar-arte', { ...args, apagarPagina: true }, SERVICO, { gates: gates() })
    expect(apagar).toHaveBeenLastCalledWith(expect.objectContaining({ apagarPagina: true }))
    const r = await executarTool(indice, 'remoto', 'apagar-arte', { ...args, apagarPagina: 'sim' }, SERVICO, { gates: gates() })
    expect(r.isError).toBe(true)
    expect(apagar).toHaveBeenCalledTimes(1)
  })

  it('payload estrito: sem lote, sem force; faltando campo é recusado', async () => {
    for (const ruim of [
      { ...args, force: true },
      { ...args, apagarTudo: true },
      { ...args, generationIds: ['a', 'b'] },
      { projectId: 7 },
      { generationId: 'gen1' },
      { projectId: 7, generationId: '' },
    ]) {
      const r = await executarTool(indice, 'remoto', 'apagar-arte', ruim, SERVICO, { gates: gates() })
      expect(r.isError).toBe(true)
    }
    expect(apagar).not.toHaveBeenCalled()
  })
})

describe('limpar-galeria na porta', () => {
  it('a descrição diz que é destrutiva, em duas chamadas, e que apagar exige o sim da pessoa', () => {
    expect(limparGaleria.descricao).toContain('DESTRUTIVA')
    expect(limparGaleria.descricao).toContain('SEM DESFAZER')
    expect(limparGaleria.descricao).toContain('DUAS chamadas')
    expect(limparGaleria.descricao).toMatch(/sim explícito/)
  })

  it('exige CURADOR antes do serviço', async () => {
    const g = gates()
    g.curador.mockRejectedValueOnce(new Error('PROJETO_SEM_CURADORIA'))
    const r = await executarTool(indice, 'remoto', 'limpar-galeria', { projectId: 7, confirmar: true }, SERVICO, { gates: g })
    expect(r.isError).toBe(true)
    expect(g.curador).toHaveBeenCalledWith(7, SERVICO)
    expect(limpar).not.toHaveBeenCalled()
  })

  it('sem confirmar chega ao serviço como simulação; só o literal true confirma', async () => {
    await executarTool(indice, 'remoto', 'limpar-galeria', { projectId: 7 }, SERVICO, { gates: gates() })
    expect(limpar).toHaveBeenLastCalledWith({ projectId: 7, dias: undefined, limite: undefined, confirmar: false, appUrl: 'https://studio.test' })
    await executarTool(indice, 'remoto', 'limpar-galeria', { projectId: 7, dias: 45, limite: 10, confirmar: true }, SERVICO, { gates: gates() })
    expect(limpar).toHaveBeenLastCalledWith({ projectId: 7, dias: 45, limite: 10, confirmar: true, appUrl: 'https://studio.test' })
  })

  it('recusa menos de 7 dias, lote acima de 40, confirmar que não é booleano e parâmetro extra', async () => {
    for (const ruim of [
      { projectId: 7, dias: 3 },
      { projectId: 7, limite: 41 },
      { projectId: 7, confirmar: 'sim' },
      { projectId: 7, todosOsClientes: true },
      { confirmar: true },
    ]) {
      const r = await executarTool(indice, 'remoto', 'limpar-galeria', ruim, SERVICO, { gates: gates() })
      expect(r.isError).toBe(true)
    }
    expect(limpar).not.toHaveBeenCalled()
  })

  it.each(['remoto', 'local'] as const)('não existe para o cliente draft-only (%s)', async (superficie) => {
    vi.stubEnv('MCP_DRAFT_ONLY_CLIENT_IDS', 'cliente-restrito')
    const principal = { kind: 'user' as const, userId: 'clerk-teste', clientId: 'cliente-restrito' }
    const r = await executarTool(indice, superficie, 'limpar-galeria', { projectId: 7, confirmar: true }, principal, { gates: gates() })
    expect(r).toEqual({ content: [{ type: 'text', text: 'Ferramenta desconhecida: limpar-galeria' }], isError: true })
    expect(limpar).not.toHaveBeenCalled()
  })
})

describe('perfil só-rascunho', () => {
  it('nenhuma das três está na allowlist (tool nova nasce proibida)', () => {
    expect(TOOLS_DRAFT_ONLY.has('limpar-galeria')).toBe(false)
    expect(TOOLS_DRAFT_ONLY.has('apagar-arte')).toBe(false)
    expect(TOOLS_DRAFT_ONLY.has('listar-artes')).toBe(false)
    expect(registrarNoStdio('apagar-arte', 'catalogo', true)).toBe(false)
    expect(registrarNoStdio('apagar-arte', 'catalogo', false)).toBe(true)
  })

  it.each(['remoto', 'local'] as const)('apagar-arte não existe para o cliente draft-only (%s)', async (superficie) => {
    vi.stubEnv('MCP_DRAFT_ONLY_CLIENT_IDS', 'cliente-restrito')
    const principal = { kind: 'user' as const, userId: 'clerk-teste', clientId: 'cliente-restrito' }
    expect(perfilDoPrincipal(principal)).toBe('draft-only')
    const g = gates()
    const r = await executarTool(indice, superficie, 'apagar-arte', { projectId: 7, generationId: 'gen1' }, principal, { gates: g })
    expect(r).toEqual({ content: [{ type: 'text', text: 'Ferramenta desconhecida: apagar-arte' }], isError: true })
    expect(g.projeto).not.toHaveBeenCalled()
    expect(apagar).not.toHaveBeenCalled()
  })
})

describe('listar-artes na porta', () => {
  it('passa os filtros e a paginação ao serviço, depois do gate', async () => {
    const g = gates()
    const r = await executarTool(
      indice,
      'remoto',
      'listar-artes',
      { projectId: 7, de: '2026-11-01', ate: '2026-11-17', nome: 'teste', uso: 'nunca-usada', limite: 10, pagina: 2 },
      SERVICO,
      { gates: g },
    )
    expect(r.isError).not.toBe(true)
    expect(g.projeto).toHaveBeenCalledWith(7, SERVICO)
    expect(listar).toHaveBeenCalledWith({
      projectId: 7,
      de: '2026-11-01',
      ate: '2026-11-17',
      nome: 'teste',
      uso: 'nunca-usada',
      limite: 10,
      pagina: 2,
      appUrl: 'https://studio.test',
    })
  })

  it('sem projectId, ou com paginação torta, é recusada antes do serviço', async () => {
    for (const ruim of [{}, { projectId: 7, limite: 0 }, { projectId: 7, pagina: 1.5 }, { projectId: 7, apagar: true }, { projectId: 7, uso: 'todas' }]) {
      const r = await executarTool(indice, 'remoto', 'listar-artes', ruim, SERVICO, { gates: gates() })
      expect(r.isError).toBe(true)
    }
    expect(listar).not.toHaveBeenCalled()
  })
})
