/**
 * L4 das linhas-guia (29/10/2026): guias manuais por pessoa e por página — leitura do localStorage, geração dentro da
 * margem da marca, encaixe e réguas.
 */
import { describe, expect, it } from 'vitest'

import { margensDoEditor } from '@/lib/canvas-margin'
import { computeAlignmentGuides, DEFAULT_SNAP_CONFIG } from '@/lib/konva-smart-guides'
import { acrescentarGuias, cairForaDaPagina, chaveDasGuias, gerarGuias, GUIAS_VAZIAS, lerGuias, marcasDaRegua, MAX_COLUNAS, paradasDasGuias, retangulosDasGuias } from '@/lib/guias-manuais'

const story = margensDoEditor({ formato: 'story', assinatura: null, largura: 1080, altura: 1920 })

describe('lerGuias', () => {
  it('sem nada, com lixo e com guia inválida: só as válidas ficam; flags só quando true', () => {
    expect(lerGuias(null)).toEqual(GUIAS_VAZIAS)
    expect(lerGuias('{nope')).toEqual(GUIAS_VAZIAS)
    expect(lerGuias(JSON.stringify({ guias: [{ id: 'a', orientacao: 'vertical', posicao: 283 }, { orientacao: 'diagonal', posicao: 1 }, { orientacao: 'horizontal', posicao: 'x' }, { orientacao: 'horizontal', posicao: 500 }], ocultas: 'sim', travadas: true }))).toEqual({
      guias: [
        { id: 'a', orientacao: 'vertical', posicao: 283 },
        { id: 'horizontal-500', orientacao: 'horizontal', posicao: 500 },
      ],
      ocultas: false,
      travadas: true,
    })
    expect(chaveDasGuias('user_1', 'p1')).toBe('lagosta:editor:guias:user_1:p1') // por pessoa E por página
  })
})

describe('gerarGuias — dentro da margem da marca, assimétrica no Story', () => {
  it('2 colunas com 40 de espaçamento no Story padrão (92…988): bordas 92, 520, 560, 988', () => {
    const g = gerarGuias({ colunas: 2, linhas: 0, espacamento: 40, marca: story.marca })
    expect(g.map((x) => [x.orientacao, x.posicao])).toEqual([
      ['vertical', 92],
      ['vertical', 520],
      ['vertical', 560],
      ['vertical', 988],
    ])
  })

  it('3 linhas com 40 no Story: começam em 188 e terminam em 1696 (não 1732 como na página inteira do Canva)', () => {
    const g = gerarGuias({ colunas: 0, linhas: 3, espacamento: 40, marca: story.marca })
    const ys = g.map((x) => x.posicao)
    expect(ys[0]).toBe(188)
    expect(ys[ys.length - 1]).toBe(1696)
    expect(ys).toHaveLength(6)
  })

  it('1 coluna sem espaçamento = as duas margens; 0 colunas = nada; espaçamento maior que a área = nada', () => {
    expect(gerarGuias({ colunas: 1, linhas: 0, espacamento: 0, marca: story.marca }).map((x) => x.posicao)).toEqual([92, 988])
    expect(gerarGuias({ colunas: 0, linhas: 0, espacamento: 0, marca: story.marca })).toEqual([])
    expect(gerarGuias({ colunas: 3, linhas: 0, espacamento: 600, marca: story.marca })).toEqual([])
  })
})

describe('encaixe e réguas', () => {
  const estado = { guias: [{ id: 'v', orientacao: 'vertical' as const, posicao: 283 }, { id: 'h', orientacao: 'horizontal' as const, posicao: 900 }], ocultas: false, travadas: false }

  it('a caixa a 3 px da guia vertical encaixa em 283; guias ocultas não são alvo', () => {
    const r = computeAlignmentGuides({ id: 't', x: 286, y: 500, width: 200, height: 50 }, retangulosDasGuias(estado, 1080, 1920), 1080, 1920, { ...DEFAULT_SNAP_CONFIG, enabled: true, threshold: 5 })
    expect(r.position.x).toBe(283)
    expect(retangulosDasGuias({ ...estado, ocultas: true }, 1080, 1920)).toEqual([])
    expect(paradasDasGuias(estado)).toEqual({ v: [283], h: [900] })
    expect(paradasDasGuias({ ...estado, ocultas: true })).toEqual({ v: [], h: [] })
  })

  it('solta de volta na régua (fora da página) apaga; dentro fica', () => {
    expect(cairForaDaPagina(-5, 1080)).toBe(true)
    expect(cairForaDaPagina(1081, 1080)).toBe(true)
    expect(cairForaDaPagina(NaN, 1080)).toBe(true)
    expect(cairForaDaPagina(0, 1080)).toBe(false)
    expect(cairForaDaPagina(1080, 1080)).toBe(false)
  })

  it('marcas da régua: passo pelo zoom (50% → 50 px), em px do design, com a maior a cada 100', () => {
    const m = marcasDaRegua(1080, 0.5)
    expect(m[0]).toEqual({ posicao: 0, maior: true })
    expect(m[1]).toEqual({ posicao: 50, maior: false })
    expect(m[2]).toEqual({ posicao: 100, maior: true })
    expect(m[m.length - 1].posicao).toBe(1050)
    expect(marcasDaRegua(1080, 0.2).map((x) => x.posicao)).toEqual([0, 200, 400, 600, 800, 1000])
  })
})

describe('ajustes da revisão R1', () => {
  it('acrescentarGuias: posição ocupada não entra e toda guia nova ganha id único (gerar, mover, gerar de novo)', () => {
    const marca = story.marca
    const primeiras = acrescentarGuias([], gerarGuias({ colunas: 2, linhas: 0, espacamento: 40, marca }))
    const movidas = primeiras.map((g, i) => (i === 0 ? { ...g, posicao: 150 } : g))
    const depois = acrescentarGuias(movidas, gerarGuias({ colunas: 2, linhas: 0, espacamento: 40, marca }))
    expect(depois.map((g) => g.posicao)).toEqual([150, 520, 560, 988, 92])
    expect(new Set(depois.map((g) => g.id)).size).toBe(depois.length)
    expect(acrescentarGuias(primeiras, gerarGuias({ colunas: 2, linhas: 0, espacamento: 40, marca }))).toHaveLength(4)
  })

  it('gerarGuias: colunas acima do teto, NaN e Infinity não travam a prévia', () => {
    // sem espaçamento as colunas vizinhas dividem a borda: 24 colunas = 25 posições únicas
    expect(gerarGuias({ colunas: 1e9, linhas: 0, espacamento: 0, marca: story.marca }).length).toBe(MAX_COLUNAS + 1)
    expect(gerarGuias({ colunas: NaN, linhas: Infinity, espacamento: NaN, marca: story.marca })).toEqual([])
  })
})
