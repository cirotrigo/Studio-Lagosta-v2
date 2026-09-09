import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ResultadoDaComposicao } from '../compor'
import type { SpecDePeca } from '../spec'
import { selecionarCombinacao, avaliarCombinacao } from '../selecionar-combinacao'
import { assuntoEmPixels, lerCaixaDoAssunto, fracaoVisivelDoAssunto } from '../assunto-da-foto'

const mocks = vi.hoisted(() => ({ compor: vi.fn(), paginas: vi.fn(), catalogo: vi.fn() }))
vi.mock('../compor', () => ({ comporPeca: mocks.compor, paginasDeAssinatura: mocks.paginas }))
vi.mock('@/lib/creatives/acervo', () => ({ lerCatalogoDoProjeto: mocks.catalogo }))
const spec: SpecDePeca = { projectId: 3, formato: 'story', fotosCandidatas: ['clara', 'escura'], blocos: [{ papel: 'headline', linhas: ['Quarta no', 'Quintal'] }, { papel: 'servico', linhas: ['Quarta, 11h à meia-noite'] }] }
const variante = (id: string, papeis = ['headline', 'servico']) => ({ id, name: id, tags: [], formato: 'story', papeis })
const resultado = (ok = true): ResultadoDaComposicao => ({ persistido: null, prova: null, layers: [], diagnostico: {
  formato: 'story', posicao: { ancora: 'topo', alinha: 'esquerda', crop: 'center-middle', pontuacao: 0.8, motivo: '' }, candidatos: [{ ancora: 'topo', alinha: 'esquerda', crop: 'center-middle', pontuacao: 0.8, motivo: '', descartado: false }], assunto: null, assuntoOrigem: 'estimado', halos: [], logo: null, blocos: [{ papel: 'headline', escala: 1, width: 500, height: 180 }], contraste: [{ grupo: 'headline', camadas: [], sentido: 'claro', alvo: 149, p98SemHalo: 160, p98ComHalo: ok ? 100 : 200, tinta: 0.4, tintaCorrigida: null, ok }], assinatura: {} as ResultadoDaComposicao['diagnostico']['assinatura'], avisos: [],
} })
beforeEach(() => {
  vi.restoreAllMocks(); vi.clearAllMocks()
  mocks.paginas.mockResolvedValue({ paginas: [variante('a'), variante('b')] })
  mocks.catalogo.mockResolvedValue({ todas: [] })
  mocks.compor.mockResolvedValue(resultado())
})
describe('seleção offline foto/assinatura', () => {
  it('TERO: troca combinação com contraste ruim sem salvar tentativas', async () => {
    mocks.compor.mockImplementation(async (s: SpecDePeca) => resultado(s.foto?.driveFileId === 'escura' && s.preferencias?.variante === 'b'))
    const r = await selecionarCombinacao(spec)
    expect(r.spec.foto?.driveFileId).toBe('escura'); expect(r.spec.preferencias?.variante).toBe('b')
    expect(mocks.compor.mock.calls.every((c) => c[1].somenteAvaliar === true)).toBe(true)
    expect(r.spec.blocos).toEqual(spec.blocos)
  })
  it('Quintal: não usa variante sem serviço nem inventa papel headline2 na entrada', async () => {
    mocks.paginas.mockResolvedValue({ paginas: [variante('sem-servico', ['headline', 'headline2']), variante('quintal', ['headline', 'headline2', 'servico'])] })
    const r = await selecionarCombinacao(spec)
    expect(r.spec.preferencias?.variante).toBe('quintal'); expect(r.spec.blocos[0].linhas).toEqual(['Quarta no', 'Quintal'])
  })
  it('Real: mantém foto e variante explícitas e todas as preferências', async () => {
    const preferencias = { variante: 'b', ancora: 'topo' as const, enquadramento: 'fixo' as const, cantoDaMarca: 'inferior-direito' as const }
    const r = await selecionarCombinacao({ ...spec, foto: { driveFileId: 'escolhida' }, preferencias })
    expect(mocks.compor).toHaveBeenCalledTimes(1); expect(r.spec.foto?.driveFileId).toBe('escolhida'); expect(r.spec.preferencias).toEqual(preferencias)
  })
  it('não substitui variante explícita ausente ou incompatível', async () => {
    await expect(selecionarCombinacao({ ...spec, preferencias: { variante: 'ausente' } })).rejects.toThrow(/Nenhuma variante/)
    expect(mocks.compor).not.toHaveBeenCalled()
  })
  it('limita a seis combinações', async () => {
    mocks.paginas.mockResolvedValue({ paginas: Array.from({ length: 20 }, (_, i) => variante(String(i))) })
    await selecionarCombinacao({ ...spec, fotosCandidatas: ['a', 'b', 'c'] })
    expect(mocks.compor).toHaveBeenCalledTimes(6)
  })
  it('encerra entre tentativas ao atingir a janela', async () => {
    let now = 0; vi.spyOn(Date, 'now').mockImplementation(() => now)
    mocks.compor.mockImplementation(async () => { now = 31_000; return resultado() })
    await selecionarCombinacao(spec); expect(mocks.compor).toHaveBeenCalledTimes(1)
  })
  it('retorna diagnóstico quando nenhuma combinação funciona, sem omitir texto', async () => {
    mocks.compor.mockResolvedValue(resultado(false))
    await expect(selecionarCombinacao(spec)).rejects.toMatchObject({ code: 'SEM_COMBINACAO', details: { diagnosticos: expect.arrayContaining([expect.objectContaining({ impedimentos: expect.arrayContaining([expect.stringMatching(/Contraste insuficiente/)]) })]) } })
  })
  it('aproveita análise já existente de preço/marca sem reanalisar fotos', async () => {
    mocks.catalogo.mockResolvedValue({ todas: [{ driveFileId: 'clara', precoLegivel: true }, { driveFileId: 'escura', marcaDeTerceiro: 'cerveja' }] })
    await expect(selecionarCombinacao(spec)).rejects.toThrow(/Nenhuma combinação/)
    expect(mocks.compor).not.toHaveBeenCalled()
  })
  it('informa ausência de catálogo e não transforma assunto estimado em oclusão confirmada', async () => {
    mocks.catalogo.mockRejectedValue(new Error('offline'))
    const r = resultado(); r.diagnostico.candidatos[0].descartado = true
    expect(avaliarCombinacao(r).impedimentos).toEqual([])
    const selecao = await selecionarCombinacao(spec); expect(selecao.avisos.join(' ')).toMatch(/Catálogo indisponível/)
    r.diagnostico.assuntoOrigem = 'catalogo'; expect(avaliarCombinacao(r).impedimentos).toHaveLength(1)
  })
  it('régua ausente não recebe aprovação automática', () => {
    const r = resultado(); r.diagnostico.contraste = null
    expect(avaliarCombinacao(r).impedimentos[0]).toMatch(/não medido/)
  })
})
describe('caixa legada e catálogo v3', () => {
  it('recusa assunto textual, NaN e caixa invertida', () => {
    expect(lerCaixaDoAssunto('salao')).toBeNull()
    expect(lerCaixaDoAssunto({ x0: NaN, y0: 0, x1: 1, y1: 1 })).toBeNull()
    expect(lerCaixaDoAssunto({ x0: 0.8, y0: 0, x1: 0.2, y1: 1 })).toBeNull()
  })
  it('Quintal panorâmico: transforma o assunto por cover e pelo corte real', () => {
    const a = { x0: 0, y0: 0, x1: 0.25, y1: 1 }
    const foto = { width: 4000, height: 1000 }; const canvas = { width: 1000, height: 1000 }
    expect(assuntoEmPixels(a, foto, canvas, 'left-middle')).toEqual({ x: 0, y: 0, width: 1000, height: 1000 })
    expect(assuntoEmPixels(a, foto, canvas, 'right-middle').x).toBe(-3000)
    expect(fracaoVisivelDoAssunto(assuntoEmPixels(a, foto, canvas, 'right-middle'), canvas)).toBe(0)
    expect(fracaoVisivelDoAssunto(assuntoEmPixels(a, foto, canvas, 'left-middle'), canvas)).toBe(1)
  })
})
