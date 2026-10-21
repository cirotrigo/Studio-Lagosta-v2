/**
 * CP-X1 — prévia do /gerar-criativo para `svg-path`: diagnóstico (o que a prévia NÃO desenha
 * é recusado), opacidade local com trim, trava de proporção e, como COMPLEMENTO (não é o gate),
 * o config da prévia desenhado pelo Konva real no Node × o servidor no mesmo canvas.
 * O gate é o CanvasPreview real no navegador: tests/harness/cp-x1.
 */
import { describe, expect, it } from 'vitest'
import type { Layer } from '@/types/template'
import {
  VERSAO_DA_PREVIA,
  configDoSvgPathNaPrevia,
  diagnosticoDoVetor,
  ehCandidatoVetorial,
  temVetorDesenhado,
  travaDaPrevia,
  vetoresComProblema,
} from '../previa-do-vetor'
import { applyOpacityToColor, getShapeChannelOpacity } from '../opacidade-da-previa'
import { comparar, pixelsDoKonva, pixelsDoServidor } from '@/lib/vetor/__tests__/suporte/konva-no-node'
import { CASOS_X1, FUNDO_X1 } from './suporte/fixture-x1'

const vetor = (style: Layer['style'] = {}, extra: Partial<Layer> = {}): Layer => ({
  id: 'v', type: 'shape', name: 'Onda', visible: true, locked: false, order: 0,
  position: { x: 0, y: 0 }, size: { width: 100, height: 100 },
  style: { shapeType: 'svg-path', pathData: 'M10 10 L90 10 L90 90 Z', ...style },
  ...extra,
})
const codigos = (l: Layer) => diagnosticoDoVetor(l).map((m) => (m.detalhe ? `${m.codigo}:${m.detalhe}` : m.codigo))

describe('candidato vetorial', () => {
  it('é shape + svg-path, com ou sem pathData', () => {
    expect(ehCandidatoVetorial(vetor())).toBe(true)
    expect(ehCandidatoVetorial(vetor({ pathData: undefined }))).toBe(true)
    expect(ehCandidatoVetorial(vetor({ shapeType: 'rectangle' }))).toBe(false)
    expect(ehCandidatoVetorial({ ...vetor(), type: 'image' })).toBe(false)
  })

  it('desenhado = fora de hiddenLayerIds e visible !== false', () => {
    expect(temVetorDesenhado([vetor()], new Set())).toBe(true)
    expect(temVetorDesenhado([vetor()], new Set(['v']))).toBe(false)
    expect(temVetorDesenhado([vetor({}, { visible: false })], new Set())).toBe(false)
  })
})

describe('diagnosticoDoVetor', () => {
  it.each<[string, Layer, string[]]>([
    ['ok', vetor(), []],
    ['path ausente', vetor({ pathData: undefined }), ['PATH_AUSENTE']],
    ['path vazio', vetor({ pathData: '  ' }), ['PATH_AUSENTE']],
    ['path inválido', vetor({ pathData: 'hello' }), ['PATH_INVALIDO:NAO_COMECA_COM_M']],
    ['path > 16 KB', vetor({ pathData: `M0 0 ${'L1 1 '.repeat(4000)}` }), ['PATH_INVALIDO:GRANDE_DEMAIS']],
    ['viewBox ausente vale', vetor({ pathViewBox: undefined }), []],
    ['viewBox null é presente e malformado', vetor({ pathViewBox: null as unknown as [number, number, number, number] }), ['VIEWBOX_INVALIDO']],
    ['viewBox com 3 números', vetor({ pathViewBox: [0, 0, 100] as unknown as [number, number, number, number] }), ['VIEWBOX_INVALIDO']],
    ['viewBox com NaN', vetor({ pathViewBox: [0, 0, Number.NaN, 100] }), ['VIEWBOX_INVALIDO']],
    ['viewBox com área 0', vetor({ pathViewBox: [0, 0, 100, 0] }), ['VIEWBOX_INVALIDO']],
    ['sombra', vetor({}, { effects: { shadow: { enabled: true, shadowColor: '#000', shadowBlur: 4, shadowOffsetX: 0, shadowOffsetY: 2, shadowOpacity: 1 } } }), ['EFEITO_SEM_SUPORTE:shadow']],
    ['sombra desligada', vetor({}, { effects: { shadow: { enabled: false, shadowColor: '#000', shadowBlur: 4, shadowOffsetX: 0, shadowOffsetY: 2, shadowOpacity: 1 } } }), []],
    ['desfoque (halo)', vetor({}, { effects: { blur: { enabled: true, blurRadius: 30 } } }), ['EFEITO_SEM_SUPORTE:blur']],
    ['desfoque com raio 0 (o servidor não desenha)', vetor({}, { effects: { blur: { enabled: true, blurRadius: 0 } } }), []],
    ['outro efeito ligado', vetor({}, { effects: { stroke: { enabled: true, strokeColor: '#000', strokeWidth: 2 } } }), ['EFEITO_SEM_SUPORTE:stroke']],
    ['sombra antiga em style.shadow', vetor({ shadow: { offsetX: 1, offsetY: 1, blur: 2, color: '#000' } as never }), ['EFEITO_SEM_SUPORTE:style.shadow']],
    ['vetor de várias cores (CP-V5)', vetor({ vetor: { partes: [{ d: 'M0 0' }] } } as never), ['EFEITO_SEM_SUPORTE:vetor.partes']],
  ])('%s', (_nome, layer, esperado) => {
    expect(codigos(layer)).toEqual(esperado)
  })

  it('vetoresComProblema só olha o vetor desenhado e devolve id, nome e motivos', () => {
    const ruim = vetor({ pathData: 'hello' })
    expect(vetoresComProblema([ruim], new Set())).toEqual([
      { id: 'v', nome: 'Onda', motivos: [expect.objectContaining({ codigo: 'PATH_INVALIDO' })] },
    ])
    expect(vetoresComProblema([ruim], new Set(['v']))).toEqual([])
    expect(vetoresComProblema([{ ...ruim, visible: false }], new Set())).toEqual([])
    expect(vetoresComProblema([{ ...ruim, style: { ...ruim.style, shapeType: 'rectangle' } }], new Set())).toEqual([])
  })

  it('a marca de compatibilidade é literal', () => {
    expect(VERSAO_DA_PREVIA).toBe('vetor-v1')
  })
})

