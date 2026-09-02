import { describe, expect, it } from 'vitest'

import type { Layer } from '@/types/template'

import {
  ajustarTom,
  controleDoRaio,
  corEscuraDaMarca,
  escalaDoBlur,
  folgaDoBlur,
  hexValido,
  luminanciaDaCor,
  presetHalo,
  raioDoControle,
  raioDosCantos,
  resolverFundo,
  retanguloDasLinhas,
  retanguloDoFundo,
  RAIO_MAXIMO_DO_FUNDO,
  RAIO_MAXIMO_DO_STACK_BLUR,
  type FundoResolvido,
} from '../fundo-de-texto'

const caixa = { width: 400, height: 200 }

describe('resolverFundo', () => {
  it('desligado ou ausente é null', () => {
    expect(resolverFundo(undefined)).toBeNull()
    expect(resolverFundo(null)).toBeNull()
    expect(resolverFundo({ enabled: false, backgroundColor: '#000', padding: 10 })).toBeNull()
  })

  it('fundo antigo resolve para caixa inteira, nítido e opaco — o que ele sempre desenhou', () => {
    const r = resolverFundo({ enabled: true, backgroundColor: '#FFFFFF', padding: 12 })
    expect(r).toEqual({
      fit: 'caixa',
      color: '#ffffff',
      opacity: 1,
      paddingX: 12,
      paddingY: 12,
      borderRadius: 0,
      blur: 0,
      offsetX: 0,
      offsetY: 0,
    })
  })

  it('paddingX/paddingY vencem padding no eixo em que existem; o resto satura nos tetos', () => {
    const r = resolverFundo({
      enabled: true,
      backgroundColor: '#123456',
      padding: 30,
      paddingY: 80,
      fit: 'texto',
      opacity: 7,
      blur: 9000,
      offsetX: -999,
      borderRadius: 1e6,
    })!
    expect(r.fit).toBe('texto')
    expect(r.paddingX).toBe(30)
    expect(r.paddingY).toBe(80)
    expect(r.opacity).toBe(1)
    expect(r.blur).toBe(RAIO_MAXIMO_DO_FUNDO)
    expect(r.offsetX).toBe(-200)
    expect(r.borderRadius).toBe(300)
  })

  it('hex de 3 dígitos vira 6; cor inválida mas não vazia é mantida (rgba() do editor)', () => {
    expect(resolverFundo({ enabled: true, backgroundColor: '#abc', padding: 0 })!.color).toBe('#aabbcc')
    expect(resolverFundo({ enabled: true, backgroundColor: 'rgba(0,0,0,0.5)', padding: 0 })!.color).toBe('rgba(0,0,0,0.5)')
  })
})

describe('retanguloDasLinhas — a conta do _sceneFunc do Konva.Text', () => {
  const base = { caixa, fontSize: 40, lineHeight: 1.2 }

  it('alinhado à esquerda, âncora topo: começa no padding, largura da linha mais larga', () => {
    const r = retanguloDasLinhas({ ...base, align: 'left', anchor: 'top', linhas: [{ largura: 200 }, { largura: 120 }] })
    expect(r).toEqual({ x: 6, y: 6, width: 200, height: 96 })
  })

  it('centralizado: cada linha desloca (W − w − 2·pad)/2 e a união é a da mais larga', () => {
    const r = retanguloDasLinhas({ ...base, align: 'center', anchor: 'top', linhas: [{ largura: 200 }, { largura: 100 }] })
    // largura útil 388; linha de 200 → x = 6 + 94 = 100
    expect(r).toEqual({ x: 100, y: 6, width: 200, height: 96 })
  })

  it('à direita: encosta em W − pad', () => {
    const r = retanguloDasLinhas({ ...base, align: 'right', anchor: 'top', linhas: [{ largura: 200 }, { largura: 100 }] })
    expect(r).toEqual({ x: 194, y: 6, width: 200, height: 96 })
  })

  it('justify estica toda linha menos a última do parágrafo', () => {
    const r = retanguloDasLinhas({
      ...base,
      align: 'justify',
      anchor: 'top',
      linhas: [{ largura: 200 }, { largura: 100, ultimaDoParagrafo: true }],
    })
    expect(r).toEqual({ x: 6, y: 6, width: 388, height: 96 })
  })

  it('âncora meio e base: alignY = (H − n·lh − 2·pad)/2 e H − n·lh − 2·pad', () => {
    const linhas = [{ largura: 100 }]
    const meio = retanguloDasLinhas({ ...base, align: 'left', anchor: 'middle', linhas })!
    const fundo = retanguloDasLinhas({ ...base, align: 'left', anchor: 'bottom', linhas })!
    // lh 48; (200 − 48 − 12)/2 = 70 → y = 76; 200 − 48 − 12 = 140 → y = 146
    expect(meio.y).toBe(76)
    expect(fundo.y).toBe(146)
    expect(meio.height).toBe(48)
  })

  it('linha vazia conta na altura mas não na largura; só vazias → null', () => {
    const r = retanguloDasLinhas({ ...base, align: 'center', anchor: 'top', linhas: [{ largura: 0 }, { largura: 150 }] })!
    expect(r.height).toBe(96)
    expect(r.width).toBe(150)
    expect(retanguloDasLinhas({ ...base, linhas: [{ largura: 0 }] })).toBeNull()
    expect(retanguloDasLinhas({ ...base, linhas: [] })).toBeNull()
  })

  it('padding e entrelinha explícitos', () => {
    const r = retanguloDasLinhas({ caixa, fontSize: 10, lineHeight: 1, padding: 0, align: 'left', linhas: [{ largura: 50 }] })
    expect(r).toEqual({ x: 0, y: 0, width: 50, height: 10 })
  })
})

