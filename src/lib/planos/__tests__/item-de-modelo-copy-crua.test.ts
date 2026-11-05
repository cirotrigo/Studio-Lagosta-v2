/**
 * B1c: o item de plano entrega a copy CRUA a `createArteRapida` — o casamento com os campos é feito lá,
 * contra a página efetiva (a irmã que a foto escolher). Aqui não se lê o modelo nem se oculta nada.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

const estado = vi.hoisted(() => ({ item: null as any }))

vi.mock('@/lib/db', () => ({ db: { page: { findUnique: vi.fn(), findFirst: vi.fn() } } }))
vi.mock('@prisma/client', async () => await import('../../../../prisma/generated/client'))
vi.mock('@/lib/creatives/arte-rapida', () => ({
  createArteRapida: vi.fn(async () => ({ generationId: 'g1', pageId: 'nova', url: 'u', avisos: ['aviso do casamento'] })),
}))
vi.mock('@/lib/ai/creative-generation-service', () => ({ startArtGeneration: vi.fn() }))
vi.mock('@/lib/ai/generation-queue', () => ({ enfileirarArte: vi.fn() }))
vi.mock('@/lib/credits/settings', () => ({ getFeatureCost: vi.fn() }))
vi.mock('@/lib/planos/plano-service', () => ({
  lerPlano: vi.fn(async () => ({ itens: [estado.item] })),
  transicionarItem: vi.fn(async () => undefined),
  atualizarItem: vi.fn(),
  statusDoItem: () => 'aprovado',
}))

import { gerarItemPorModelo } from '../executar-plano'
import { createArteRapida } from '@/lib/creatives/arte-rapida'
import { db } from '@/lib/db'

const contrato = {
  versao: 'copy-autoral-v1',
  origem: { autor: 'claude', superficie: 'chat' },
  blocos: [{ id: 'h', funcao: 'headline', ordem: 0, linhas: ['Noite do [vinho]'] }],
  revisoes: [],
}
const chamada = () => (createArteRapida as any).mock.calls.at(-1)[0]

beforeEach(() => vi.clearAllMocks())

describe('item de modelo entrega a copy crua', () => {
  it('posicional: copyPosicional cru (com colchetes), só a foto nos slotValues, sem ler o modelo', async () => {
    estado.item = { id: 'i1', via: 'template', sourcePageId: 'p-a', copyProposta: ['Noite do [vinho]', 'Sex 19h'], fotoDriveId: ' d1 ' }
    const r = await gerarItemPorModelo({ projectId: 8, planoId: 'pl', itemId: 'i1' })
    expect(chamada()).toMatchObject({ sourcePageId: 'p-a', slotValues: { _driveImageId: 'd1' }, copyPosicional: ['Noite do [vinho]', 'Sex 19h'] })
    expect(chamada().copyAutoral).toBeUndefined()
    expect(db.page.findUnique).not.toHaveBeenCalled()
    expect(r.avisos).toEqual(['aviso do casamento'])
  })

  it('contrato: copyAutoral, sem copyPosicional', async () => {
    estado.item = { id: 'i1', via: 'template', sourcePageId: 'p-a', copyAutoral: contrato, copyProposta: ['ignorada'] }
    await gerarItemPorModelo({ projectId: 8, planoId: 'pl', itemId: 'i1' })
    expect(chamada().copyAutoral).toMatchObject({ blocos: [{ id: 'h' }] })
    expect(chamada().copyPosicional).toBeUndefined()
    expect(chamada().slotValues).toEqual({})
  })
})
