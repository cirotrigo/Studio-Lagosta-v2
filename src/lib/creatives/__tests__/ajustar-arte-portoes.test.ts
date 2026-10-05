/**
 * Os PORTÕES de `ajustarArte` que decidem ANTES de tocar no banco: nada para
 * ajustar, ajuste incompleto e — desde 12/09/2026 — ajuste calculado sem a
 * versão em que foi calculado. O banco é mock: se qualquer portão deixar
 * passar, `db.project.findUnique` é chamado e o teste acusa.
 */
import { describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ findProject: vi.fn(async () => null) }))
vi.mock('@/lib/db', () => ({ db: { project: { findUnique: mocks.findProject }, page: { findUnique: vi.fn() } } }))
// O client gerado mora em prisma/generated (tsconfig `paths`); o vitest não lê paths.
vi.mock('@prisma/client', async () => await import('../../../../prisma/generated/client'))

import { ajustarArte } from '../arte-rapida'
import { CreativeError } from '../errors'

async function codigoDe(promessa: Promise<unknown>): Promise<{ code: string; status: number }> {
  try {
    await promessa
  } catch (erro) {
    if (erro instanceof CreativeError) return { code: erro.code, status: erro.status }
    throw erro
  }
  throw new Error('não lançou')
}

describe('portões de ajustarArte', () => {
  it('sem nada para ajustar: SEM_AJUSTE, sem ir ao banco', async () => {
    expect(await codigoDe(ajustarArte({ projectId: 8, pageId: 'p1' }))).toEqual({ code: 'SEM_AJUSTE', status: 400 })
    expect(mocks.findProject).not.toHaveBeenCalled()
  })

  it('ajuste incompleto: AJUSTE_INVALIDO diz qual e por quê', async () => {
    const r = ajustarArte({ projectId: 8, pageId: 'p1', versaoEsperada: 'v1:abc', ajustes: [{ tipo: 'mover', camadas: ['headline'] }] })
    await expect(r).rejects.toMatchObject({ code: 'AJUSTE_INVALIDO', status: 400, message: expect.stringContaining('ajuste 0: mover precisa de "dx" e/ou "dy"') })
    expect(mocks.findProject).not.toHaveBeenCalled()
  })

  it('ajustes sem versaoEsperada: VERSAO_OBRIGATORIA — ajuste calculado só se aplica à versão em que foi calculado', async () => {
    const r = ajustarArte({ projectId: 8, pageId: 'p1', ajustes: [{ tipo: 'mover', camadas: ['headline'], dy: -12 }] })
    await expect(r).rejects.toMatchObject({ code: 'VERSAO_OBRIGATORIA', status: 400 })
    expect(mocks.findProject).not.toHaveBeenCalled()
  })

  it('texto, foto ou nome sem ajustes continuam sem exigir versão (chegam ao banco)', async () => {
    await codigoDe(ajustarArte({ projectId: 8, pageId: 'p1', slotValues: { headline: 'Novo' } }))
    expect(mocks.findProject).toHaveBeenCalledTimes(1)
  })
})