describe('retanguloDoFundo', () => {
  const fundo = (extra: Partial<FundoResolvido>): FundoResolvido => ({
    fit: 'caixa',
    color: '#111111',
    opacity: 1,
    paddingX: 10,
    paddingY: 20,
    borderRadius: 0,
    blur: 0,
    offsetX: 0,
    offsetY: 0,
    ...extra,
  })

  it('caixa: a camada inteira crescida pela borda', () => {
    expect(retanguloDoFundo(fundo({}), caixa, null)).toEqual({ x: -10, y: -20, width: 420, height: 240 })
  })

  it('texto: a tinta crescida pela borda; sem tinta não há fundo', () => {
    const tinta = { x: 100, y: 6, width: 200, height: 96 }
    expect(retanguloDoFundo(fundo({ fit: 'texto' }), caixa, tinta)).toEqual({ x: 90, y: -14, width: 220, height: 136 })
    expect(retanguloDoFundo(fundo({ fit: 'texto' }), caixa, null)).toBeNull()
  })

  it('offset desloca a mancha inteira', () => {
    expect(retanguloDoFundo(fundo({ offsetX: 15, offsetY: -5 }), caixa, null)).toEqual({ x: 5, y: -25, width: 420, height: 240 })
  })

  it('raioDosCantos não passa da metade do menor lado', () => {
    const r = { x: 0, y: 0, width: 100, height: 40 }
    expect(raioDosCantos(fundo({ borderRadius: 300 }), r)).toBe(20)
    expect(raioDosCantos(fundo({ borderRadius: 8 }), r)).toBe(8)
  })
})

