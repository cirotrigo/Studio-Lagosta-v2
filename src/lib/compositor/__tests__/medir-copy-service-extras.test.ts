import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Layer } from '@/types/template'

// Mesmos dublês de `medir-copy-service.test.ts`: o que se prova é que o PEDIDO
// de medição leva as camadas extras até a régua (PR 10) — sem isso `medir-copy`
// media só os blocos por papel e declarava "cabe tudo" para uma peça cuja nota
// livre a composição mediria (e poderia recusar).
const mocks = vi.hoisted(() => ({
  projeto: vi.fn(),
  template: vi.fn(),
  paginas: vi.fn(),
  naoCarregadas: vi.fn(),
  familias: vi.fn(),
  carregarAssinatura: vi.fn(),
}))
vi.mock('@/lib/db', () => ({ db: { project: { findUnique: mocks.projeto }, template: { findFirst: mocks.template }, page: { findMany: mocks.paginas } } }))
vi.mock('@/lib/creatives/server-text-measurer', () => ({
  createServerTextBoxMeasurer: async () => (layer: Layer) => {
    const fontSize = Number(layer.style?.fontSize ?? 16)
    const linhas = (layer.content ?? '').split('\n')
    return { width: layer.size.width, height: linhas.length * fontSize * Number(layer.style?.lineHeight ?? 1.1), maxLineWidth: Math.max(...linhas.map((l) => l.length * fontSize * 0.55)), lineCount: linhas.length }
  },
}))
vi.mock('@/lib/posts/register-project-fonts', () => ({ registerProjectFonts: vi.fn(async () => undefined), familiasNaoCarregadas: mocks.naoCarregadas, fetchBuffer: vi.fn() }))
vi.mock('../compor', () => ({ arranjosDasCombinacoes: vi.fn(async () => []), carregarAssinatura: mocks.carregarAssinatura, carregarFoto: vi.fn(), familiasDoProjeto: mocks.familias, luzMediaDaFoto: vi.fn() }))
vi.mock('@/server/google-drive-service', () => ({ googleDriveService: { isEnabled: () => true, getFileMetadata: vi.fn() } }))
vi.mock('@vercel/blob', () => ({ put: vi.fn(), del: vi.fn() }))

import { montarAssinatura } from '../assinatura'
import { medirCopyDoProjeto } from '../medir-copy-service'

const texto = (id: string, style: Record<string, unknown>, content = 'x', extra: Partial<Layer> = {}): Layer => ({
  id, name: id, type: 'text', visible: true, locked: false, order: 0, position: { x: 92, y: 200 }, size: { width: 400, height: 80 }, content, style, ...extra,
})
// Variante SEM serviço.
const camadas: Layer[] = [
  texto('headline', { fontFamily: 'Bevan', fontSize: 100, color: '#fff', lineHeight: 1 }, 'Título', { metadata: { groupId: 'g1' } }),
  texto('apoio', { fontFamily: 'Barlow', fontSize: 40, color: '#fff', lineHeight: 1.2 }, 'Apoio', { position: { x: 92, y: 320 }, metadata: { groupId: 'g1' } }),
]

beforeEach(() => {
  vi.clearAllMocks()
  mocks.projeto.mockResolvedValue({ assinatura: null, Logo: [] })
  mocks.template.mockResolvedValue(null)
  mocks.familias.mockResolvedValue(['Bevan', 'Barlow'])
  mocks.naoCarregadas.mockResolvedValue(new Set<string>())
  const a = montarAssinatura({ pagina: { id: 'p-sem-servico', name: 'Story sem serviço', tags: ['assinatura'], width: 1080, height: 1920, layers: camadas }, formatoDaPagina: 'story', numerosDoProjeto: null })
  a.camadasDaPagina = camadas
  mocks.carregarAssinatura.mockResolvedValue(a)
})

describe('medirCopyDoProjeto — a camada extra chega à medição (PR 10)', () => {
  it('o serviço que herda do apoio e a nota livre são medidos pelo id, numa variante sem serviço, e nenhum papel é declarado ausente', async () => {
    const r = await medirCopyDoProjeto({
      projectId: 8,
      formato: 'story',
      variante: 'p-sem-servico',
      blocos: [{ papel: 'headline', linhas: ['Costela'] }, { papel: 'servico', linhas: ['Seg a sex, 11h às 15h'], herdaDe: 'apoio', id: 'hora' }],
      camadasExtras: [{ id: 'nota', linhas: ['vale só no almoço'], herdaDe: 'apoio' }],
    })
    const ids = r.medicao.blocos.map((b) => b.id)
    expect(ids).toEqual(expect.arrayContaining(['headline', 'hora', 'nota']))
    expect(r.medicao.blocos.find((b) => b.id === 'hora')!.extra).toEqual({ funcao: 'servico', herdaDe: 'apoio', grupoVisual: 'rodape' })
    expect(r.medicao.blocos.find((b) => b.id === 'nota')!.extra).toEqual({ funcao: 'livre', herdaDe: 'apoio', grupoVisual: 'principal' })
    expect(r.medicao.papeisAusentes).toEqual([])
    expect(r.medicao.cabeTudo).toBe(true)
  })

  it('a nota livre herdando um papel que a variante não tem é declarada pelo id e derruba cabeTudo', async () => {
    const r = await medirCopyDoProjeto({
      projectId: 8,
      formato: 'story',
      variante: 'p-sem-servico',
      blocos: [{ papel: 'headline', linhas: ['Costela'] }],
      camadasExtras: [{ id: 'nota', linhas: ['vale só no almoço'], herdaDe: 'cta' }],
    })
    expect(r.medicao.blocos.find((b) => b.id === 'nota')!.situacao).toBe('papel-ausente')
    expect(r.medicao.cabeTudo).toBe(false)
  })
})
