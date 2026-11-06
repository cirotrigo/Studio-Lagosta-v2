import { beforeEach, describe, expect, it, vi } from 'vitest'

const db = vi.hoisted(() => ({
  page: { findUnique: vi.fn(), findMany: vi.fn(), update: vi.fn() },
  template: { findFirst: vi.fn() },
  generation: { findFirst: vi.fn() },
}))
vi.mock('@/lib/db', () => ({ db }))

import { moverPaginaParaSemana } from '../pastas'

const pagina = (tags: string[]) => ({
  id: 'p1', isTemplate: false, tags, width: 1080, height: 1920,
  Template: { id: 1, name: 'Stories · Avulsas · Novembro', category: 'avulsas', projectId: 7 },
})

describe('S4 — moverPaginaParaSemana leva a cópia do "Usar" para a semana', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    db.template.findFirst.mockResolvedValue({ id: 2, name: 'Semana 09/11 · Stories' })
    db.page.findMany.mockResolvedValue([])
    db.generation.findFirst.mockResolvedValue(null)
  })

  it('página de-modelo nas Avulsas move', async () => {
    db.page.findUnique.mockResolvedValue(pagina(['story', 'de-modelo']))
    const r = await moverPaginaParaSemana('p1', '2026-11-10T15:00:00Z', 'u')
    expect(r.moveu).toBe(true)
    expect(db.page.update).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'p1' }, data: expect.objectContaining({ templateId: 2 }) }))
  })

  it('página comum (sem compositor nem de-modelo) fica', async () => {
    db.page.findUnique.mockResolvedValue(pagina(['story']))
    expect((await moverPaginaParaSemana('p1', '2026-11-10T15:00:00Z', 'u')).moveu).toBe(false)
    expect(db.page.update).not.toHaveBeenCalled()
  })
})