describe('escalaDoBlur — o overflow do stack blur (raio ~180) nunca é alcançado', () => {
  it('até 160 é escala cheia', () => {
    expect(escalaDoBlur(0)).toEqual({ k: 1, raioNoBuffer: 0 })
    expect(escalaDoBlur(1)).toEqual({ k: 1, raioNoBuffer: 1 })
    expect(escalaDoBlur(160)).toEqual({ k: 1, raioNoBuffer: 160 })
  })

  it('acima, reduz por k = ceil(raio/160) e o raio no buffer fica ≤ 160', () => {
    expect(escalaDoBlur(161)).toEqual({ k: 2, raioNoBuffer: 81 })
    expect(escalaDoBlur(200)).toEqual({ k: 2, raioNoBuffer: 100 })
    expect(escalaDoBlur(400)).toEqual({ k: 3, raioNoBuffer: 133 })
    expect(escalaDoBlur(600)).toEqual({ k: 4, raioNoBuffer: 150 })
    for (let r = 0; r <= 1200; r += 7) {
      const e = escalaDoBlur(r)
      expect(e.raioNoBuffer).toBeLessThanOrEqual(RAIO_MAXIMO_DO_STACK_BLUR)
      // k·raioNoBuffer recompõe o raio visual a ±k/2
      if (r > 0) expect(Math.abs(e.k * e.raioNoBuffer - r)).toBeLessThanOrEqual(e.k / 2)
    }
  })

  it('folga de 3× o raio, como o ShapeNode e o renderShapeBlurred', () => {
    expect(folgaDoBlur(110)).toBe(330)
    expect(folgaDoBlur(0)).toBe(0)
  })

  it('slider quadrático: fino embaixo, largo em cima, monotônico, e o RAIO gravado é estável na ida e volta', () => {
    expect(raioDoControle(0)).toBe(0)
    expect(raioDoControle(50)).toBe(150)
    expect(raioDoControle(100)).toBe(600)
    let anterior = -1
    for (let v = 0; v <= 100; v += 1) {
      const r = raioDoControle(v)
      expect(r).toBeGreaterThanOrEqual(anterior)
      anterior = r
    }
    // O que fica gravado é o raio; o thumb é derivado dele. O passo máximo do
    // slider é 12 px (derivada 2·600·t/100 em t = 1), então raio → thumb →
    // raio nunca se afasta mais que meio passo — e no trecho fino (≤ 50 px) o
    // erro é de no máximo 1 px.
    for (let r = 0; r <= 600; r += 1) {
      const volta = raioDoControle(controleDoRaio(r))
      expect(Math.abs(volta - r)).toBeLessThanOrEqual(r <= 50 ? 1 : 6)
    }
  })
})

describe('cor', () => {
  it('hexValido normaliza e recusa', () => {
    expect(hexValido(' #ABC ')).toBe('#aabbcc')
    expect(hexValido('#12345g')).toBeNull()
    expect(hexValido('rgb(1,2,3)')).toBeNull()
    expect(hexValido(undefined)).toBeNull()
  })

  it('ajustarTom: 0 devolve a própria cor; + clareia; − escurece; a matiz fica', () => {
    expect(ajustarTom('#2C3445', 0)).toBe('#2c3445')
    const claro = ajustarTom('#2C3445', 20)
    const escuro = ajustarTom('#2C3445', -20)
    expect(luminanciaDaCor(claro)).toBeGreaterThan(luminanciaDaCor('#2C3445'))
    expect(luminanciaDaCor(escuro)).toBeLessThan(luminanciaDaCor('#2C3445'))
    // azul continua sendo o canal dominante
    const [r, , b] = [parseInt(claro.slice(1, 3), 16), 0, parseInt(claro.slice(5, 7), 16)]
    expect(b).toBeGreaterThan(r)
    expect(ajustarTom('#111111', -40)).toBe('#000000')
    expect(ajustarTom('não é cor', 10)).not.toBe('não é cor')
  })

  it('corEscuraDaMarca: véu da página > cor cadastrada como escura > quase-preto', () => {
    const veu: Layer = {
      id: 'veu-rodape',
      type: 'gradient',
      name: 'Véu rodapé',
      visible: true,
      locked: false,
      order: 1,
      position: { x: 0, y: 0 },
      size: { width: 10, height: 10 },
      style: { gradientStops: [{ id: 'a', color: '#170E09', position: 0, opacity: 1 }] },
    }
    const cores = [
      { name: 'Primária', hexCode: '#F4301A' },
      { name: 'Fundo escuro', hexCode: '#2C3445' },
    ]
    expect(corEscuraDaMarca(cores, [veu])).toBe('#170e09')
    expect(corEscuraDaMarca(cores, [])).toBe('#2c3445')
    expect(corEscuraDaMarca([{ name: 'Primária', hexCode: '#F4301A' }], [])).toBe('#111111')
  })

  it('presetHalo: texto, cor escura, 70%, borda 60, cantos 60, desfoque 110 — e zera borda por eixo', () => {
    const p = presetHalo('#2C3445', { enabled: true, backgroundColor: '#fff', padding: 10, paddingX: 5, paddingY: 7 })
    expect(p).toMatchObject({
      enabled: true,
      backgroundColor: '#2c3445',
      baseColor: '#2c3445',
      tone: 0,
      fit: 'texto',
      opacity: 0.7,
      padding: 60,
      borderRadius: 60,
      blur: 110,
      offsetX: 0,
      offsetY: 0,
    })
    expect(p.paddingX).toBeUndefined()
    expect(p.paddingY).toBeUndefined()
    expect(presetHalo('inválida').backgroundColor).toBe('#111111')
  })
})
