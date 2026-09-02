import { describe, it, expect } from 'vitest'
import { applySlotValues, convertPageToDesignData, pageContainsVideoLayer } from '../page-to-design-data'

const CAMADAS = [
  { id: 'l1', name: 'titulo', type: 'text', content: 'HAPPY HOUR' },
  { id: 'l2', name: 'foto', type: 'image', fileUrl: 'https://x/y.jpg' },
]

const PAGINA = { id: 'p1', name: 'Story base', width: 1080, height: 1920, background: '#000' }

describe('convertPageToDesignData', () => {
  it('lê o array nativo e a string JSON', () => {
    expect(convertPageToDesignData({ ...PAGINA, layers: CAMADAS }).layers).toEqual(CAMADAS)
    expect(convertPageToDesignData({ ...PAGINA, layers: JSON.stringify(CAMADAS) }).layers).toEqual(CAMADAS)
  })

  // O defeito: `JSON.parse` de um nível devolvia a STRING interna tipada como
  // `Layer[]`, e ela seguia para `.some(...)` e `applySlotValues` no render
  // de publicação.
  it('lê a string DUPLA-codificada (o legado do PageSync) e aplica slots nela', () => {
    const duplo = JSON.stringify(JSON.stringify(CAMADAS))
    const design = convertPageToDesignData({ ...PAGINA, layers: duplo })
    expect(Array.isArray(design.layers)).toBe(true)
    expect(design.layers).toEqual(CAMADAS)

    const comSlots = applySlotValues(design, { titulo: 'ALMOÇO EXECUTIVO' })
    expect(comSlots.layers[0].content).toBe('ALMOÇO EXECUTIVO')
  })

  it('ilegível LANÇA com o id da página, nunca devolve [] (é render de publicação)', () => {
    expect(() => convertPageToDesignData({ ...PAGINA, layers: 'isto não é json' })).toThrow(/p1/)
    expect(() => convertPageToDesignData({ ...PAGINA, layers: '{"a":1}' })).toThrow(/ilegíveis/)
    expect(() => convertPageToDesignData({ ...PAGINA, layers: null })).toThrow(/ilegíveis/)
  })
})

describe('pageContainsVideoLayer', () => {
  it('enxerga a camada de vídeo nas três codificações', () => {
    const comVideo = [...CAMADAS, { id: 'v', name: 'clipe', type: 'video' }]
    expect(pageContainsVideoLayer(comVideo)).toBe(true)
    expect(pageContainsVideoLayer(JSON.stringify(comVideo))).toBe(true)
    expect(pageContainsVideoLayer(JSON.stringify(JSON.stringify(comVideo)))).toBe(true)
    expect(pageContainsVideoLayer(JSON.stringify(JSON.stringify(CAMADAS)))).toBe(false)
  })

  it('ilegível lança em vez de responder "não tem vídeo"', () => {
    expect(() => pageContainsVideoLayer('quebrado')).toThrow(/ilegíveis/)
  })
})
