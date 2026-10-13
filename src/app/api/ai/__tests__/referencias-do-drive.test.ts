/**
 * Rotas de IA que leem a foto do Drive por URL de referência: a foto precisa
 * estar sob as pastas do projeto da requisição, antes de ler qualquer byte.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { drive, zerarArvore } from '@/lib/google-drive/__tests__/arvore-falsa'

const m = vi.hoisted(() => ({ userId: 'userA', cobrado: 0 }))

vi.mock('@clerk/nextjs/server', () => ({ auth: async () => ({ userId: m.userId, orgId: null }), currentUser: async () => null }))
vi.mock('@/server/google-drive-service', async () => ({
  googleDriveService: (await import('@/lib/google-drive/__tests__/arvore-falsa')).drive,
}))
vi.mock('@/lib/db', async () => {
  const { dbFalso } = await import('@/lib/google-drive/__tests__/arvore-falsa')
  return { db: { ...dbFalso, brandColor: { findMany: async () => [] } } }
})
vi.mock('@/lib/admin-utils', () => ({ isAdmin: async () => true }))
vi.mock('@/lib/projects/access', async () => {
  const f = await import('@/lib/google-drive/__tests__/arvore-falsa')
  const ve = (id: number, userId: string) => (f.VISIVEIS[userId] ?? []).includes(id)
  return {
    fetchProjectWithShares: async (id: number) => (f.PROJETOS[id] ? { id } : null),
    hasProjectReadAccess: (p: { id: number }, { userId }: { userId: string }) => ve(p.id, userId),
    fetchProjectWithAccess: async (id: number, { userId }: { userId: string }) =>
      f.PROJETOS[id] && ve(id, userId) ? { id, name: f.PROJETOS[id].name } : null,
  }
})
vi.mock('@/lib/credits/deduct', () => ({
  validateCreditsForFeature: async () => undefined,
  deductCreditsForFeature: async () => {
    m.cobrado++
  },
  refundCreditsForFeature: async () => undefined,
}))
vi.mock('ai', () => ({
  generateText: async () => ({ text: '{"pt":"a","en":"b"}' }),
  generateObject: async () => {
    throw new Error('sem modelo no teste')
  },
}))
vi.mock('@ai-sdk/google', () => ({ google: () => 'modelo' }))
vi.mock('@ai-sdk/openai', () => ({ openai: () => 'modelo' }))
vi.mock('@/lib/ai/gemini-image-client', () => ({
  generateImageWithGemini: async () => {
    throw new Error('parou depois das referências')
  },
  isGeminiRetryableError: () => false,
}))
vi.mock('@/lib/knowledge/search', () => ({
  getProjectPromptKnowledgeContext: async () => ({ context: '', warnings: [], conflicts: [], hits: [], categoriesUsed: [] }),
  searchKnowledgeBase: async () => [],
}))
vi.mock('@/lib/brand/brand-context', () => ({ loadBrandContext: async () => null }))
vi.mock('@vercel/blob', () => ({ put: async () => ({ url: 'https://loja.public.blob.vercel-storage.com/x' }) }))

import { POST as melhorarPrompt } from '../improve-prompt/route'
import { POST as gerarImagem } from '../generate-image/route'
import { generateAiTextPayload } from '../../tools/generate-ai-text/route'

const URL_DO_DRIVE = (id: string) => `https://studio.example/api/google-drive/image/${id}`
const lidos = () => drive.getFileStream.mock.calls.map((c) => c[0])

beforeEach(() => {
  zerarArvore()
  m.userId = 'userA'
  m.cobrado = 0
  vi.stubEnv('OPENAI_API_KEY', 'k')
  vi.stubEnv('GOOGLE_GENERATIVE_AI_API_KEY', 'k')
  for (const nivel of ['log', 'warn', 'error'] as const) vi.spyOn(console, nivel).mockImplementation(() => undefined)
})

describe('POST /api/ai/improve-prompt', () => {
  const pedir = (projectId: number, ids: string[]) =>
    melhorarPrompt(
      new Request('http://t/x', {
        method: 'POST',
        body: JSON.stringify({ prompt: 'p', projectId, referenceImages: ids.map(URL_DO_DRIVE) }),
      }),
    )

  it('lê só a foto do projeto; a de outro projeto é ignorada sem ler bytes', async () => {
    expect((await pedir(1, ['fileA', 'fileB'])).status).toBe(200)
    expect(lidos()).toEqual(['fileA'])
  })
  it('projeto sem acesso: 404 antes de cobrar ou ler', async () => {
    expect((await pedir(2, ['fileB'])).status).toBe(404)
    expect(m.cobrado).toBe(0)
    expect(lidos()).toEqual([])
  })
})

describe('POST /api/ai/generate-image', () => {
  const gerar = (ids: string[]) =>
    gerarImagem(
      new Request('http://t/x', {
        method: 'POST',
        body: JSON.stringify({
          prompt: 'cena',
          projectId: 1,
          model: 'nano-banana-2',
          aspectRatio: '9:16',
          referenceImages: ids.map(URL_DO_DRIVE),
        }),
      }),
    )

  it('referência do projeto é lida', async () => {
    await gerar(['fileA'])
    expect(lidos()).toEqual(['fileA'])
  })
  it('referência de outro projeto: recusa sem ler bytes', async () => {
    const r = await gerar(['fileA', 'fileB'])
    expect(r.status).toBeGreaterThanOrEqual(400)
    expect(lidos()).not.toContain('fileB')
    expect(JSON.stringify(await r.json())).not.toMatch(/rootB|segredo|File not found/)
  })
})

describe('generateAiTextPayload (análise da imagem)', () => {
  const analisar = (id: string) =>
    generateAiTextPayload(
      {
        projectId: 1,
        prompt: 'p',
        format: 'STORY',
        variations: 1,
        dryRun: true,
        useKnowledgeBase: false,
        includeLogo: false,
        usePhoto: false,
        compositionEnabled: false,
        analyzeImageForContext: true,
        analysisImageUrl: URL_DO_DRIVE(id),
      } as never,
      { userId: 'userA', orgId: null },
    )

  it('foto do projeto é lida; a de outro projeto não', async () => {
    await analisar('fileA')
    expect(lidos()).toEqual(['fileA'])
    drive.getFileStream.mockClear()
    await analisar('fileB')
    expect(lidos()).toEqual([])
  })
})
