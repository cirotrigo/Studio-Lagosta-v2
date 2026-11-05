/**
 * F2a (Codex, rodada 1, P2 #6): `fotoJanela` SEM foto não some no adaptador — chega à validação comum, que a recusa
 * (SPEC_INVALIDA). Descartá-la compunha sem foto e sem a janela, em silêncio, e a leva com candidatas seguia sem ela.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ comporPeca: vi.fn(), enfileirarPeca: vi.fn() }))
vi.mock('@/lib/compositor/compor', () => ({ comporPeca: mocks.comporPeca }))
vi.mock('@/lib/compositor/fila', () => ({ enfileirarPeca: mocks.enfileirarPeca }))
vi.mock('@/lib/creatives/persist', () => ({ getPublicAppUrl: () => 'https://studio.test' }))
vi.mock('@/lib/mcp/tools', () => ({ quemDecidiu: vi.fn(async () => 'u1'), canalDoPrincipal: vi.fn(() => 'claude-ai') }))

import { validarSpec } from '@/lib/compositor/spec'
import { toolsDoCompositor } from '../catalogo/compositor'

const tool = (nome: string) => toolsDoCompositor.find((t) => t.nome === nome)!
const blocos = [
  { papel: 'headline', linhas: ['Almoço de domingo'] },
  { papel: 'servico', linhas: ['Dom · 12h às 16h'] },
]
const JANELA = { x: 0.1, y: 0.05, width: 0.5, height: 0.5 }

beforeEach(() => {
  vi.clearAllMocks()
  mocks.comporPeca.mockResolvedValue({ prova: null, persistido: { generationId: 'g', pageId: 'p', url: 'u', editUrl: 'e', galleryUrl: 'gl' }, diagnostico: { posicao: { ancora: 'topo', alinha: 'esquerda', crop: 'center-middle' }, logo: null, blocos: [], avisos: [] } })
  mocks.enfileirarPeca.mockResolvedValue({ generationId: 'g1', pageId: 'p1', lote: null })
})

describe('fotoJanela sem foto chega à validação', () => {
  it('compor-arte: a spec passada ao compositor leva `foto.janela` sem url/driveFileId — e `validarSpec` a recusa pela regra da janela', async () => {
    await tool('compor-arte').handler({ projectId: 8, formato: 'story', blocos, fotoJanela: JANELA }, { kind: 'user' } as never)
    const spec = mocks.comporPeca.mock.calls[0][0]
    expect(spec.foto).toEqual({ janela: JANELA })
    expect(validarSpec(spec).problemas.join(' ')).toMatch(/janela.*precisa da foto/)
  })

  it('compor-leva: o item com fotoJanela e candidatas (sem foto) leva a janela à fila, onde a validação comum a recusa', async () => {
    await tool('compor-leva').handler({ projectId: 8, itens: [{ formato: 'story', blocos, fotoJanela: JANELA, fotosCandidatas: ['a', 'b'] }] }, { kind: 'user' } as never)
    const spec = mocks.enfileirarPeca.mock.calls[0][0]
    expect(spec.foto).toEqual({ janela: JANELA })
    expect(validarSpec(spec).problemas.join(' ')).toMatch(/janela/)
  })

  it('com a foto, a janela segue junto dela (o caminho de sempre)', async () => {
    await tool('compor-arte').handler({ projectId: 8, formato: 'story', blocos, fotoDriveId: 'd1', fotoJanela: JANELA }, { kind: 'user' } as never)
    expect(mocks.comporPeca.mock.calls[0][0].foto).toEqual({ driveFileId: 'd1', janela: JANELA })
  })
})
