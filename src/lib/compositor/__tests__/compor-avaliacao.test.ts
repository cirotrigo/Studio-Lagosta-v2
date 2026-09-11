import { beforeEach, describe, expect, it, vi } from 'vitest'
import * as selecao from '../selecionar-combinacao'
import type { Layer } from '@/types/template'
const mocks = vi.hoisted(() => ({ persistir: vi.fn(), pasta: vi.fn(), regua: vi.fn(), paginas: vi.fn() }))
vi.mock('@/lib/db', () => ({ db: {
  project: { findUnique: vi.fn(async () => ({ id: 3, name: 'TERO', userId: 'user', assinatura: {}, Logo: [] })) },
  template: { findFirst: vi.fn(async () => ({ id: 1 })) },
  page: { findMany: mocks.paginas },
} }))
vi.mock('@/lib/creatives/persist', () => ({ persistAndRenderCreative: mocks.persistir, resolveImageUrl: vi.fn() }))
vi.mock('../pastas', () => ({ garantirPasta: mocks.pasta, ordemNaPasta: async () => ({ ordem: 1, repeticao: 0 }) }))
vi.mock('@/lib/creatives/uso-de-foto', () => ({ registrarUsoDeFoto: vi.fn() }))
vi.mock('@/lib/posts/register-project-fonts', () => ({ registerProjectFonts: vi.fn(), fetchBuffer: vi.fn() }))
vi.mock('@/lib/creatives/server-text-measurer', () => ({ createServerTextBoxMeasurer: async () => (l: Layer) => ({ width: l.size.width, height: Number(l.style?.fontSize ?? 48), maxLineWidth: 100, lineCount: 1 }) }))
vi.mock('@/lib/creatives/text-autofix', () => ({ aplicarAutofixOuFalhar: async (args: { layers: Layer[] }) => ({ layers: args.layers, avisos: [] }) }))
vi.mock('../regua', async (original) => ({ ...await original<typeof import('../regua')>(), medirContrasteDaPeca: mocks.regua }))
import { comporPeca } from '../compor'
const texto = (name: string): Layer => ({ id: name, name, type: 'text', content: 'Teste', visible: true, locked: false, order: 1, position: { x: 80, y: 230 }, size: { width: 700, height: 100 }, style: { fontFamily: 'Arial', fontSize: 80, color: '#ffffff' }, effects: { background: { enabled: true, backgroundColor: '#000000', opacity: 0.37, blur: 65, padding: 25, borderRadius: 10, fit: 'texto', offsetX: 0, offsetY: 0 } } })
beforeEach(() => {
  vi.clearAllMocks()
  mocks.paginas.mockResolvedValue([{ id: 'quintal', name: 'Quintal', width: 1080, height: 1920, layers: [texto('headline'), texto('headline2')], tags: [], background: '#000000' }])
  mocks.regua.mockImplementation(async (args) => ({ layers: args.layers, medidas: [], avisos: [] }))
})
describe('compositor em avaliação local', () => {
  it('monta segunda voz SEM halo: o fundo de texto da página não é copiado', async () => {
    const r = await comporPeca({ projectId: 3, formato: 'story', blocos: [{ papel: 'headline', linhas: ['Quarta no', 'Quintal'] }] }, { somenteAvaliar: true })
    expect(r.persistido).toBeNull(); expect(r.prova).toBeNull()
    expect(mocks.persistir).not.toHaveBeenCalled(); expect(mocks.pasta).not.toHaveBeenCalled()
    expect(r.layers.filter((l) => l.type === 'text').map((l) => l.content)).toEqual(['Quarta no', 'Quintal'])
    expect(r.layers.filter((l) => l.type === 'text').every((l) => !l.effects?.background)).toBe(true)
    expect(r.layers.some((l) => l.id === 'halo-marca')).toBe(false)
    // A régua corrige a força do gradiente dentro da faixa da marca
    expect(mocks.regua.mock.calls[0][0]).toMatchObject({ corrigir: true, faixa: [0.45, 0.9] })
    expect(r.diagnostico.tratamentoDeTexto).toBe('gradiente-de-leitura')
    expect(r.diagnostico.halos).toEqual([])
  })
  it('sem foto não há gradiente: a peça sai sobre o fundo liso da marca', async () => {
    const r = await comporPeca({ projectId: 3, formato: 'story', blocos: [{ papel: 'headline', linhas: ['Quintal'] }] }, { somenteAvaliar: true })
    expect(r.layers.some((l) => l.type === 'gradient')).toBe(false)
    expect(r.diagnostico.gradientes).toEqual([])
  })
  it('confere novamente antes de salvar a combinação selecionada', async () => {
    await expect(comporPeca({ projectId: 3, formato: 'story', blocos: [{ papel: 'headline', linhas: ['Quintal'] }] }, { selecao: { combinacoes: [], limite: 6, janelaMs: 30000, interrompida: false } })).rejects.toMatchObject({ code: 'SELECAO_INDISPONIVEL' })
    expect(mocks.persistir).not.toHaveBeenCalled(); expect(mocks.pasta).not.toHaveBeenCalled()
  })
  it('recusa serviço incompatível antes da régua/persistência', async () => {
    await expect(comporPeca({ projectId: 3, formato: 'story', blocos: [{ papel: 'headline', linhas: ['Quintal'] }, { papel: 'servico', linhas: ['Somente quarta'] }] }, { somenteAvaliar: true })).rejects.toMatchObject({ code: 'PAPEIS_INCOMPATIVEIS' })
    expect(mocks.regua).not.toHaveBeenCalled(); expect(mocks.persistir).not.toHaveBeenCalled()
  })
  it('palavra entre [colchetes] sai destacada no estilo que a página de assinatura desenhou', async () => {
    const headline = { ...texto('headline'), type: 'rich-text' as const, richTextStyles: [{ start: 0, end: 5, fill: '#ff0000' }] }
    mocks.paginas.mockResolvedValue([{ id: 'quintal', name: 'Quintal', width: 1080, height: 1920, layers: [headline, texto('headline2')], tags: [], background: '#000000' }])
    const r = await comporPeca({ projectId: 3, formato: 'story', blocos: [{ papel: 'headline', linhas: ['[Quarta] no', 'Quintal'] }] }, { somenteAvaliar: true })
    const destacada = r.layers.find((l) => l.id === 'headline')!
    expect(destacada.type).toBe('rich-text')
    expect(destacada.content).toBe('Quarta no')
    expect(destacada.richTextStyles).toEqual([{ start: 0, end: 6, fill: '#ff0000' }])
    // A segunda voz não tem destaque na página e a copy não a marcou: texto comum
    expect(r.layers.find((l) => l.id === 'headline2')).toMatchObject({ type: 'text', content: 'Quintal' })
    expect(r.diagnostico.blocos.find((b) => b.papel === 'headline')?.destacado).toBe(true)
  })
})


