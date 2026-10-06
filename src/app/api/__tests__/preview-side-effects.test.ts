import { afterEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  query: vi.fn(), mutate: vi.fn(), archive: vi.fn(), expire: vi.fn(), embed: vi.fn(), embedMany: vi.fn(),
  auth: vi.fn(), billingQuery: vi.fn(),
}))
vi.mock('@/lib/db', () => ({ db: { knowledgeBaseEntry: { findMany: mocks.query, update: mocks.mutate }, subscriptionEvent: { findFirst: mocks.billingQuery } } }))
vi.mock('@clerk/nextjs/server', () => ({ auth: mocks.auth }))
vi.mock('@/lib/knowledge/archive', () => ({ arquivarEntradaBase: mocks.archive }))
vi.mock('@/lib/aprendizado/captura', () => ({ expirarSugestoesPendentes: mocks.expire }))
vi.mock('ai', () => ({ embed: mocks.embed, embedMany: mocks.embedMany }))
vi.mock('@ai-sdk/openai', () => ({ openai: { embedding: () => ({}) } }))

import { GET as archiveJob } from '../cron/archive-expired-knowledge/route'
import { GET as backupJob } from '../cron/backup-database/route'
import { GET as subscriptionStatus } from '../subscription/status/route'
import { generateEmbedding, generateEmbeddings } from '@/lib/knowledge/embeddings'
import { NextRequest } from 'next/server'

afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); vi.clearAllMocks() })

describe('Preview sem credenciais não executa jobs nem embeddings', () => {
  it('status sintético autenticado não consulta billing nem banco', async () => {
    vi.stubEnv('VERCEL_ENV', 'preview'); vi.stubEnv('CLERK_BILLING_API_KEY', 'synthetic-not-a-key')
    mocks.auth.mockResolvedValue({ userId: 'synthetic-user' })
    const externalFetch = vi.fn(); vi.stubGlobal('fetch', externalFetch)
    const response = await subscriptionStatus()
    expect(await response.json()).toEqual({ isActive: true, plan: null, syntheticPreview: true })
    expect(externalFetch).not.toHaveBeenCalled(); expect(mocks.billingQuery).not.toHaveBeenCalled()
  })
  it('status sintético mantém exigência de autenticação', async () => {
    vi.stubEnv('VERCEL_ENV', 'preview'); mocks.auth.mockResolvedValue({ userId: null })
    expect((await subscriptionStatus()).status).toBe(401)
    expect(mocks.billingQuery).not.toHaveBeenCalled()
  })
  it('arquivo de expiradas não consulta nem muta mesmo sem CRON_SECRET', async () => {
    vi.stubEnv('VERCEL_ENV', 'preview'); vi.stubEnv('CRON_SECRET', '')
    expect((await archiveJob(new Request('https://fixture.invalid/api/cron/archive-expired-knowledge'))).status).toBe(403)
    expect(mocks.query).not.toHaveBeenCalled(); expect(mocks.mutate).not.toHaveBeenCalled()
    expect(mocks.archive).not.toHaveBeenCalled(); expect(mocks.expire).not.toHaveBeenCalled()
  })
  it('backup não consulta banco sem CRON_SECRET', async () => {
    vi.stubEnv('VERCEL_ENV', 'preview'); vi.stubEnv('CRON_SECRET', '')
    expect((await backupJob(new NextRequest('https://fixture.invalid/api/cron/backup-database'))).status).toBe(403)
    expect(mocks.query).not.toHaveBeenCalled()
  })
  it('não chama OpenAI mesmo se houver key herdada e Vector estiver ausente', async () => {
    vi.stubEnv('VERCEL_ENV', 'preview'); vi.stubEnv('OPENAI_API_KEY', 'synthetic-not-a-key')
    vi.stubEnv('UPSTASH_VECTOR_REST_URL', ''); vi.stubEnv('UPSTASH_VECTOR_REST_TOKEN', '')
    await expect(generateEmbedding('fixture')).rejects.toThrow('efeitos externos desativados')
    await expect(generateEmbeddings(['fixture'])).rejects.toThrow('efeitos externos desativados')
    expect(mocks.embed).not.toHaveBeenCalled(); expect(mocks.embedMany).not.toHaveBeenCalled()
  })
})
