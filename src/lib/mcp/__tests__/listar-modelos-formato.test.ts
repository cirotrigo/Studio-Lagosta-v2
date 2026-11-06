/**
 * S2 (06/11/2026) — `listar-modelos` filtra por `formato` (pelo tamanho) ANTES do `limit`, nos modelos e nas
 * candidatas; sem `formato`, devolve todos, como antes.
 */
import { describe, expect, it, vi } from 'vitest'

const pasta = { id: 10, name: 'Assinatura', type: 'STORY', tags: [] }
const paginas = [
  // Na ordem do orderBy (modelos primeiro, mais recentes primeiro).
  { id: 'm-feed', name: 'Feed', isTemplate: true, tags: [], width: 1080, height: 1350, updatedAt: new Date(0), Template: pasta },
  { id: 'm-story', name: 'Story', isTemplate: true, tags: [], width: 1080, height: 1920, updatedAt: new Date(0), Template: pasta },
  { id: 'c-feed', name: 'Arte feed', isTemplate: false, tags: [], width: 1080, height: 1350, updatedAt: new Date(0), Template: pasta },
  { id: 'c-story', name: 'Arte story', isTemplate: false, tags: [], width: 1080, height: 1920, updatedAt: new Date(0), Template: pasta },
]

vi.mock('@/lib/db', () => ({
  db: { page: { findMany: vi.fn(async ({ take }: any) => (take ? paginas.slice(0, take) : paginas)) } },
}))

import { toolsDeModelos } from '../catalogo/modelos'
import { executarTool } from '../registro/porta'

async function listar(args: Record<string, unknown>) {
  const indice = new Map(toolsDeModelos.map((t) => [t.nome, t]))
  const gates = { projeto: vi.fn(async () => undefined), curador: vi.fn(async () => undefined) }
  const r = await executarTool(indice, 'remoto', 'listar-modelos', { projectId: 7, ...args }, { kind: 'service' } as never, { gates })
  expect(r.isError).toBeFalsy()
  return JSON.parse(String((r.content[0] as { text: string }).text))
}

describe('S2 — listar-modelos com formato', () => {
  it('sem formato devolve todos (o comportamento de antes)', async () => {
    const r = await listar({ incluirNaoMarcadas: true })
    expect(r.modelos.map((m: any) => m.pageId)).toEqual(['m-feed', 'm-story'])
    expect(r.candidatas.map((m: any) => m.pageId)).toEqual(['c-feed', 'c-story'])
  })

  it('filtra modelos e candidatas pelo tamanho', async () => {
    const r = await listar({ incluirNaoMarcadas: true, formato: 'story' })
    expect(r.modelos.map((m: any) => m.pageId)).toEqual(['m-story'])
    expect(r.candidatas.map((m: any) => m.pageId)).toEqual(['c-story'])
  })

  it('o limit vale DEPOIS do filtro: limit 1 com feed na frente ainda acha o story', async () => {
    const r = await listar({ formato: 'story', limit: 1 })
    expect(r.modelos.map((m: any) => m.pageId)).toEqual(['m-story'])
  })
})
