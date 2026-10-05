/**
 * C15-05 na FIAÇÃO: os slides irmãos do carrossel (gerados na confirmação do
 * estilo) levam o carimbo da voz de quando a série foi escrita — o da CAPA,
 * onde mora a spec —, não o da voz de agora.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

const d = vi.hoisted(() => ({ findMany: vi.fn(), start: vi.fn() }))

vi.mock('@/lib/db', () => ({ db: { generation: { findMany: d.findMany } } }))
vi.mock('@/lib/ai/creative-generation-service', () => ({ startArtGeneration: d.start }))

import { confirmarEstiloCarrossel } from '../carousel-service'

const spec = {
  slides: [
    { ordem: 1, copy: [] },
    { ordem: 2, copy: ['Guia'] },
    { ordem: 3, copy: ['Terceiro'] },
    { ordem: 4, copy: ['Quarto'] },
  ],
}
const grupo = (capaFv: Record<string, unknown>) => [
  { id: 'capa', slideOrder: 1, status: 'COMPLETED', fieldValues: { carrosselSpec: spec, ...capaFv }, createdAt: new Date('2026-09-02T15:00:00Z') },
  { id: 'guia', slideOrder: 2, status: 'COMPLETED', fieldValues: {}, createdAt: new Date('2026-09-02T15:01:00Z') },
]

beforeEach(() => {
  vi.clearAllMocks()
  d.start.mockImplementation(async (input: { carrossel?: { slideOrder: number } }) => ({ jobGenerationId: `gen-${input.carrossel?.slideOrder}`, reused: false, runnerArgs: null }))
})

describe('confirmarEstiloCarrossel · os slides irmãos herdam o carimbo da capa', () => {
  it('capa com carimbo: todo slide gerado leva o mesmo carimbo e o instante da escrita dele', async () => {
    const carimbo = { fonte: 'legado', versao: null, lidoEm: '2026-09-02T15:00:00.000Z', escritaEm: '2026-09-02T14:30:00.000Z' }
    d.findMany.mockResolvedValue(grupo({ vozNaEscrita: carimbo }))
    const r = await confirmarEstiloCarrossel({ projectId: 6, carrosselId: 'car-1', actorClerkId: 'user_1' })
    expect(r.gerados.map((g) => g.ordem)).toEqual([3, 4])
    expect(d.findMany.mock.calls[0][0].select).toMatchObject({ fieldValues: true, createdAt: true })
    expect(d.start).toHaveBeenCalledTimes(2)
    for (const [input] of d.start.mock.calls) expect(input).toMatchObject({ vozNaEscrita: carimbo, escritaEm: '2026-09-02T14:30:00.000Z' })
  })

  it('capa sem carimbo: nenhum carimbo inventado, e a escrita é a criação da capa', async () => {
    d.findMany.mockResolvedValue(grupo({}))
    await confirmarEstiloCarrossel({ projectId: 6, carrosselId: 'car-1', actorClerkId: 'user_1' })
    expect(d.start).toHaveBeenCalledTimes(2)
    for (const [input] of d.start.mock.calls) expect(input).toMatchObject({ vozNaEscrita: null, escritaEm: '2026-09-02T15:00:00.000Z' })
  })
})
