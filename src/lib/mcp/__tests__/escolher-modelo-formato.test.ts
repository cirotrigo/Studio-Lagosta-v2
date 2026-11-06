/**
 * S2 (06/11/2026) — `escolher-modelo` acha o modelo pelo TAMANHO da página, em todas as pastas não arquivadas:
 * página de feed guardada em pasta story não passa por story, e com `formato: 'feed'` ela é encontrada.
 */
import { describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/db', () => ({
  db: {
    project: { findUnique: vi.fn(async () => ({ id: 1, name: 'Bacana', status: 'ACTIVE', instagramUsername: null, googleDriveImagesFolderId: null, googleDriveFolderId: null })) },
    template: {
      findMany: vi.fn(async () => [
        {
          id: 10,
          name: 'Assinatura',
          type: 'STORY',
          tags: [],
          Page: [
            { id: 'p-story', name: 'Story', templateId: 10, tags: ['happy-hour'], width: 1080, height: 1920 },
            { id: 'p-feed', name: 'Feed', templateId: 10, tags: ['happy-hour', 'story'], width: 1080, height: 1350 },
          ],
        },
      ]),
    },
    page: {
      findMany: vi.fn(async () => []),
      findUnique: vi.fn(async ({ where }: any) => ({ id: where.id, templateId: 10, name: where.id, tags: [], layers: [], width: 1080, height: 1920, background: null })),
    },
    knowledgeBaseEntry: { findMany: vi.fn(async () => []) },
  },
}))
vi.mock('@prisma/client', () => ({ KnowledgeCategory: {}, Prisma: {} }))
vi.mock('@/lib/aprendizado/sinal-de-modelo', () => ({ registrarSugestaoDeModelo: vi.fn(async () => null), fecharSugestaoDeModelo: vi.fn() }))

import { db } from '@/lib/db'
import { prepareCreative } from '@/lib/creatives/arte-rapida'
import { CATEGORIA_ARQUIVADA } from '@/lib/templates/classificar'

const base = { projectId: 1, projetosVisiveis: 'todos' as const, theme: 'happy-hour' }

describe('S2 — escolher-modelo pelo formato da página', () => {
  it('sem formato é story: a página de feed da pasta story (mesmo com tag story) fica de fora', async () => {
    const r = await prepareCreative(base)
    expect(r.page.id).toBe('p-story')
    expect(r.alternatives.map((a) => a.id)).toEqual([])
  })

  it('com formato feed, acha a página de feed guardada em pasta story', async () => {
    const r = await prepareCreative({ ...base, formato: 'feed' })
    expect(r.page.id).toBe('p-feed')
  })

  it('lê todas as pastas do projeto menos as arquivadas (category nula continua dentro)', async () => {
    await prepareCreative(base)
    const where = (db.template.findMany as any).mock.calls.at(-1)[0].where
    expect(where.type).toBeUndefined()
    expect(where.projectId).toBe(1)
    expect(where.OR).toEqual([{ category: null }, { category: { not: CATEGORIA_ARQUIVADA } }])
  })

  it('formato sem modelo é NO_TEMPLATE_PAGES', async () => {
    await expect(prepareCreative({ ...base, formato: 'quadrado' })).rejects.toMatchObject({ code: 'NO_TEMPLATE_PAGES' })
  })
})
