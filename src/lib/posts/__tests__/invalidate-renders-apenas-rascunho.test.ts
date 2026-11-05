import { describe, expect, it } from 'vitest'
import { invalidateScheduledRenders } from '@/lib/posts/invalidate-renders'

/** H4: a edição do perfil draft-only só devolve à fila os RASCUNHOS da página; o agendado fica com a arte aprovada. */
describe('invalidateScheduledRenders com apenasRascunho', () => {
  const cliente = (consultas: Array<Record<string, unknown>>) =>
    ({
      socialPost: {
        findMany: async ({ where }: { where: Record<string, unknown> }) => (consultas.push(where), []),
        updateMany: async ({ where }: { where: Record<string, unknown> }) => (consultas.push(where), { count: 0 }),
      },
    }) as never

  it('toda consulta e escrita fica restrita a DRAFT', async () => {
    const consultas: Array<Record<string, unknown>> = []
    await invalidateScheduledRenders(cliente(consultas), { pageIds: ['pg-1'], apenasRascunho: true })
    expect(consultas.length).toBeGreaterThan(0)
    for (const where of consultas) expect(where.status).toBe('DRAFT')
  })

  it('sem a opção: agendado e rascunho, como sempre', async () => {
    const consultas: Array<Record<string, unknown>> = []
    await invalidateScheduledRenders(cliente(consultas), { pageIds: ['pg-1'] })
    expect(consultas[0].status).toEqual({ in: ['SCHEDULED', 'DRAFT'] })
  })
})
