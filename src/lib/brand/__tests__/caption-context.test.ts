// Cenários sintéticos; não representam cliente, pessoa ou aprovação real.
import { beforeEach, describe, expect, it, vi } from 'vitest'
const m = vi.hoisted(() => ({
  fetch: vi.fn(),
  access: vi.fn(),
  brand: vi.fn(),
  knowledge: vi.fn(),
}))
vi.mock('@/lib/projects/access', () => ({
  fetchProjectWithShares: m.fetch,
  hasProjectReadAccess: m.access,
}))
vi.mock('../brand-context', () => ({ loadBrandContext: m.brand }))
vi.mock('@/lib/knowledge/search', () => ({
  getProjectPromptKnowledgeContext: m.knowledge,
}))
import { loadCaptionContext } from '../caption-context'
import { precedenciaDaVoz } from '../voz'
const v = {
  versao: 'voz-v1',
  descricao: 'Voz nova explícita.',
  tratamento: 'você',
  termos: [],
  exemplos: [],
  proibicoes: [],
  antesDepois: [],
  regras: [],
}
beforeEach(() => {
  vi.clearAllMocks()
  m.fetch.mockResolvedValue({ id: 6 })
  m.access.mockReturnValue(true)
  m.knowledge.mockResolvedValue({ context: 'Fatos cadastrados', hits: [] })
})
describe('contexto de caption isolado e com precedência de Marca', () => {
  it.each([null, { id: 6 }])(
    'não lê identidade/Base sem acesso',
    async (project) => {
      m.fetch.mockResolvedValue(project)
      m.access.mockReturnValue(false)
      expect(
        await loadCaptionContext(6, { userId: 'outro', orgId: null }, 'x')
      ).toBeNull()
      expect(m.brand).not.toHaveBeenCalled()
      expect(m.knowledge).not.toHaveBeenCalled()
    }
  )
  it.each([true, false])(
    'usa a mesma precedência para ativada/prévia',
    async (migrated) => {
      m.brand.mockResolvedValue({
        projectName: 'Estação Aurora',
        voz: precedenciaDaVoz({
          registro: {
            voz: v,
            versao: 1,
            migradaEm: migrated ? '2026-10-04' : null,
          },
          dna: { toneOfVoice: 'Tom legado', contentRules: 'Regras antigas' },
        }),
      })
      const c = await loadCaptionContext(
        6,
        { userId: 'dono', orgId: 'org' },
        'almoço'
      )
      expect(c?.identity).toContain(
        migrated ? 'Voz nova explícita' : 'Tom legado'
      )
      expect(c?.identity).not.toContain(
        migrated ? 'Tom legado' : 'Voz nova explícita'
      )
      expect(m.knowledge).toHaveBeenCalledWith(
        'almoço',
        { projectId: 6 },
        expect.anything()
      )
      expect(m.brand).toHaveBeenCalledWith(6)
    }
  )
  it('falha de contexto propaga antes da cobrança/provider', async () => {
    m.brand.mockRejectedValueOnce(new Error('DB'))
    await expect(
      loadCaptionContext(6, { userId: 'dono', orgId: null }, 'x')
    ).rejects.toThrow('DB')
    expect(m.knowledge).not.toHaveBeenCalled()
  })
})