describe('opacidade da prévia (helper local)', () => {
  it('aplica o canal em hex com espaço nas pontas (antes caía fora do startsWith)', () => {
    expect(applyOpacityToColor(' #111111 ', 0.5)).toBe('rgba(17, 17, 17, 0.5)')
    expect(applyOpacityToColor('#111111', 0.5)).toBe('rgba(17, 17, 17, 0.5)')
  })

  it('rgba, hsl e cor nomeada', () => {
    expect(applyOpacityToColor('rgba(26, 57, 135, 0.8)', 0.5)).toBe('rgba(26, 57, 135, 0.4)')
    expect(applyOpacityToColor('hsl(10, 50%, 50%)', 0.5)).toBe('hsla(10, 50%, 50%, 0.5)')
    expect(applyOpacityToColor(' transparent ', 0.5)).toBe('transparent')
  })

  it('canal: fillOpacity/strokeOpacity, % e padrão 1', () => {
    expect(getShapeChannelOpacity(vetor({ fillOpacity: 0.3 }), 'fill')).toBe(0.3)
    expect(getShapeChannelOpacity(vetor({ strokeOpacity: '50%' } as never), 'stroke')).toBe(0.5)
    expect(getShapeChannelOpacity(vetor(), 'fill')).toBe(1)
  })
})

describe('trava de proporção da prévia', () => {
  it('forma com manterProporcao: keepRatio e só os cantos', () => {
    expect(travaDaPrevia(vetor({ manterProporcao: true }))).toEqual({
      keepRatio: true,
      ancoras: ['top-left', 'top-right', 'bottom-left', 'bottom-right'],
    })
  })

  it('o resto fica como a prévia sempre foi: livre e 8 alças (inclusive imagem)', () => {
    for (const l of [vetor(), { ...vetor(), type: 'image' as const, style: { manterProporcao: true } }, undefined]) {
      const t = travaDaPrevia(l)
      expect(t.keepRatio).toBe(false)
      expect(t.ancoras).toHaveLength(8)
    }
  })
})

describe('complemento (Node): config da prévia pelo Konva real × servidor no mesmo canvas', () => {
  it('o config carrega a opacidade da camada no nó e só a do canal na cor (como o editor)', () => {
    const alfa = CASOS_X1.find((c) => c.id === 'alfa')!.camada
    const config = configDoSvgPathNaPrevia(alfa)
    expect(config.opacity).toBe(0.6)
    expect(config.fill).toBe('rgba(26, 57, 135, 0.4)')
    expect(config.stroke).toBe('rgba(0, 0, 0, 0.5)')
    expect(config.name).toBe('alfa')
  })

  // tolerância declarada: zero no mesmo rasterizador (as mesmas operações dos dois lados).
  // Não prova React nem o navegador — isso é o harness.
  it.each(CASOS_X1.map((c) => [c.id, c] as const))('%s', async (_id, c) => {
    const previa = pixelsDoKonva(c.largura, c.altura, FUNDO_X1, configDoSvgPathNaPrevia(c.camada))
    const servidor = await pixelsDoServidor(c.largura, c.altura, FUNDO_X1, [c.camada])
    expect(comparar(previa, servidor)).toEqual({ diferentes: 0, maxDelta: 0, total: c.largura * c.altura })
  })
})
