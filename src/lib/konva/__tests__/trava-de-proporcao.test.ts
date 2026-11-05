import { describe, expect, it } from 'vitest'
import type { Layer } from '@/types/template'
import { ANCORAS_DOS_CANTOS, TODAS_AS_ANCORAS, controlesDaForma, travaDeProporcao } from '../trava-de-proporcao'

const camada = (id: string, type: Layer['type'], style: Layer['style'] = {}): Layer => ({
  id, type, name: id, visible: true, locked: false, order: 0, position: { x: 0, y: 0 }, size: { width: 100, height: 50 }, style,
})

const layers = [
  camada('texto', 'text'),
  camada('foto', 'image'),
  camada('logo', 'logo'),
  camada('forma', 'shape', { shapeType: 'svg-path', pathData: 'M0 0 L100 0 L50 100 Z' }),
  camada('travada', 'shape', { shapeType: 'svg-path', pathData: 'M0 0 L100 0 L50 100 Z', manterProporcao: true }),
  camada('falso', 'shape', { manterProporcao: 'true' as unknown as boolean }),
]

describe('travaDeProporcao (CP-V1)', () => {
  it('forma travada: keepRatio e só as alças dos cantos', () => {
    expect(travaDeProporcao(layers, ['travada'], false)).toEqual({ keepRatio: true, ancoras: ANCORAS_DOS_CANTOS })
  })

  it('sem a trava, nada muda: forma e texto livres com as 8 alças; imagem e logo proporcionais com as 8', () => {
    expect(travaDeProporcao(layers, ['forma'], false)).toEqual({ keepRatio: false, ancoras: TODAS_AS_ANCORAS })
    expect(travaDeProporcao(layers, ['texto'], false)).toEqual({ keepRatio: false, ancoras: TODAS_AS_ANCORAS })
    expect(travaDeProporcao(layers, ['foto'], false)).toEqual({ keepRatio: true, ancoras: TODAS_AS_ANCORAS })
    expect(travaDeProporcao(layers, ['logo'], false)).toEqual({ keepRatio: true, ancoras: TODAS_AS_ANCORAS })
    expect(TODAS_AS_ANCORAS).toHaveLength(8)
  })

  it('Shift continua travando a proporção de qualquer seleção, sem tirar alças', () => {
    expect(travaDeProporcao(layers, ['texto'], true)).toEqual({ keepRatio: true, ancoras: TODAS_AS_ANCORAS })
    expect(travaDeProporcao(layers, ['forma'], true)).toEqual({ keepRatio: true, ancoras: TODAS_AS_ANCORAS })
  })

  it('só true literal trava; a trava em camada que não é forma não vale', () => {
    expect(travaDeProporcao(layers, ['falso'], false)).toEqual({ keepRatio: false, ancoras: TODAS_AS_ANCORAS })
    const textoComTrava = [camada('t', 'text', { manterProporcao: true })]
    expect(travaDeProporcao(textoComTrava, ['t'], false)).toEqual({ keepRatio: false, ancoras: TODAS_AS_ANCORAS })
  })

  it('multisseleção: uma forma travada trava o grupo todo pelos cantos; sem ela, a regra de antes', () => {
    expect(travaDeProporcao(layers, ['texto', 'travada'], false)).toEqual({ keepRatio: true, ancoras: ANCORAS_DOS_CANTOS })
    expect(travaDeProporcao(layers, ['texto', 'forma'], false)).toEqual({ keepRatio: false, ancoras: TODAS_AS_ANCORAS })
    expect(travaDeProporcao(layers, ['texto', 'foto'], false)).toEqual({ keepRatio: true, ancoras: TODAS_AS_ANCORAS })
  })

  it('forma nativa travada (retângulo, círculo): mesma trava que o svg-path', () => {
    const nativas = [camada('r', 'shape', { shapeType: 'rectangle', manterProporcao: true }), camada('c', 'shape', { shapeType: 'circle', manterProporcao: true })]
    expect(travaDeProporcao(nativas, ['r'], false)).toEqual({ keepRatio: true, ancoras: ANCORAS_DOS_CANTOS })
    expect(travaDeProporcao(nativas, ['c'], false)).toEqual({ keepRatio: true, ancoras: ANCORAS_DOS_CANTOS })
  })

  it('seleção vazia ou com ids que não existem: livre', () => {
    expect(travaDeProporcao(layers, [], false)).toEqual({ keepRatio: false, ancoras: TODAS_AS_ANCORAS })
    expect(travaDeProporcao(layers, ['sumiu'], false)).toEqual({ keepRatio: false, ancoras: TODAS_AS_ANCORAS })
  })
})

describe('controlesDaForma (CP-V1): o que o painel da forma mostra', () => {
  it('trava em TODA forma; espelho só no svg-path', () => {
    for (const shapeType of ['rectangle', 'rounded-rectangle', 'circle', 'triangle', 'star', 'arrow', 'line'] as const) {
      expect(controlesDaForma({ type: 'shape', style: { shapeType } }), shapeType).toEqual({ trava: true, espelho: false })
    }
    expect(controlesDaForma({ type: 'shape', style: { shapeType: 'svg-path' } })).toEqual({ trava: true, espelho: true })
    expect(controlesDaForma({ type: 'shape', style: {} })).toEqual({ trava: true, espelho: false })
  })

  it('o que não é forma não ganha nenhum dos dois por aqui (a imagem segue com o espelho da própria barra)', () => {
    for (const type of ['text', 'image', 'logo', 'element', 'gradient'] as const) {
      expect(controlesDaForma({ type, style: { shapeType: 'svg-path' } }), type).toEqual({ trava: false, espelho: false })
    }
  })
})