it('reentrada após seleção preserva a Generation da fila até a persistência final', async () => {
  const spec = { projectId: 3, formato: 'story' as const, blocos: [{ papel: 'headline' as const, linhas: ['Quintal'] }], itemDePlanoId: 'i', planoId: 'p' }
  // Seleção simulada: este teste isola o fio generationId, não aprova uma foto.
  vi.spyOn(selecao, 'selecionarCombinacao').mockResolvedValueOnce({ spec, avisos: [], diagnostico: { combinacoes: [], limite: 6, janelaMs: 30000, interrompida: false }, cacheDeFotos: new Map(), assuntosDoCatalogo: new Map() })
  mocks.regua.mockImplementation(async (args) => ({ layers: args.layers, medidas: [{ grupo: 'headline', ok: true }], avisos: [] }))
  mocks.pasta.mockResolvedValue({ id: 42, name: 'Semana' })
  mocks.persistir.mockResolvedValue({ generationId: 'g-fila', pageId: 'page', url: 'https://example.com/arte.png' })
  await comporPeca({ ...spec, selecaoExperimental: true, fotosCandidatas: ['foto'] }, { generationId: 'g-fila', autor: 'u' })
  expect(mocks.persistir).toHaveBeenCalledTimes(1)
  expect(mocks.persistir.mock.calls[0][0]).toMatchObject({ generationId: 'g-fila', createdBy: 'u', fieldValues: { generationIdDaFila: 'g-fila', spec: { itemDePlanoId: 'i', planoId: 'p' }, composicao: { selecao: { limite: 6 } } } })
})


