/**
 * Reserva órfã: o cron só seleciona PENDING, então um RENDERING cuja execução morreu ficava preso — e a cobertura
 * da agenda (`avaliarOcupante`) o lia como pendente para sempre (Codex, revisão do PR #219).
 */
import { describe, expect, it, vi } from 'vitest'

const banco = vi.hoisted(() => ({ linhas: [] as any[] }))

function casa(l: any, where: any): boolean {
  if (where.renderStatus && l.renderStatus !== where.renderStatus) return false
  if (where.status?.in && !where.status.in.includes(l.status)) return false
  if ('laterPostId' in where && l.laterPostId !== where.laterPostId) return false
  if (where.updatedAt?.lt && !(l.updatedAt < where.updatedAt.lt)) return false
  if (where.renderAttempts?.gte !== undefined && !(l.renderAttempts >= where.renderAttempts.gte)) return false
  if (where.renderAttempts?.lt !== undefined && !(l.renderAttempts < where.renderAttempts.lt)) return false
  return true
}

vi.mock('@/lib/db', () => ({
  db: {
    socialPost: {
      updateMany: async ({ where, data }: any) => {
        const alvo = banco.linhas.filter((l) => casa(l, where))
        for (const l of alvo) {
          Object.assign(l, data, { renderAttempts: l.renderAttempts + (data.renderAttempts?.increment ?? 0) })
        }
        return { count: alvo.length }
      },
    },
  },
}))
vi.mock('@/lib/posts/story-renderer', () => ({ renderStoryImage: async () => ({}) }))
vi.mock('../ensure-post-generation', () => ({ ensurePostGeneration: async () => undefined }))
vi.mock('../../../../prisma/generated/client', () => ({
  RenderStatus: { PENDING: 'PENDING', RENDERING: 'RENDERING', RENDERED: 'RENDERED', RENDER_FAILED: 'RENDER_FAILED', NOT_NEEDED: 'NOT_NEEDED' },
  PostStatus: { DRAFT: 'DRAFT', SCHEDULED: 'SCHEDULED', POSTING: 'POSTING', POSTED: 'POSTED', FAILED: 'FAILED' },
}))

import { recuperarRendersInterrompidos, RENDER_INTERROMPIDO_MS } from '../render-post-art'

const agora = new Date('2026-10-13T12:00:00Z')
const ha = (ms: number) => new Date(agora.getTime() - ms)
const linha = (id: string, extra: Record<string, unknown> = {}) => ({
  id, status: 'DRAFT', renderStatus: 'RENDERING', laterPostId: null, renderAttempts: 0,
  updatedAt: ha(RENDER_INTERROMPIDO_MS + 1), nextRenderAt: new Date('2003-01-01'), ...extra,
})

describe('recuperarRendersInterrompidos', () => {
  it('devolve à fila o RENDERING órfão, conta a tentativa e invalida a ficha da execução morta', async () => {
    banco.linhas = [linha('orfao'), linha('agendado', { status: 'SCHEDULED', renderAttempts: 1 })]
    expect(await recuperarRendersInterrompidos(agora)).toEqual({ devolvidos: 2, falharam: 0 })
    for (const l of banco.linhas) {
      expect(l.renderStatus).toBe('PENDING')
      expect(l.nextRenderAt).toBe(agora) // o cron da mesma rodada já o seleciona (nextRenderAt <= now)
    }
    expect(banco.linhas.map((l) => l.renderAttempts)).toEqual([1, 2])
  })

  it('na 3ª tentativa vira RENDER_FAILED em vez de PENDING que o cron nunca mais pegaria', async () => {
    banco.linhas = [linha('esgotado', { renderAttempts: 2 })]
    expect(await recuperarRendersInterrompidos(agora)).toEqual({ devolvidos: 0, falharam: 1 })
    expect(banco.linhas[0]).toMatchObject({ renderStatus: 'RENDER_FAILED', renderAttempts: 3 })
  })

  it('não toca reserva viva, post entregue (laterPostId) nem post fora de rascunho/agendado', async () => {
    banco.linhas = [
      linha('vivo', { updatedAt: ha(60_000) }),
      linha('entregue', { laterPostId: 'zernio-1' }),
      linha('postado', { status: 'POSTED' }),
      linha('pronto', { renderStatus: 'RENDERED' }),
    ]
    const antes = JSON.stringify(banco.linhas)
    expect(await recuperarRendersInterrompidos(agora)).toEqual({ devolvidos: 0, falharam: 0 })
    expect(JSON.stringify(banco.linhas)).toBe(antes)
  })
})
