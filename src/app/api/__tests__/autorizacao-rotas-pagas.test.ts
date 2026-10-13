/**
 * Rotas que pagam serviço externo (ou registram uso num projeto) exigem acesso
 * de ESCRITA ao projeto ANTES do provedor e do registro de uso. Sem créditos
 * aplicados nada mais as limita. Projeto alheio e inexistente: o mesmo 404.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const m = vi.hoisted(() => ({
  projeto: null as { id: number } | null,
  temAcesso: false,
  template: null as { projectId: number } | null,
  usos: [] as unknown[],
  removeBackground: vi.fn(),
  generateText: vi.fn(),
}))

vi.mock('@clerk/nextjs/server', () => ({ auth: async () => ({ userId: 'user_1', orgId: null }) }))
vi.mock('@/lib/auth-utils', () => ({ getUserFromClerkId: async (clerkId: string) => ({ id: 'u1', clerkId }) }))
vi.mock('@/lib/credits/settings', () => ({ getFeatureCost: async () => 1, getPlanCredits: async () => 100 }))
vi.mock('@/lib/db', () => {
  const tx = {
    creditBalance: {
      findUnique: async () => ({ id: 'cb1', creditsRemaining: 100 }),
      updateMany: async () => ({ count: 1 }),
      update: async () => ({ creditsRemaining: 100 }),
    },
    usageHistory: { create: async ({ data }: any) => void m.usos.push(data) },
  }
  return {
    db: {
      ...tx,
      $transaction: async (fn: (t: unknown) => Promise<unknown>) => fn(tx),
      template: { findUnique: async () => m.template },
    },
  }
})
vi.mock('@/lib/projects/access', () => ({
  fetchProjectWithShares: async () => m.projeto,
  hasProjectWriteAccess: (p: unknown) => !!p && m.temAcesso,
}))
vi.mock('@/lib/photoroom/client', () => ({
  getPhotoroomClient: () => ({ removeBackground: m.removeBackground }),
  PhotoroomAPIError: class extends Error {},
}))
vi.mock('@vercel/blob', () => ({ put: async () => ({ url: 'https://x.public.blob.vercel-storage.com/r.png' }) }))
vi.mock('ai', () => ({ generateText: m.generateText }))
vi.mock('@ai-sdk/openai', () => ({ openai: () => 'modelo' }))

import { POST as removerFundo } from '../ai/remove-background/route'
import { POST as melhorarLegenda } from '../ai/improve-caption/route'
import { POST as exportarTemplate } from '../templates/export/route'

const req = (body: unknown) => new Request('http://localhost/x', { method: 'POST', body: JSON.stringify(body) })
const rotas = [
  ['remove-background', () => removerFundo(req({ imageUrl: 'https://x.com/a.png', projectId: 8 })), () => m.removeBackground],
  ['improve-caption', () => melhorarLegenda(req({ caption: 'oi', projectId: 8 })), () => m.generateText],
  ['templates/export', () => exportarTemplate(req({ templateId: 5, format: 'png' })), () => null],
] as const

beforeEach(() => {
  m.projeto = { id: 8 }
  m.temAcesso = false
  m.template = { projectId: 8 }
  m.usos = []
  m.removeBackground.mockReset().mockResolvedValue(new Blob(['x']))
  m.generateText.mockReset().mockResolvedValue({ text: 'legenda' })
  vi.spyOn(console, 'log').mockImplementation(() => undefined)
  vi.spyOn(console, 'error').mockImplementation(() => undefined)
})
afterEach(() => {
  vi.unstubAllEnvs()
})

describe.each([
  ['desligada', ''],
  ['ligada', 'true'],
])('flag %s', (_n, flag) => {
  beforeEach(() => {
    vi.stubEnv('CREDITOS_APLICADOS', flag)
  })

  it.each(rotas)('%s sem acesso: 404, sem provedor e sem registro de uso', async (_rota, chamar, provedor) => {
    const r = await chamar()
    expect(r.status).toBe(404)
    const p = provedor()
    if (p) expect(p).not.toHaveBeenCalled()
    expect(m.usos).toHaveLength(0)
  })

  it.each(rotas)('%s com projeto inexistente: o mesmo 404', async (_rota, chamar) => {
    m.projeto = null
    m.template = null
    const r = await chamar()
    expect(r.status).toBe(404)
    expect(await r.json()).toEqual({ error: 'Projeto não encontrado' })
    expect(m.usos).toHaveLength(0)
  })

  it.each(rotas)('%s com acesso: segue (200) e registra o uso', async (_rota, chamar) => {
    m.temAcesso = true
    const r = await chamar()
    expect(r.status).toBe(200)
    expect(m.usos).toHaveLength(1)
  })
})

it('sem acesso, a resposta é a mesma do projeto inexistente', async () => {
  const semAcesso = await (await removerFundo(req({ imageUrl: 'https://x.com/a.png', projectId: 8 }))).json()
  m.projeto = null
  const inexistente = await (await removerFundo(req({ imageUrl: 'https://x.com/a.png', projectId: 8 }))).json()
  expect(semAcesso).toEqual(inexistente)
})

it('templates/export sem templateId: segue sem projeto (nada atribuído a projeto alheio)', async () => {
  const r = await exportarTemplate(req({ format: 'png' }))
  expect(r.status).toBe(200)
  expect(m.usos).toHaveLength(1)
})
