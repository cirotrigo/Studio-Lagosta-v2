/**
 * A máscara da geração: zonas do diretor → área editável, com folga, canto da
 * marca e teto. A parte com sharp (PNG, diferença de pixels) é medida no
 * script de produção; aqui só a matemática.
 */
import { describe, expect, it } from 'vitest'
import { LOGO_ALTURA, LOGO_LARGURA, MARGEM_X, MARGEM_Y, fracaoEditavel, zonasEditaveis } from '../mascara-da-geracao'

describe('zonasEditaveis', () => {
  it('põe folga em volta da zona e recorta ao quadro', () => {
    const [z] = zonasEditaveis([{ nome: 'bloco principal', x0: 0.05, x1: 0.6, y0: 0.12, y1: 0.32 }])
    expect(z.x0).toBe(0)
    expect(z.x1).toBeCloseTo(0.6 + MARGEM_X)
    expect(z.y0).toBeCloseTo(0.12 - MARGEM_Y)
    expect(z.y1).toBeCloseTo(0.32 + MARGEM_Y)
    expect(z.origem).toBe('briefing')
  })
  it('descarta zona inválida em silêncio, e aceita x0/x1 trocados', () => {
    expect(zonasEditaveis([{ nome: 'x', x0: 0.5, x1: 0.5, y0: 0.5, y1: 0.5 }])).toEqual([])
    expect(zonasEditaveis([{ nome: 'x', x0: NaN as number, x1: 1, y0: 0, y1: 1 }])).toEqual([])
    expect(zonasEditaveis([{ nome: 'x', x1: 0.9 }])).toEqual([])
    const [z] = zonasEditaveis([{ nome: 'rodapé', x0: 0.9, x1: 0.1, y0: 0.94, y1: 0.88 }])
    expect(z.x0).toBeLessThan(z.x1)
    expect(z.y0).toBeLessThan(z.y1)
  })
  it('acrescenta o canto da marca quando o modelo a desenha', () => {
    const zonas = zonasEditaveis([{ nome: 'bloco', x0: 0.1, x1: 0.5, y0: 0.1, y1: 0.3 }], { cantoDaLogo: 'top-right' })
    const logo = zonas.find((z) => z.origem === 'logo')!
    expect(logo).toMatchObject({ x0: 1 - LOGO_LARGURA, x1: 1, y0: 0, y1: LOGO_ALTURA })
    const baixo = zonasEditaveis([], { cantoDaLogo: 'bottom-left' })[0]
    expect(baixo).toMatchObject({ x0: 0, x1: LOGO_LARGURA, y0: 1 - LOGO_ALTURA, y1: 1 })
  })
})

describe('fracaoEditavel', () => {
  it('mede a união das zonas, sem contar sobreposição duas vezes', () => {
    const zonas = zonasEditaveis(
      [
        { nome: 'a', x0: 0, x1: 0.5, y0: 0, y1: 0.5 },
        { nome: 'b', x0: 0, x1: 0.5, y0: 0, y1: 0.5 },
      ],
      { margemX: 0, margemY: 0 },
    )
    expect(fracaoEditavel(zonas)).toBeCloseTo(0.25, 2)
    expect(fracaoEditavel([])).toBe(0)
  })
})
