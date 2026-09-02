import { describe, expect, it } from 'vitest'
import { decidirSelecaoPorGesto, type GestoDeSelecao, type SaidaDoGesto } from '../selecao-por-gesto'

/**
 * Simula o gesto inteiro como o stage o vive: cada fase recebe a seleção que
 * a fase anterior deixou e o gesto que ela registrou.
 */
function gesto(
  fases: Array<{ phase: 'down' | 'drag' | 'click'; additive?: boolean }>,
  args: { layerId: string; groupIds?: string[]; selection: string[] },
) {
  let selection = args.selection
  let gesture: GestoDeSelecao | null = null
  const saidas: SaidaDoGesto[] = []
  for (const fase of fases) {
    const saida = decidirSelecaoPorGesto({
      phase: fase.phase,
      additive: fase.additive ?? false,
      layerId: args.layerId,
      groupIds: args.groupIds ?? [],
      selection,
      gesture,
    })
    saidas.push(saida)
    if (saida.selection) selection = saida.selection
    gesture = saida.gesture
  }
  return { selection, gesture, saidas }
}

const CLIQUE = [{ phase: 'down' as const }, { phase: 'click' as const }]
const SHIFT_CLIQUE = [{ phase: 'down' as const, additive: true }, { phase: 'click' as const, additive: true }]
const ARRASTE = [{ phase: 'down' as const }, { phase: 'drag' as const }]

describe('seleção por gesto — camadas soltas', () => {
  it('Shift+clique ADICIONA a camada e o click do mesmo gesto não a tira de volta (o defeito original)', () => {
    const r = gesto(SHIFT_CLIQUE, { layerId: 'b', selection: ['a'] })
    expect(r.saidas[0].selection).toEqual(['a', 'b'])
    expect(r.saidas[1].selection).toBeNull()
    expect(r.selection).toEqual(['a', 'b'])
    expect(r.gesture).toBeNull()
  })

  it('Shift+clique numa camada selecionada a REMOVE, e o click não a devolve', () => {
    const r = gesto(SHIFT_CLIQUE, { layerId: 'a', selection: ['a', 'b'] })
    expect(r.selection).toEqual(['b'])
  })

  it('clique simples seleciona só a camada', () => {
    const r = gesto(CLIQUE, { layerId: 'c', selection: ['a', 'b'] })
    expect(r.saidas[0].selection).toEqual(['c'])
    expect(r.saidas[1].selection).toBeNull()
    expect(r.selection).toEqual(['c'])
  })

  it('clique simples numa camada de uma seleção múltipla: a descida PRESERVA e o click reduz a ela', () => {
    const r = gesto(CLIQUE, { layerId: 'a', selection: ['a', 'b'] })
    expect(r.saidas[0].selection).toBeNull()
    expect(r.saidas[0].gesture?.keptSelection).toBe(true)
    expect(r.saidas[1].selection).toEqual(['a'])
  })

  it('arrastar uma camada de uma seleção múltipla mantém o conjunto selecionado', () => {
    const r = gesto(ARRASTE, { layerId: 'a', selection: ['a', 'b'] })
    expect(r.selection).toEqual(['a', 'b'])
    expect(r.gesture?.dragged).toBe(true)
  })

  it('click depois de arraste não decide nada', () => {
    const r = gesto([...ARRASTE, { phase: 'click' }], { layerId: 'a', selection: ['a', 'b'] })
    expect(r.selection).toEqual(['a', 'b'])
    expect(r.gesture).toBeNull()
  })

  it('click sem descida registrada é ignorado', () => {
    const saida = decidirSelecaoPorGesto({
      phase: 'click',
      additive: false,
      layerId: 'a',
      groupIds: [],
      selection: ['a', 'b'],
      gesture: null,
    })
    expect(saida).toEqual({ selection: null, gesture: null })
  })

  it('dragstart órfão com Shift (camada puxada pelo Transformer) NÃO tira a camada da seleção', () => {
    const saida = decidirSelecaoPorGesto({
      phase: 'drag',
      additive: true,
      layerId: 'b',
      groupIds: [],
      selection: ['a', 'b'],
      gesture: { layerId: 'a', selectionAtDown: ['a'], keptSelection: false, groupWasSelected: false, dragged: true },
    })
    expect(saida.selection).toBeNull()
    expect(saida.gesture).toMatchObject({ layerId: 'b', keptSelection: true, dragged: true })
  })
})

describe('seleção por gesto — grupo estilo Canva', () => {
  const grupo = ['g1', 'g2']

  it('1º clique seleciona o grupo inteiro', () => {
    const r = gesto(CLIQUE, { layerId: 'g1', groupIds: grupo, selection: ['x'] })
    expect(r.saidas[0].selection).toEqual(grupo)
    expect(r.saidas[1].selection).toBeNull()
    expect(r.selection).toEqual(grupo)
  })

  it('2º clique entra no elemento (drill-in)', () => {
    const r = gesto(CLIQUE, { layerId: 'g2', groupIds: grupo, selection: grupo })
    expect(r.saidas[0].selection).toBeNull()
    expect(r.saidas[1].selection).toEqual(['g2'])
  })

  it('arrastar o grupo selecionado não entra no elemento', () => {
    const r = gesto([...ARRASTE, { phase: 'click' }], { layerId: 'g2', groupIds: grupo, selection: grupo })
    expect(r.selection).toEqual(grupo)
  })

  it('já "dentro" do grupo, clicar no irmão seleciona só ele', () => {
    const r = gesto(CLIQUE, { layerId: 'g2', groupIds: grupo, selection: ['g1'] })
    expect(r.selection).toEqual(['g2'])
  })

  it('grupo dentro de uma seleção maior: o click reduz ao grupo, não ao elemento', () => {
    const r = gesto(CLIQUE, { layerId: 'g1', groupIds: grupo, selection: ['x', ...grupo] })
    expect(r.saidas[0].selection).toBeNull()
    expect(r.saidas[1].selection).toEqual(grupo)
  })

  it('Shift+clique põe o grupo inteiro; de novo, tira o grupo inteiro', () => {
    const entra = gesto(SHIFT_CLIQUE, { layerId: 'g1', groupIds: grupo, selection: ['x'] })
    expect(entra.selection).toEqual(['x', 'g1', 'g2'])
    const sai = gesto(SHIFT_CLIQUE, { layerId: 'g2', groupIds: grupo, selection: entra.selection })
    expect(sai.selection).toEqual(['x'])
  })

  it('já "dentro" do grupo, Shift+clique alterna só a camada', () => {
    const r = gesto(SHIFT_CLIQUE, { layerId: 'g2', groupIds: grupo, selection: ['g1'] })
    expect(r.selection).toEqual(['g1', 'g2'])
  })

  it('grupo de um membro só não é grupo', () => {
    const r = gesto(CLIQUE, { layerId: 'g1', groupIds: ['g1'], selection: ['x'] })
    expect(r.selection).toEqual(['g1'])
  })
})
