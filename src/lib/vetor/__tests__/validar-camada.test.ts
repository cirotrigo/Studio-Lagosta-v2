/**
 * CP-X2a — `problemasDoVetor`: dado inválido da camada `svg-path`, sobre valor CRU (nunca lança).
 * Contrato: preflight X2 v2.1 §4.2.
 */
import { describe, expect, it } from 'vitest'
import { SHAPES_LIBRARY } from '@/lib/assets/shapes-library'
import { MAX_PARTES, VetorInvalido, ehCandidatoVetorial, problemasDoVetor, problemasDosVetores } from '../validar-camada'

const PATH = 'M10 10 L90 10 L90 90 Z'
const vetor = (style: Record<string, unknown> = {}, extra: Record<string, unknown> = {}) => ({
  id: 'v', type: 'shape', position: { x: 0, y: 0 }, size: { width: 100, height: 100 },
  style: { shapeType: 'svg-path', pathData: PATH, ...style },
  ...extra,
})
const codigos = (c: unknown) => problemasDoVetor(c).map((p) => p.codigo)

describe('candidato vetorial', () => {
  it('é type shape + style.shapeType svg-path (o formato Layer real)', () => {
    expect(ehCandidatoVetorial(vetor())).toBe(true)
    expect(ehCandidatoVetorial(vetor({ pathData: undefined }))).toBe(true)
    expect(ehCandidatoVetorial({ ...vetor(), type: 'image' })).toBe(false)
    expect(ehCandidatoVetorial(vetor({ shapeType: 'rectangle' }))).toBe(false)
    // shapeType na raiz NÃO é candidato (a revisão do Codex, ponto 1)
    expect(ehCandidatoVetorial({ type: 'shape', shapeType: 'svg-path', pathData: 'x' })).toBe(false)
    expect(ehCandidatoVetorial({ type: 'shape', style: 'svg-path' })).toBe(false)
    for (const lixo of [null, undefined, 1, 'x', []]) expect(ehCandidatoVetorial(lixo)).toBe(false)
  })

  it('não-candidato não gera problema, mesmo com cor de tipo errado', () => {
    expect(problemasDoVetor({ id: 'r', type: 'shape', style: { shapeType: 'rectangle', fill: 123 } })).toEqual([])
    expect(problemasDoVetor({ id: 't', type: 'text', style: { color: {} } })).toEqual([])
  })
})

