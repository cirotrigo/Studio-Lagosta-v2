import { afterEach, describe, expect, it, vi } from 'vitest'
import { NextRequest, NextResponse, type NextFetchEvent } from 'next/server'
import { unstable_doesMiddlewareMatch } from 'next/experimental/testing/server'

const mocks = vi.hoisted(() => ({ authenticated: vi.fn() }))
vi.mock('@clerk/nextjs/server', () => ({
  clerkMiddleware: () => mocks.authenticated,
  createRouteMatcher: () => () => false,
}))
import middleware, { config } from '@/middleware'

afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); vi.clearAllMocks(); vi.resetModules() })

describe('otimizador Preview não alcança origem externa', () => {
  for (const origin of ['https://fixture.public.blob.vercel-storage.com/a.png', 'https://drive.google.com/a.png', 'https://media.zernio.com/a.png']) {
    it(`recusa ${new URL(origin).hostname} antes de auth/otimizador/fetch`, async () => {
      vi.stubEnv('VERCEL_ENV', 'preview')
      const externalFetch = vi.fn(); vi.stubGlobal('fetch', externalFetch)
      const url = `https://fixture.invalid/_next/image?url=${encodeURIComponent(origin)}&w=640&q=75`
      expect(unstable_doesMiddlewareMatch({ config, url })).toBe(true)
      const response = await middleware(new NextRequest(url), {} as NextFetchEvent)
      if (!(response instanceof Response)) throw new Error('Esperada resposta de bloqueio antes do otimizador.')
      expect(response.status).toBe(403)
      expect(mocks.authenticated).not.toHaveBeenCalled()
      expect(externalFetch).not.toHaveBeenCalled()
    })
  }
  it('config Preview desativa otimização, esvazia origens, mantém assets locais', async () => {
    vi.stubEnv('VERCEL_ENV', 'preview')
    const { default: nextConfig } = await import('../../../next.config')
    expect(nextConfig.images?.unoptimized).toBe(true)
    expect(nextConfig.images?.remotePatterns).toEqual([])
    expect(unstable_doesMiddlewareMatch({ config, url: 'https://fixture.invalid/_next/static/chunk.js' })).toBe(false)
    expect(unstable_doesMiddlewareMatch({ config, url: 'https://fixture.invalid/logo.png' })).toBe(false)
  })
  it('produção mantém otimização e fluxo existente', async () => {
    vi.stubEnv('VERCEL_ENV', 'production')
    const { default: nextConfig } = await import('../../../next.config')
    expect(nextConfig.images?.unoptimized).toBe(false)
    expect(nextConfig.images?.remotePatterns?.length).toBeGreaterThan(0)
    mocks.authenticated.mockReturnValue(NextResponse.next())
    await middleware(new NextRequest('https://fixture.invalid/_next/image?url=%2Flogo.png&w=640&q=75'), {} as NextFetchEvent)
    expect(mocks.authenticated).not.toHaveBeenCalled()
  })
})