it('candidatas sem opt-in não acionam seleção nem mudam o baseline', async () => {
  const selecionar = vi.spyOn(selecao, 'selecionarCombinacao')
  const spec = { projectId: 3, formato: 'story' as const, blocos: [{ papel: 'headline' as const, linhas: ['Quintal'] }] }
  mocks.pasta.mockResolvedValue({ id: 42, name: 'Semana' })
  mocks.persistir.mockResolvedValue({ generationId: 'g', pageId: 'page', url: 'https://example.com/arte.png' })
  const base = await comporPeca(spec)
  const candidata = await comporPeca({ ...spec, fotosCandidatas: ['foto'] })
  expect(selecionar).not.toHaveBeenCalled()
  expect(candidata.layers).toEqual(base.layers)
})

it('preferência legada de tratamento continua aceita e não devolve o halo', async () => {
  const r = await comporPeca({ projectId: 3, formato: 'story', preferencias: { tratamentoDeTexto: 'gradiente-suave-topo' }, blocos: [{ papel: 'headline', linhas: ['Quarta no', 'Quintal'] }] }, { somenteAvaliar: true })
  expect(r.layers.filter((l) => l.type === 'text').map((l) => l.content)).toEqual(['Quarta no', 'Quintal'])
  expect(r.layers.filter((l) => l.type === 'text').every((l) => !l.effects?.background)).toBe(true)
  expect(r.diagnostico.tratamentoDeTexto).toBe('gradiente-de-leitura')
  const assinatura = await comporPeca({ projectId: 3, formato: 'story', preferencias: { tratamentoDeTexto: 'assinatura' }, blocos: [{ papel: 'headline', linhas: ['Quintal'] }] }, { somenteAvaliar: true })
  expect(assinatura.layers.filter((l) => l.type === 'text').every((l) => !l.effects?.background)).toBe(true)
})

it('persiste sem halo e conserva a preferência na spec', async () => {
  mocks.pasta.mockResolvedValue({ id: 42, name: 'Semana' })
  mocks.persistir.mockResolvedValue({ generationId: 'g', pageId: 'page', url: 'https://example.com/arte.png' })
  await comporPeca({ projectId: 3, formato: 'story', preferencias: { tratamentoDeTexto: 'gradiente-suave-topo' }, blocos: [{ papel: 'headline', linhas: ['Quintal'] }] })
  const entrada = mocks.persistir.mock.calls[0][0]
  expect(entrada).toMatchObject({ fieldValues: { spec: { preferencias: { tratamentoDeTexto: 'gradiente-suave-topo' } } } })
  expect((entrada.layers as Layer[]).filter((l) => l.type === 'text').every((l) => !l.effects?.background)).toBe(true)
})

it('o nome da página não leva os colchetes do destaque', async () => {
  mocks.pasta.mockResolvedValue({ id: 42, name: 'Semana' })
  mocks.persistir.mockResolvedValue({ generationId: 'g', pageId: 'page', url: 'https://example.com/arte.png' })
  await comporPeca({ projectId: 3, formato: 'story', blocos: [{ papel: 'headline', linhas: ['Vem pro [Quintal]'] }] })
  expect(String(mocks.persistir.mock.calls[0][0].pageName ?? mocks.persistir.mock.calls[0][0].nome ?? '')).not.toMatch(/[[\]]/)
})

it('variante explícita ausente recebe diagnóstico específico sem fallback', async () => {
  await expect(comporPeca({ projectId: 3, formato: 'story', preferencias: { variante: 'ausente' }, blocos: [{ papel: 'headline', linhas: ['Quintal'] }] }, { somenteAvaliar: true })).rejects.toMatchObject({ code: 'ASSINATURA_INCOMPLETA', message: expect.stringContaining('variante solicitada "ausente"'), details: { variante: 'ausente', formato: 'story' } })
  expect(mocks.regua).not.toHaveBeenCalled()
  expect(mocks.persistir).not.toHaveBeenCalled()
})
