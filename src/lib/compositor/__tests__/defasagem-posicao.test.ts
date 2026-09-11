import { describe, expect, it } from 'vitest'

import { specComAPosicaoOriginal } from '../defasagem'
import type { SpecDePeca } from '../spec'

const spec = (preferencias?: SpecDePeca['preferencias']): SpecDePeca =>
  ({
    projectId: 1,
    formato: 'story',
    blocos: [{ papel: 'headline', linhas: ['Dia do Milk-shake', 'em Dobro'] }],
    ...(preferencias ? { preferencias } : {}),
  }) as SpecDePeca

const composicao = (ancora: unknown, alinha: unknown) => ({ composicao: { posicao: { ancora, alinha, crop: 'center-middle' } } })

describe('posição da peça na recomposição', () => {
  it('fixa a âncora e o alinhamento da composição original, mantendo as outras preferências', () => {
    const r = specComAPosicaoOriginal(spec({ cantoDaMarca: 'superior-direito' }), composicao('topo', 'esquerda'))
    expect(r.preferencias).toEqual({ cantoDaMarca: 'superior-direito', ancora: 'topo', alinha: 'esquerda' })
  })

  it('spec que já pede posição fica como está', () => {
    const pedida = spec({ alinha: 'direita' })
    expect(specComAPosicaoOriginal(pedida, composicao('topo', 'esquerda'))).toBe(pedida)
  })

  it('sem composição original legível, nada muda', () => {
    const s = spec()
    expect(specComAPosicaoOriginal(s, null)).toBe(s)
    expect(specComAPosicaoOriginal(s, {})).toBe(s)
    expect(specComAPosicaoOriginal(s, composicao('lado', 'esquerda'))).toBe(s)
  })

  it('"auto" na spec não é pedido: a posição original vale', () => {
    const r = specComAPosicaoOriginal(spec({ ancora: 'auto', alinha: 'auto' }), composicao('rodape', 'centro'))
    expect(r.preferencias).toMatchObject({ ancora: 'rodape', alinha: 'centro' })
  })
})
