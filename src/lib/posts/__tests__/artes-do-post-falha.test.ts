/**
 * R12-02 (revisão final do PR 12): `registrarArtesDoPost` nunca lança — agendar
 * vale mais que catalogar —, então quem precisa saber se o catálogo terminou (o
 * lote, que só carimba os efeitos quando tudo rodou) lê `falhou`.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

const banco = vi.hoisted(() => ({ cair: false }))

vi.mock('@/lib/db', () => ({
  db: {
    socialPost: {
      findUnique: async () => {
        if (banco.cair) throw new Error('a conexão com o banco caiu ao ler o post')
        return { id: 'post-1', projectId: 6, postType: 'STORY', mediaUrls: [], generationId: null, templateId: null, pageId: null }
      },
    },
  },
}))
vi.mock('@/lib/creatives/persist', () => ({ ensureArteTemplate: vi.fn() }))
vi.mock('@/lib/creatives/arte-enviada', () => ({ ARTE_ENVIADA_TEMPLATE_NAMES: {} }))

import { registrarArtesDoPost } from '../artes-do-post'

beforeEach(() => {
  banco.cair = false
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

describe('R12-02 — o catálogo que o banco derrubou', () => {
  it('não lança e devolve falhou', async () => {
    banco.cair = true
    await expect(registrarArtesDoPost('post-1')).resolves.toMatchObject({ registradas: 0, falhou: true })
  })

  it('controle: post sem mídia não tem o que catalogar, e isso não é falha', async () => {
    const r = await registrarArtesDoPost('post-1')
    expect(r).toEqual({ registradas: 0, colunaVinculada: false, artes: [] })
  })
})
