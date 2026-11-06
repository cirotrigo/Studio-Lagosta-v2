import { describe, expect, it } from 'vitest'
import type { Layer } from '@/types/template'
import { classificarRichText, converterCamada, converterCamadasDaPagina } from '../converter-rich-text'

const rich = (over: Record<string, unknown>): Layer =>
  ({
    id: 'l1',
    type: 'rich-text',
    name: 'Título',
    content: 'Picanha na brasa hoje',
    style: { color: '#ffffff', fontFamily: 'Montserrat', fontSize: 80 },
    richTextStyles: [],
    ...over,
  }) as unknown as Layer

const NA_BRASA = { start: 8, end: 16 } // "na brasa"

describe('classificarRichText', () => {
  it('um estilo de destaque → conversível, com os colchetes de volta', () => {
    const c = classificarRichText(rich({ richTextStyles: [{ ...NA_BRASA, fill: '#ff6a00', fontFamily: 'Montserrat Bold' }] }))
    expect(c).toMatchObject({
      veredito: 'conversivel',
      destaques: [{ inicio: 8, fim: 16 }],
      destaque: { fill: '#ff6a00', fontFamily: 'Montserrat Bold' },
      sombra: null,
      conteudoMarcado: 'Picanha [na brasa] hoje',
    })
  })

  it('o mesmo estilo em dois trechos → um destaque, dois trechos', () => {
    const c = classificarRichText(
      rich({ richTextStyles: [{ start: 0, end: 7, fill: '#f00' }, { start: 17, end: 21, fill: '#f00' }] }),
    )
    expect(c).toMatchObject({ veredito: 'conversivel', destaques: [{ inicio: 0, fim: 7 }, { inicio: 17, fim: 21 }], conteudoMarcado: '[Picanha] na brasa [hoje]' })
  })

  it('duas cores na mesma frase → não conversível', () => {
    const c = classificarRichText(rich({ richTextStyles: [{ start: 0, end: 7, fill: '#f00' }, { ...NA_BRASA, fill: '#0f0' }] }))
    expect(c).toMatchObject({ veredito: 'nao-conversivel', motivo: 'dois-estilos' })
  })

  it('trecho com a cor e a família da base não é destaque; sem nenhum, não converte', () => {
    expect(classificarRichText(rich({ richTextStyles: [{ ...NA_BRASA, fill: '#FFFFFF', fontFamily: 'Montserrat' }] }))).toMatchObject({ motivo: 'sem-destaque' })
    expect(classificarRichText(rich({ richTextStyles: [] }))).toMatchObject({ motivo: 'sem-trechos' })
  })

  it('tamanho, espaçamento ou contorno por trecho → não conversível; o igual à base passa', () => {
    expect(classificarRichText(rich({ richTextStyles: [{ ...NA_BRASA, fill: '#f00', fontSize: 120 }] }))).toMatchObject({ motivo: 'tamanho-por-trecho' })
    expect(classificarRichText(rich({ richTextStyles: [{ ...NA_BRASA, fill: '#f00', letterSpacing: 4 }] }))).toMatchObject({ motivo: 'espacamento-por-trecho' })
    expect(classificarRichText(rich({ richTextStyles: [{ ...NA_BRASA, fill: '#f00', stroke: { color: '#000', width: 2 } }] }))).toMatchObject({ motivo: 'contorno-por-trecho' })
    expect(classificarRichText(rich({ richTextStyles: [{ ...NA_BRASA, fill: '#f00', fontSize: 80, letterSpacing: 0 }] })).veredito).toBe('conversivel')
  })

  describe('sombra por trecho', () => {
    const sh = { color: 'rgba(0,0,0,0.5)', blur: 6, offset: { x: 0, y: 2 } }
    const todo = [
      { start: 0, end: 8, shadow: sh },
      { ...NA_BRASA, fill: '#f00', shadow: sh },
      { start: 16, end: 21, shadow: sh },
    ]

    it('igual em todo o conteúdo → vira effects.shadow da camada', () => {
      const c = classificarRichText(rich({ richTextStyles: todo }))
      expect(c).toMatchObject({
        veredito: 'conversivel',
        destaques: [{ inicio: 8, fim: 16 }],
        sombra: { enabled: true, shadowColor: '#000000', shadowBlur: 6, shadowOffsetX: 0, shadowOffsetY: 2, shadowOpacity: 0.5 },
      })
    })

    it('diferente entre trechos, ou só em parte do texto, ou com sombra na camada → não conversível', () => {
      const outra = { ...todo[2], shadow: { ...sh, blur: 9 } }
      expect(classificarRichText(rich({ richTextStyles: [todo[0], todo[1], outra] }))).toMatchObject({ motivo: 'sombra-diferente-por-trecho' })
      expect(classificarRichText(rich({ richTextStyles: [todo[1]] }))).toMatchObject({ motivo: 'sombra-parcial' })
      expect(classificarRichText(rich({ richTextStyles: todo, effects: { shadow: { enabled: true, shadowColor: '#111111', shadowBlur: 6, shadowOffsetX: 0, shadowOffsetY: 2, shadowOpacity: 0.5 } } }))).toMatchObject({ motivo: 'sombra-da-camada-diferente' })
    })

    it('a mesma sombra já na camada (o compositor gravava as duas) → converte sem mexer em effects', () => {
      const daCamada = { enabled: true, shadowColor: '#000000', shadowBlur: 6, shadowOffsetX: 0, shadowOffsetY: 2, shadowOpacity: 0.5 }
      const l = rich({ richTextStyles: todo, effects: { shadow: daCamada } })
      const c = classificarRichText(l)
      expect(c).toMatchObject({ veredito: 'conversivel', sombra: null })
      if (c.veredito === 'conversivel') expect((converterCamada(l, c) as unknown as { effects: unknown }).effects).toEqual({ shadow: daCamada })
    })

    it('sombra só na camada, sem trecho → não converte (o rich-text a ignorava, o text a desenharia)', () => {
      const l = rich({ richTextStyles: [{ ...NA_BRASA, fill: '#f00' }], effects: { shadow: { enabled: true, shadowColor: '#000000', shadowBlur: 6, shadowOffsetX: 0, shadowOffsetY: 2, shadowOpacity: 1 } } })
      expect(classificarRichText(l)).toMatchObject({ motivo: 'sombra-so-na-camada' })
    })
  })

  it('camada que não é rich-text → não conversível', () => {
    expect(classificarRichText(rich({ type: 'text' }))).toMatchObject({ motivo: 'nao-e-rich-text' })
  })

  it('várias linhas: o colchete não atravessa a quebra e o espaço da borda sai para fora', () => {
    const c = classificarRichText(rich({ content: 'um dois\ntrês quatro', richTextStyles: [{ start: 2, end: 12, fill: '#f00' }] }))
    expect(c).toMatchObject({ veredito: 'conversivel', destaques: [{ inicio: 3, fim: 7 }, { inicio: 8, fim: 12 }], conteudoMarcado: 'um [dois]\n[três] quatro' })
  })
})

