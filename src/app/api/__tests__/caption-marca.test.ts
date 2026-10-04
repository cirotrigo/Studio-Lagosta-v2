// Cenários sintéticos; não representam cliente, pessoa ou aprovação real.
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'
const m = vi.hoisted(() => ({
  auth: vi.fn(),
  fetch: vi.fn(),
  access: vi.fn(),
  brand: vi.fn(),
  knowledge: vi.fn(),
  generate: vi.fn(),
  validate: vi.fn(),
  deduct: vi.fn(),
  refund: vi.fn(),
}))
vi.mock('@clerk/nextjs/server', () => ({ auth: m.auth }))
vi.mock('@/lib/projects/access', () => ({
  fetchProjectWithShares: m.fetch,
  hasProjectReadAccess: m.access,
}))
vi.mock('@/lib/brand/brand-context', () => ({ loadBrandContext: m.brand }))
vi.mock('@/lib/knowledge/search', () => ({
  getProjectPromptKnowledgeContext: m.knowledge,
}))
vi.mock('ai', () => ({ generateText: m.generate }))
vi.mock('@ai-sdk/openai', () => ({ openai: vi.fn(() => ({})) }))
vi.mock('@/lib/credits/deduct', () => ({
  validateCreditsForFeature: m.validate,
  deductCreditsForFeature: m.deduct,
  refundCreditsForFeature: m.refund,
}))
vi.mock('@/lib/credits/errors', () => ({
  InsufficientCreditsError: class extends Error {
    required = 1
    available = 0
  },
}))
import { InsufficientCreditsError } from '@/lib/credits/errors'
import { POST as generate } from '../tools/generate-caption/route'
import { POST as improve } from '../ai/improve-caption/route'
const request = (body: object) =>
  new NextRequest('http://localhost/api/caption', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  })
const body = {
  projectId: 6,
  prompt: 'Convite almoço',
  caption: 'Legenda existente',
  postType: 'POST' as const,
}
beforeEach(() => {
  vi.clearAllMocks()
  m.auth.mockResolvedValue({ userId: 'dono', orgId: 'org' })
  m.fetch.mockResolvedValue({ id: 6 })
  m.access.mockReturnValue(true)
  m.brand.mockResolvedValue({
    projectName: 'Estação Aurora',
    voz: {
      texto: 'MARCA: lista fechada; sem emoji; interação no Direct.',
      regrasDaMarca: null,
    },
  })
  m.knowledge.mockResolvedValue({
    context: 'ALMOÇO SOMENTE NA BASE',
    hits: [{ entryId: 'base6' }],
  })
  m.generate.mockResolvedValue({ text: 'Explore o planeta!' })
  m.validate.mockResolvedValue(undefined)
  m.deduct.mockResolvedValue(undefined)
  m.refund.mockResolvedValue(undefined)
  vi.spyOn(console, 'log').mockImplementation(() => {})
  vi.spyOn(console, 'error').mockImplementation(() => {})
})
describe('caption: autorização/contexto antes de provider e cobrança', () => {
  it.each([generate, improve])(
    'sem autenticação não consulta nada nem cobra',
    async (post) => {
      m.auth.mockResolvedValue({ userId: null, orgId: null })
      expect((await post(request(body))).status).toBe(401)
      expect(m.fetch).not.toHaveBeenCalled()
      expect(m.brand).not.toHaveBeenCalled()
      expect(m.generate).not.toHaveBeenCalled()
      expect(m.deduct).not.toHaveBeenCalled()
    }
  )
  it.each([generate, improve])(
    'sem acesso ao tenant não lê Marca/Base nem cobra',
    async (post) => {
      m.access.mockReturnValue(false)
      expect((await post(request(body))).status).toBe(404)
      expect(m.brand).not.toHaveBeenCalled()
      expect(m.knowledge).not.toHaveBeenCalled()
      expect(m.generate).not.toHaveBeenCalled()
      expect(m.validate).not.toHaveBeenCalled()
      expect(m.deduct).not.toHaveBeenCalled()
    }
  )
  it.each([generate, improve])(
    'injeta voz resolvida e Base; mantém contrato',
    async (post) => {
      const response = await post(request(body))
      expect(response.status).toBe(200)
      const output = await response.json()
      expect(post === generate ? output.caption : output.improvedCaption).toBe(
        'Explore o planeta!'
      )
      const input = m.generate.mock.calls[0][0]
      expect(input.system).toContain('MARCA: lista fechada')
      expect(input.system).toContain('ALMOÇO SOMENTE NA BASE')
      expect(input.system).not.toContain('Marca quem precisa ver')
      expect(m.brand).toHaveBeenCalledWith(6)
      expect(m.knowledge.mock.calls[0][1]).toEqual({ projectId: 6 })
      if (post === improve) {
        expect(m.deduct).toHaveBeenCalledWith(
          expect.objectContaining({ projectId: 6, organizationId: 'org' })
        )
        expect(m.brand.mock.invocationCallOrder[0]).toBeLessThan(
          m.deduct.mock.invocationCallOrder[0]
        )
        expect(m.refund).not.toHaveBeenCalled()
      } else {
        expect(output.knowledgeUsed).toBe(true)
        expect(m.deduct).not.toHaveBeenCalled()
      }
    }
  )
  it('falha de contexto em improve não debita nem chama provider', async () => {
    m.brand.mockRejectedValueOnce(new Error('DB indisponível'))
    expect((await improve(request(body))).status).toBe(500)
    expect(m.deduct).not.toHaveBeenCalled()
    expect(m.refund).not.toHaveBeenCalled()
    expect(m.generate).not.toHaveBeenCalled()
  })
  it('créditos insuficientes não debitam nem geram', async () => {
    m.validate.mockRejectedValueOnce(
      new InsufficientCreditsError(1, 0, 'Créditos insuficientes')
    )
    expect((await improve(request(body))).status).toBe(402)
    expect(m.deduct).not.toHaveBeenCalled()
    expect(m.generate).not.toHaveBeenCalled()
  })
  it('erro de provider após débito mantém refund organizacional', async () => {
    m.generate.mockRejectedValueOnce(new Error('provider'))
    expect((await improve(request(body))).status).toBe(502)
    expect(m.deduct).toHaveBeenCalledTimes(1)
    expect(m.refund).toHaveBeenCalledTimes(1)
    expect(m.refund).toHaveBeenCalledWith(
      expect.objectContaining({
        clerkUserId: 'dono',
        organizationId: 'org',
        quantity: 1,
        feature: 'ai_text_chat',
      })
    )
  })
  it('JSON inválido não consulta nem cobra', async () => {
    expect(
      (await improve(request({ projectId: -1, caption: 'x' }))).status
    ).toBe(400)
    expect(m.fetch).not.toHaveBeenCalled()
    expect(m.deduct).not.toHaveBeenCalled()
  })
})
