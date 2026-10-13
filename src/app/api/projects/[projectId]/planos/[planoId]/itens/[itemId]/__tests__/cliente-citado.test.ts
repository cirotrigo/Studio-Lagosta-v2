/**
 * O cliente citado no item também tem de estar no alcance de quem edita: sem
 * leitura nele, a resposta é a mesma do cliente que não existe. Limpar (null)
 * não confere nada.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

const m = vi.hoisted(() => ({ existentes: [8, 9, 10] as number[], legiveis: [8, 9] as number[], atualizar: vi.fn() }))

vi.mock('@clerk/nextjs/server', () => ({ auth: async () => ({ userId: 'user_1', orgId: 'org_1' }) }))
vi.mock('@/lib/projects/access', () => ({
  fetchProjectWithShares: async (id: number) => (m.existentes.includes(id) ? { id } : null),
  hasProjectWriteAccess: (p: { id: number } | null) => p?.id === 8,
  hasProjectReadAccess: (p: { id: number } | null) => !!p && m.legiveis.includes(p.id),
}))
vi.mock('@/lib/db', () => ({ db: { user: { findUnique: async () => ({ id: 'u-int' }) } } }))
vi.mock('@/lib/planos/plano-service', () => ({ atualizarItem: m.atualizar, transicionarItem: vi.fn(), removerItem: vi.fn() }))

import { PATCH } from '../route'

const patch = (body: Record<string, unknown>) =>
  PATCH(new Request('http://t', { method: 'PATCH', body: JSON.stringify(body) }), {
    params: Promise.resolve({ projectId: '8', planoId: 'p1', itemId: 'i1' }),
  })

beforeEach(() => {
  m.atualizar.mockReset()
  m.atualizar.mockResolvedValue({ item: { id: 'i1' }, avisos: [] })
})

describe('PATCH item do plano: cliente citado', () => {
  it('sem leitura no cliente citado → 404 igual ao inexistente, nada gravado', async () => {
    const semAcesso = await patch({ clienteProjectId: 10 })
    const inexistente = await patch({ clienteProjectId: 99 })
    expect(semAcesso.status).toBe(404)
    expect(inexistente.status).toBe(404)
    expect(await semAcesso.json()).toEqual(await inexistente.json())
    expect(m.atualizar).not.toHaveBeenCalled()
  })
  it('com leitura → grava', async () => {
    expect((await patch({ clienteProjectId: 9 })).status).toBe(200)
    expect(m.atualizar).toHaveBeenCalledWith(expect.objectContaining({ patch: { clienteProjectId: 9 } }))
  })
  it('null limpa sem conferência', async () => {
    expect((await patch({ clienteProjectId: null })).status).toBe(200)
  })
})