describe('converterCamada', () => {
  it('troca o tipo, tira richTextStyles e leva a sombra para effects', () => {
    const sh = { color: 'rgba(0,0,0,1)', blur: 4, offset: { x: 1, y: 1 } }
    const l = rich({ richTextStyles: [{ start: 0, end: 8, shadow: sh }, { ...NA_BRASA, fill: '#f00', shadow: sh }, { start: 16, end: 21, shadow: sh }], effects: { stroke: { enabled: false } } })
    const c = classificarRichText(l)
    if (c.veredito !== 'conversivel') throw new Error('esperava conversível')
    const nova = converterCamada(l, c) as unknown as Record<string, unknown>
    expect(nova.type).toBe('text')
    expect(nova.richTextStyles).toBeUndefined()
    expect(nova.destaques).toEqual([{ inicio: 8, fim: 16 }])
    expect(nova.destaque).toEqual({ fill: '#f00' })
    expect(nova.effects).toMatchObject({ stroke: { enabled: false }, shadow: { enabled: true, shadowBlur: 4 } })
    expect(nova.content).toBe('Picanha na brasa hoje')
    // a original não foi tocada
    expect(l.type).toBe('rich-text')
  })

  it('sobe a meia-entrelinha que a camada text acrescenta (piloto Ciro Trigo: 36 px, 1,45 → 8,1 px)', () => {
    const l = rich({ position: { x: 70, y: 1639 }, style: { color: '#fff', fontSize: 36, lineHeight: 1.45 }, richTextStyles: [{ ...NA_BRASA, fill: '#f00' }] })
    const c = classificarRichText(l)
    if (c.veredito !== 'conversivel') throw new Error('esperava conversível')
    const nova = converterCamada(l, c)
    expect(nova.position.x).toBe(70)
    expect(nova.position.y).toBeCloseTo(1639 - 8.1)
    // entrelinha em dois campos: a camada text desenha com textboxConfig.autoWrap.lineHeight primeiro
    const comAuto = rich({ position: { x: 0, y: 100 }, textboxConfig: { autoWrap: { lineHeight: 1.2 } }, style: { color: '#fff', fontSize: 50, lineHeight: 1.45 }, richTextStyles: [{ ...NA_BRASA, fill: '#f00' }] })
    const c2 = classificarRichText(comAuto)
    if (c2.veredito !== 'conversivel') throw new Error('esperava conversível')
    expect(converterCamada(comAuto, c2).position.y).toBeCloseTo(95)
  })

  it('converterCamadasDaPagina troca só as conversíveis', () => {
    const boa = rich({ id: 'a', richTextStyles: [{ ...NA_BRASA, fill: '#f00' }] })
    const ruim = rich({ id: 'b', richTextStyles: [{ start: 0, end: 7, fill: '#f00' }, { ...NA_BRASA, fill: '#0f0' }] })
    const outra = { id: 'c', type: 'text', content: 'x' } as unknown as Layer
    const r = converterCamadasDaPagina([boa, ruim, outra])
    expect(r.convertidas).toEqual(['a'])
    expect(r.camadas.map((l) => l.type)).toEqual(['text', 'rich-text', 'text'])
  })
})
