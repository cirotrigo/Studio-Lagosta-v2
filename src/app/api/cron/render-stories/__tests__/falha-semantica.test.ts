/**
 * B1d — checkpoint d (Codex): o cron `render-stories` conta a recusa SEMÂNTICA como falha terminal — ela já
 * gravou RENDER_FAILED e não volta à fila, então "será renderizado no próximo ciclo" seria falso.
 */
import { describe, expect, it, vi } from 'vitest'

const estado = vi.hoisted(() => ({ resultado: null as any }))

vi.mock('@/lib/db', () => ({
  // a primeira consulta (urgentes) traz o post; a segunda (restantes), nada
  db: { socialPost: { findMany: vi.fn(async (args: any) => (args.where.scheduledDatetime ? [{ id: 'post-1', pageId: 'p1', slotValues: { _slots: {} }, renderAttempts: 0 }] : [])) } },
}))
vi.mock('@/lib/posts/render-post-art', () => ({ renderPostArt: vi.fn(async () => estado.resultado) }))
vi.mock('../../../../../../prisma/generated/client', () => ({
  PostStatus: { SCHEDULED: 'SCHEDULED', DRAFT: 'DRAFT' },
  RenderStatus: { PENDING: 'PENDING' },
}))

import { GET } from '../route'

async function rodar() {
  process.env.CRON_SECRET = 'segredo'
  const res = await GET(new Request('http://x/api/cron/render-stories', { headers: { authorization: 'Bearer segredo' } }) as never)
  return res.json()
}

describe('render-stories: falha semântica é falha terminal', () => {
  it('conta em failed (não "próximo ciclo")', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined)
    estado.resultado = { ok: false, motivo: 'falha-semantica', erro: '{"codigo":"RENDER_SEMANTICO_INVALIDO"}' }
    expect(await rodar()).toMatchObject({ processed: 1, rendered: 0, failed: 1 })
    expect(log.mock.calls.flat().join(' ')).not.toMatch(/próximo ciclo/)
    log.mockRestore()
  })

  it('erro comum e motivos de espera: como hoje', async () => {
    estado.resultado = { ok: false, motivo: 'falhou', erro: 'Blob' }
    expect(await rodar()).toMatchObject({ failed: 1 })
    estado.resultado = { ok: false, motivo: 'ocupado' }
    expect(await rodar()).toMatchObject({ failed: 0 })
  })
})