describe('problemasDoVetor', () => {
  it.each<[string, unknown, string[]]>([
    ['ok', vetor(), []],
    ['ok com tudo preenchido', vetor({ pathViewBox: [0, 0, 100, 100], pathFillRule: 'evenodd', fill: 'rgba(249, 115, 22, 1)', strokeColor: '#0f766e', border: { color: '#000', width: 2 } }), []],
    ['ok com cores ausentes, null e vazias', vetor({ fill: null, strokeColor: '', border: {} }), []],
    ['path ausente', vetor({ pathData: undefined }), ['PATH_AUSENTE']],
    ['path null', vetor({ pathData: null }), ['PATH_AUSENTE']],
    ['path só espaços', vetor({ pathData: '   ' }), ['PATH_AUSENTE']],
    ['path inválido', vetor({ pathData: 'hello' }), ['PATH_INVALIDO:NAO_COMECA_COM_M']],
    ['path > 16 KB', vetor({ pathData: `M0 0 ${'L1 1 '.repeat(4000)}` }), ['PATH_INVALIDO:GRANDE_DEMAIS']],
    ['path de tipo errado', vetor({ pathData: 42 }), ['PATH_INVALIDO:NAO_E_TEXTO']],
    ['viewBox null', vetor({ pathViewBox: null }), ['VIEWBOX_INVALIDO']],
    ['viewBox com 3 números', vetor({ pathViewBox: [0, 0, 100] }), ['VIEWBOX_INVALIDO']],
    ['viewBox com NaN', vetor({ pathViewBox: [0, 0, Number.NaN, 100] }), ['VIEWBOX_INVALIDO']],
    ['viewBox com área 0', vetor({ pathViewBox: [0, 0, 100, 0] }), ['VIEWBOX_INVALIDO']],
    ['fillRule fora do enum', vetor({ pathFillRule: 'even-odd' }), ['FILLRULE_INVALIDA']],
    ['fillRule null', vetor({ pathFillRule: null }), ['FILLRULE_INVALIDA']],
    ['fill numérico (não lança)', vetor({ fill: 123 }), ['COR_INVALIDA:fill']],
    ['fill ilegível', vetor({ fill: 'banana' }), ['COR_INVALIDA:fill']],
    ['fill currentcolor', vetor({ fill: 'currentcolor' }), ['COR_INVALIDA:fill']],
    ['strokeColor objeto', vetor({ strokeColor: {} }), ['COR_INVALIDA:strokeColor']],
    ['strokeColor inherit', vetor({ strokeColor: 'inherit' }), ['COR_INVALIDA:strokeColor']],
    ['border string', vetor({ border: 'x' }), ['BORDA_INVALIDA']],
    ['border null', vetor({ border: null }), ['BORDA_INVALIDA']],
    ['border.color numérico', vetor({ border: { color: 5 } }), ['COR_INVALIDA:border.color']],
    ['border.color inválido mesmo com largura 0', vetor({ border: { color: 'banana', width: 0 } }), ['COR_INVALIDA:border.color']],
    ['border.color inválido mesmo com strokeColor válido', vetor({ strokeColor: '#000', border: { color: 'x' } }), ['COR_INVALIDA:border.color']],
    ['partes vazias', vetor({ vetor: { partes: [] } }), ['PARTES_INVALIDAS']],
    ['partes null', vetor({ vetor: { partes: null } }), ['PARTES_INVALIDAS']],
    // CP-V5: a parte completa tem slot e alvo, e o slot tem cor; cada caso abaixo isola UM problema
    [`partes com ${MAX_PARTES + 1}`, vetor({ vetor: { partes: Array.from({ length: MAX_PARTES + 1 }, () => ({ d: PATH, slot: 'a', alvo: 'fill' })), cores: { a: '#000' } } }), ['PARTES_DEMAIS']],
    ['parte com d inválido', vetor({ vetor: { partes: [{ d: PATH, slot: 'a', alvo: 'fill' }, { d: 'x', slot: 'a', alvo: 'fill' }], cores: { a: '#000' } } }), ['PARTE_PATH_INVALIDO:1:CARACTERE_INVALIDO']],
    ['parte sem d', vetor({ vetor: { partes: [{ slot: 'a', alvo: 'fill' }], cores: { a: '#000' } } }), ['PARTE_PATH_INVALIDO:0:NAO_E_TEXTO']],
    ['parte que não é objeto', vetor({ vetor: { partes: ['M0 0'], cores: {} } }), ['PARTES_INVALIDAS']],
    ['parte com fillRule inválida', vetor({ vetor: { partes: [{ d: PATH, slot: 'a', alvo: 'fill', fillRule: 'x' }], cores: { a: '#000' } } }), ['PARTES_INVALIDAS']],
    ['partes válidas (8 partes, 4 slots com cor, fill e stroke)', vetor({ vetor: { partes: Array.from({ length: MAX_PARTES }, (_, i) => ({ d: PATH, slot: `s${i % 4}`, alvo: i % 2 ? 'stroke' : 'fill', fillRule: 'evenodd' })), cores: { s0: '#000', s1: 'rgba(0,0,0,0.5)', s2: 'transparent', s3: 'red' } } }), []],
    ['vetor sem partes', vetor({ vetor: { asset: 'onda' } }), []],
    ['vários problemas juntos', vetor({ pathData: undefined, pathViewBox: null, fill: 1 }), ['PATH_AUSENTE', 'VIEWBOX_INVALIDO', 'COR_INVALIDA:fill']],
  ])('%s', (_nome, camada, esperado) => {
    expect(codigos(camada)).toEqual(esperado)
  })

  it('efeitos (sombra, blur) NÃO são dado inválido — são limite da prévia do X1', () => {
    expect(codigos(vetor({ shadow: { color: '#000' } }, { effects: { blur: { enabled: true, blurRadius: 30 }, shadow: { enabled: true } } }))).toEqual([])
  })

  it('flipH/flipV/tracoPontas não entram no contrato', () => {
    expect(codigos(vetor({ flipH: 'sim', flipV: 1, tracoPontas: 'x' }))).toEqual([])
  })

  it('nunca lança, qualquer que seja a entrada', () => {
    const estranhos: unknown[] = [vetor({ pathViewBox: { a: 1 } }), vetor({ vetor: 5 }), vetor({ fill: Symbol('x') }), vetor({ border: [] })]
    for (const e of estranhos) expect(() => problemasDoVetor(e)).not.toThrow()
  })

  it('aceita todo svg-path da biblioteca de formas (26 itens)', () => {
    const itens = SHAPES_LIBRARY.filter((s) => s.shapeType === 'svg-path')
    expect(itens.length).toBeGreaterThanOrEqual(26)
    for (const s of itens) {
      const camada = { id: s.id, type: 'shape', style: { shapeType: 'svg-path', pathData: s.pathData, pathFillRule: s.pathFillRule, fill: s.fill, strokeColor: s.strokeColor } }
      expect([s.id, codigos(camada)]).toEqual([s.id, []])
    }
  })
})

describe('problemasDosVetores e VetorInvalido', () => {
  it('devolve só as camadas com problema, com id ou posição', () => {
    const camadas = [vetor(), { type: 'text', id: 't' }, { ...vetor({ pathData: 'x' }), id: undefined }, vetor({ fill: 1 }, { id: 'c' })]
    expect(problemasDosVetores(camadas)).toEqual([
      { id: '#2', motivos: [expect.objectContaining({ codigo: 'PATH_INVALIDO:CARACTERE_INVALIDO' })] },
      { id: 'c', motivos: [expect.objectContaining({ codigo: 'COR_INVALIDA:fill', campo: 'style.fill' })] },
    ])
    expect(problemasDosVetores('não é lista')).toEqual([])
  })

  it('VetorInvalido carrega as camadas e o código', () => {
    const e = new VetorInvalido(problemasDosVetores([vetor({ pathData: undefined })]))
    expect(e).toBeInstanceOf(Error)
    expect(e.codigo).toBe('VETOR_INVALIDO')
    expect(e.camadas[0].motivos[0].codigo).toBe('PATH_AUSENTE')
    expect(e.message).toContain('PATH_AUSENTE')
  })
})
