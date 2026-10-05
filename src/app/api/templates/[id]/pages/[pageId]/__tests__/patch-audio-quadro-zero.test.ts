/**
 * Achado 6 da revisão do Codex sobre as Fases 2 e 3 (03/10/2026): trocar a
 * música é mudança VISUAL quando a página tem foto em movimento — a música faz
 * da página um vídeo, e o PNG do quadro 0 sai com (ou sem) o zoom. O PATCH
 * passa a invalidar o render agendado e a pedir a recomposição da arte
 * congelada nesse caso, e só nele: sem movimento, música continua sem tocar
 * no render.
 *
 * O handler real, com o banco em memória (o mesmo dublê do teste PR2-02).
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

const banco = vi.hoisted(() => ({ pagina: null as any, relogio: 1_000 }))
const espias = vi.hoisted(() => ({ invalidar: vi.fn(), after: vi.fn() }))

vi.mock('next/server', () => ({
  NextResponse: { json: (body: unknown, init?: { status?: number }) => ({ status: init?.status ?? 200, body }) },
  after: espias.after,
}))
vi.mock('@clerk/nextjs/server', () => ({ auth: async () => ({ userId: 'user_equipe', orgId: null }) }))
vi.mock('@/lib/templates/access', () => ({
  fetchTemplateWithProject: async () => ({ id: 77, Project: { id: 8 } }),
  hasTemplateReadAccess: () => true,
  hasTemplateWriteAccess: () => true,
}))
vi.mock('@/lib/aprendizado/captura', () => ({ registrarDecisaoSemSugestao: vi.fn(async () => null) }))
vi.mock('@/lib/aprendizado/fechar-copy-por-pagina', () => ({ caiNaEscolhaPropria: () => false, fecharDicaDeCopyDaPagina: vi.fn(async () => null) }))
vi.mock('@/lib/posts/invalidate-renders', async () => ({
  invalidateScheduledRenders: async (...args: unknown[]) => {
    espias.invalidar(...args)
    return { invalidados: 1, congelados: [] }
  },
  normalizeLayersString: (await import('@/lib/posts/page-layers')).normalizeLayersString,
}))
vi.mock('@/lib/db', () => {
  const copia = () => structuredClone(banco.pagina)
  const db: Record<string, any> = {
    page: {
      findFirst: async () => copia(),
      findUnique: async ({ select }: { select?: Record<string, boolean> } = {}) => {
        const p = copia()
        if (!select) return p
        return Object.fromEntries(Object.keys(select).map((k) => [k, p[k] ?? null]))
      },
      updateMany: async ({ where, data }: { where: { id: string; updatedAt?: Date }; data: Record<string, unknown> }) => {
        if (where.updatedAt && where.updatedAt.getTime() !== banco.pagina.updatedAt.getTime()) return { count: 0 }
        banco.pagina = { ...banco.pagina, ...data, updatedAt: new Date(++banco.relogio) }
        return { count: 1 }
      },
      update: async ({ data }: { data: Record<string, unknown> }) => {
        banco.pagina = { ...banco.pagina, ...data, updatedAt: new Date(++banco.relogio) }
        return copia()
      },
    },
    user: { findUnique: async () => null },
    $transaction: async (fn: (tx: unknown) => unknown) => fn(db),
  }
  return { db }
})

import { PATCH } from '../route'

const musica = {
  source: 'library', musicId: 1, startTime: 0, endTime: 10, volume: 80,
  fadeIn: false, fadeOut: false, fadeInDuration: 0, fadeOutDuration: 0,
}
const foto = (extra: Record<string, unknown> = {}) => ({
  id: 'fundo', name: 'Fundo', type: 'image', visible: true, order: 0, fileUrl: 'https://blob.test/foto.png',
  position: { x: 0, y: 0 }, size: { width: 1080, height: 1920 }, ...extra,
})

function paginaCom(camadas: Record<string, unknown>[], audio: unknown) {
  return {
    id: 'p1', templateId: 77, name: 'Peça', width: 1080, height: 1920, background: '#101010', isTemplate: false,
    tags: [], thumbnail: null, audio, order: 1, updatedAt: new Date(banco.relogio), layers: JSON.stringify(camadas), copyAutoral: null,
  }
}

async function patch(corpo: Record<string, unknown>) {
  const request = new Request('http://studio.test/api/templates/77/pages/p1', { method: 'PATCH', body: JSON.stringify(corpo) })
  return (await PATCH(request, { params: Promise.resolve({ id: '77', pageId: 'p1' }) })) as unknown as { status: number; body: any }
}

beforeEach(() => {
  banco.relogio = 1_000
  espias.invalidar.mockClear()
  espias.after.mockClear()
})

describe('achado 6 — a música é visual quando muda o quadro 0', () => {
  it('foto em movimento + música nova: invalida o render agendado e pede a recomposição', async () => {
    banco.pagina = paginaCom([foto({ movimento: 'afastar' })], null)
    const r = await patch({ audio: musica })
    expect(r.status).toBe(200)
    expect(espias.invalidar).toHaveBeenCalledTimes(1)
    expect(espias.after).toHaveBeenCalledTimes(1)
    expect(banco.pagina.audio).toMatchObject({ source: 'library', musicId: 1 })
  })

  it('tirar a música da foto em movimento também muda o quadro 0', async () => {
    banco.pagina = paginaCom([foto({ movimento: 'deslizar' })], musica)
    const r = await patch({ audio: null })
    expect(r.status).toBe(200)
    expect(espias.invalidar).toHaveBeenCalledTimes(1)
  })

  it('controle: sem foto em movimento, música nova não toca no render', async () => {
    banco.pagina = paginaCom([foto()], null)
    const r = await patch({ audio: musica })
    expect(r.status).toBe(200)
    expect(espias.invalidar).not.toHaveBeenCalled()
    expect(espias.after).not.toHaveBeenCalled()
    expect(banco.pagina.audio).toMatchObject({ musicId: 1 })
  })

  it('controle: trocar o trecho de uma música por outro não muda o quadro 0', async () => {
    banco.pagina = paginaCom([foto({ movimento: 'afastar' })], musica)
    const r = await patch({ audio: { ...musica, startTime: 3, endTime: 12 } })
    expect(r.status).toBe(200)
    expect(espias.invalidar).not.toHaveBeenCalled()
    expect(banco.pagina.audio).toMatchObject({ startTime: 3, endTime: 12 })
  })

  it('autosave com as mesmas camadas + música nova: as camadas não mudam, mas o quadro 0 sim', async () => {
    const camadas = [foto({ movimento: 'afastar' })]
    banco.pagina = paginaCom(camadas, null)
    const antes = banco.pagina.layers
    const r = await patch({ audio: musica, layers: camadas })
    expect(r.status).toBe(200)
    expect(espias.invalidar).toHaveBeenCalledTimes(1)
    expect(banco.pagina.layers).toBe(antes)
  })
})
