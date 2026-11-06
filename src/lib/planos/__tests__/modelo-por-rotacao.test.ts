/**
 * S2 (06/11/2026) — a rotação da bancada escolhe o modelo pelo TAMANHO da página, fora das pastas arquivadas,
 * na ordem do menos usado: a mesma lista que a bancada mostra.
 */
import { describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/db', () => ({
  db: {
    page: {
      findMany: vi.fn(async () => [
        // Já na ordem MENOS_USADO_PRIMEIRO: o feed da pasta story vem antes do story.
        { id: 'p-feed', name: 'Feed', width: 1080, height: 1350 },
        { id: 'p-story', name: 'Story', width: 1080, height: 1920 },
      ]),
    },
  },
}))
vi.mock('@prisma/client', async () => await import('../../../../prisma/generated/client'))
vi.mock('@/lib/creatives/arte-rapida', () => ({ createArteRapida: vi.fn() }))
vi.mock('@/lib/ai/creative-generation-service', () => ({ startArtGeneration: vi.fn() }))
vi.mock('@/lib/ai/generation-queue', () => ({ enfileirarArte: vi.fn() }))

import { db } from '@/lib/db'
import { modeloPorRotacao } from '../executar-plano'
import { CATEGORIA_ARQUIVADA } from '@/lib/templates/classificar'

describe('S2 — modeloPorRotacao pelo tamanho', () => {
  it('story pula a página de feed, mesmo menos usada', async () => {
    expect(await modeloPorRotacao(7, 'story')).toEqual({ id: 'p-story', name: 'Story' })
  })
  it('feed acha a página de feed (que mora em pasta story)', async () => {
    expect(await modeloPorRotacao(7, 'feed')).toEqual({ id: 'p-feed', name: 'Feed' })
  })
  it('sem formato é story; formato sem modelo é null', async () => {
    expect((await modeloPorRotacao(7, null))?.id).toBe('p-story')
    expect(await modeloPorRotacao(7, 'quadrado')).toBeNull()
  })
  it('a consulta não filtra pelo tipo da pasta e deixa as arquivadas de fora', async () => {
    const where = (db.page.findMany as any).mock.calls.at(-1)[0].where
    expect(where.Template.type).toBeUndefined()
    expect(where.Template.OR).toEqual([{ category: null }, { category: { not: CATEGORIA_ARQUIVADA } }])
  })
})
