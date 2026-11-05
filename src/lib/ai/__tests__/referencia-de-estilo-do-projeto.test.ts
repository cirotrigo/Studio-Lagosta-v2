import { beforeEach, describe, expect, it, vi } from 'vitest'

/** A arte marcada como referência tem de ser do projeto informado. */
const m = vi.hoisted(() => ({ arte: { id: 'g1', projectId: 6, status: 'COMPLETED', resultUrl: 'https://blob.test/a.png' }, gravado: null as unknown }))

vi.mock('@/lib/db', () => ({
  db: {
    generation: {
      findFirst: async ({ where }: { where: { id: string; projectId?: number } }) =>
        where.id === m.arte.id && where.projectId === m.arte.projectId ? m.arte : null,
      findUnique: async ({ where }: { where: { id: string } }) => (where.id === m.arte.id ? m.arte : null),
      update: async ({ data }: { data: unknown }) => {
        m.gravado = data
        return {}
      },
    },
  },
}))

import { definirReferenciaDeEstilo } from '../style-references'

beforeEach(() => {
  m.gravado = null
})

describe('definirReferenciaDeEstilo', () => {
  it('arte de outro projeto → mesmo erro da inexistente, nada gravado', async () => {
    await expect(definirReferenciaDeEstilo('g1', true, 9)).rejects.toThrow('Arte não encontrada.')
    expect(m.gravado).toBeNull()
  })
  it('arte do projeto → marca', async () => {
    await expect(definirReferenciaDeEstilo('g1', true, 6)).resolves.toEqual({ generationId: 'g1', marcada: true })
    expect(m.gravado).toMatchObject({ styleRefAt: expect.any(Date) })
  })
})
