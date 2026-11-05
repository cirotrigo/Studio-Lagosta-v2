import { beforeEach, describe, expect, it, vi } from 'vitest'
import { CreativeError } from '@/lib/creatives/errors'
import { executarTool } from '../registro/porta'
import { toolsDeFotos } from '../catalogo/fotos'
import type { McpPrincipal } from '../oauth'

const marcar = vi.hoisted(() => vi.fn())
const acharUsuario = vi.hoisted(() => vi.fn())
vi.mock('@/lib/creatives/acervo', () => ({ marcarAssuntoDaFoto: marcar }))
vi.mock('@/lib/db', () => ({ db: { user: { findUnique: acharUsuario } } }))

const tool = toolsDeFotos.find((t) => t.nome === 'marcar-assunto')!
const principal = { kind: 'user', userId: 'clerk_1' } as McpPrincipal
const gates = (curador: () => Promise<void>) => ({ gates: { projeto: async () => undefined, curador } })
const chamar = (args: Record<string, unknown>, curador: () => Promise<void> = async () => undefined) =>
  executarTool(new Map([[tool.nome, tool]]), 'remoto', tool.nome, args, principal, gates(curador))

describe('marcar-assunto', () => {
  beforeEach(() => {
    marcar.mockReset().mockResolvedValue({ anterior: {}, efetivo: {} })
    acharUsuario.mockReset().mockResolvedValue({ id: 'interno' })
  })

  it('é de curadoria: sem curador recusa e nada é marcado', async () => {
    expect(tool.acesso.tipo).toBe('curador')
    const r = await chamar({ projectId: 1, driveFileId: 'a', decisao: 'sem-assunto' }, async () => {
      throw new CreativeError('PROJETO_SEM_CURADORIA', 'não', 403)
    })
    expect(r.isError).toBe(true)
    expect(marcar).not.toHaveBeenCalled()
  })

  it('encaminha a decisão com o User INTERNO, sem criar ninguém', async () => {
    const caixa = { x0: 0, y0: 0, x1: 1, y1: 1 }
    await chamar({ projectId: 1, driveFileId: ' a ', decisao: 'caixa', caixa })
    expect(marcar).toHaveBeenCalledWith({ projectId: 1, driveFileId: 'a', decisao: 'caixa', caixa, decididoPor: 'interno' })
  })

  it('decisão fora do vocabulário recusa no schema', async () => {
    const r = await chamar({ projectId: 1, driveFileId: 'a', decisao: 'talvez' })
    expect(r.isError).toBe(true)
    expect(marcar).not.toHaveBeenCalled()
  })
})
