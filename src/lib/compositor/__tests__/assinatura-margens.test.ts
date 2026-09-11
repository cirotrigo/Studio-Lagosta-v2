import { describe, expect, it } from 'vitest'

import type { Layer } from '@/types/template'

import { estiloDaCamada, montarAssinatura } from '../assinatura'

const texto = (id: string, x: number, y: number, w: number, h: number, extra: { grupo?: string; style?: Record<string, unknown> } = {}): Layer =>
  ({
    id,
    name: id,
    type: 'text',
    visible: true,
    locked: false,
    order: 0,
    rotation: 0,
    content: id,
    position: { x, y },
    size: { width: w, height: h },
    style: { fontFamily: 'Montserrat', fontSize: 40, lineHeight: 1.1, color: '#FFFFFF', textAlign: 'left', ...(extra.style ?? {}) },
    metadata: extra.grupo ? { groupId: extra.grupo } : {},
  }) as unknown as Layer

const camada = (id: string, type: string, x: number, y: number, w: number, h: number, grupo?: string): Layer =>
  ({
    id,
    name: id,
    type,
    visible: true,
    locked: false,
    order: 0,
    rotation: 0,
    fileUrl: `https://exemplo.com/${id}.png`,
    position: { x, y },
    size: { width: w, height: h },
    metadata: grupo ? { groupId: grupo } : {},
  }) as unknown as Layer

const geometria = (layers: Layer[]) =>
  montarAssinatura({
    pagina: { id: 'p', name: 'Modelo · story', tags: ['story'], width: 1080, height: 1920, layers, background: '#000000' },
    formatoDaPagina: 'story',
    numerosDoProjeto: {},
    logoDoProjeto: null,
  }).numeros.geometria.story

describe('margens tiradas da página de assinatura', () => {
  it('o rodapé útil é o do grupo de texto com os seus elementos, não o da logo solta no canto', () => {
    const g = geometria([
      texto('headline', 116, 173, 700, 217, { grupo: 'principal' }),
      texto('apoio', 117, 507, 620, 105, { grupo: 'principal' }),
      texto('servico', 71, 1684, 700, 47, { grupo: 'rodape' }),
      texto('cta', 72, 1735, 520, 65, { grupo: 'rodape' }),
      camada('traco-pincel', 'image', 76, 1801, 300, 6, 'rodape'),
      camada('logo', 'logo', 698, 1759, 300, 80),
    ])
    expect(g.safeTopo).toBe(173)
    // O traço preso ao CTA termina em 1807; a logo solta, em 1839
    expect(g.safeRodape).toBe(113)
  })

  it('a logo que mora no grupo do serviço conta para o rodapé', () => {
    const g = geometria([
      texto('headline', 90, 167, 900, 100, { grupo: 'principal' }),
      texto('servico', 453, 1651, 560, 54, { grupo: 'rodape' }),
      camada('logo', 'logo', 92, 1671, 259, 150, 'rodape'),
    ])
    expect(g.safeRodape).toBe(1920 - 1821)
  })

  it('a margem lateral é a do lado em que o texto alinha, e caixa larga não a encurta', () => {
    const g = geometria([
      texto('headline', 87, 1351, 860, 137, { grupo: 'principal' }),
      texto('apoio', 98, 1603, 800, 118, { grupo: 'oferta' }),
      // Endereço alinhado à esquerda com a caixa quase até a borda direita (sobram 22 px)
      texto('servico', 98, 1791, 960, 29, { grupo: 'endereco' }),
    ])
    expect(g.margemH).toBe(87)
  })

  it('texto alinhado à direita mede a margem pela borda direita', () => {
    const g = geometria([
      texto('headline', 300, 200, 700, 100, { style: { textAlign: 'right' } }),
      texto('apoio', 400, 320, 610, 60, { style: { textAlign: 'right' } }),
    ])
    expect(g.margemH).toBe(70)
  })
})

describe('estilo do papel', () => {
  it('o peso da fonte gravado como texto pelo editor é lido', () => {
    const peso = (fontWeight: unknown) => estiloDaCamada(texto('headline2', 70, 316, 760, 136, { style: { fontWeight } }))?.fontWeight
    expect(peso('100')).toBe(100)
    expect(peso(300)).toBe(300)
    expect(peso('bold')).toBe(700)
    expect(peso('normal')).toBeUndefined()
  })
})
