import sharp from 'sharp'
import { describe, expect, it } from 'vitest'
import { currentSourceRect } from '@/lib/image-fit'
import {
  RECORTE_INTEIRO,
  acharFotoDaPagina,
  assuntoNaFotoNova,
  nitidezDentroEFora,
  ajustarAoQuadro,
  caixaDoAssuntoNoQuadro,
  caixaDoTextoNoQuadro,
  caixasDaMarcaNoQuadro,
  diferencaDeTom,
  camadasComFotoTrocada,
  pageIdDaArte,
  proporcaoMaisProxima,
  recortarQuadro,
  retanguloDoQuadro,
  rotaDaMelhoriaDeFoto,
} from '../quadro-da-foto'

const foto = (extra: Record<string, unknown> = {}) => ({
  id: 'bg-img',
  type: 'image',
  fileUrl: 'https://x.public.blob.vercel-storage.com/foto.jpg',
  position: { x: 0, y: 0 },
  size: { width: 1080, height: 1920 },
  style: { objectFit: 'cover' },
  ...extra,
})
const texto = (id: string, x: number, y: number, width: number, height: number, extra: Record<string, unknown> = {}) => ({
  id,
  type: 'text',
  content: 'oi',
  position: { x, y },
  size: { width, height },
  ...extra,
})

describe('pageIdDaArte', () => {
  it('lê pageId e, na falta, sourcePageId', () => {
    expect(pageIdDaArte({ pageId: 'p1', sourcePageId: 'p2' })).toBe('p1')
    expect(pageIdDaArte({ sourcePageId: ' p2 ' })).toBe('p2')
    expect(pageIdDaArte({})).toBeNull()
    expect(pageIdDaArte(null)).toBeNull()
  })
})

describe('acharFotoDaPagina', () => {
  it('pega a primeira imagem visível com arquivo, fora de grade', () => {
    const layers = [
      texto('t', 0, 0, 10, 10),
      foto({ id: 'oculta', visible: false }),
      foto({ id: 'grade', metadata: { grade: { id: 'g' } } }),
      foto({ id: 'vazia', fileUrl: '' }),
      foto({ id: 'a-foto', style: { objectFit: 'cover', crop: { x: 0.1, y: 0, width: 0.5, height: 1 } } }),
      { id: 'logo', type: 'logo', fileUrl: 'https://x/logo.png' },
    ]
    const achada = acharFotoDaPagina(layers)
    expect(achada?.camadaId).toBe('a-foto')
    expect(achada?.caixa).toEqual({ width: 1080, height: 1920 })
    expect(achada?.estilo.crop).toEqual({ x: 0.1, y: 0, width: 0.5, height: 1 })
  })

  it('lê a página gravada como string (codificação dupla)', () => {
    expect(acharFotoDaPagina(JSON.stringify(JSON.stringify([foto()])))?.camadaId).toBe('bg-img')
  })

  it('sem imagem devolve null', () => {
    expect(acharFotoDaPagina([texto('t', 0, 0, 10, 10)])).toBeNull()
    expect(acharFotoDaPagina('lixo')).toBeNull()
  })
})

describe('rotaDaMelhoriaDeFoto', () => {
  const pagina = { isTemplate: false, layers: [foto()] }
  it('arte do compositor com página e foto vai pela página', () => {
    const rota = rotaDaMelhoriaDeFoto({ fieldValues: { source: 'compositor', pageId: 'p' } }, pagina)
    expect(rota.via).toBe('pagina')
  })
  it('arte que já é melhoria chapada vai pela reserva, mesmo com página', () => {
    expect(rotaDaMelhoriaDeFoto({ fieldValues: { source: 'ai_improvement' } }, pagina)).toEqual({ via: 'reserva', motivo: 'ja-e-melhoria' })
  })
  it('sem página, página-modelo e página sem foto vão pela reserva', () => {
    expect(rotaDaMelhoriaDeFoto({ fieldValues: {} }, null)).toEqual({ via: 'reserva', motivo: 'sem-pagina' })
    expect(rotaDaMelhoriaDeFoto({ fieldValues: {} }, { ...pagina, isTemplate: true })).toEqual({ via: 'reserva', motivo: 'pagina-modelo' })
    expect(rotaDaMelhoriaDeFoto({ fieldValues: {} }, { isTemplate: false, layers: [texto('t', 0, 0, 1, 1)] })).toEqual({ via: 'reserva', motivo: 'sem-foto-na-pagina' })
  })
})

describe('o quadro que a arte mostra', () => {
  const natural = { width: 4000, height: 3000 }

  it('é o mesmo retângulo-fonte do editor e do render (cover)', () => {
    const f = acharFotoDaPagina([foto()])!
    const esperado = currentSourceRect(natural, f.caixa, f.estilo as never)
    const r = retanguloDoQuadro(natural, f)
    expect(r.left).toBe(Math.round(esperado.cropX))
    expect(r.width).toBe(Math.round(esperado.cropWidth))
    expect(r.height).toBe(3000)
    // 9:16 dentro de 4:3: sobra dos lados
    expect(r.width / r.height).toBeCloseTo(1080 / 1920, 2)
  })

  it('respeita o recorte manual', () => {
    const f = acharFotoDaPagina([foto({ style: { objectFit: 'cover', crop: { x: 0.25, y: 0.5, width: 0.25, height: 0.5 } } })])!
    expect(retanguloDoQuadro(natural, f)).toEqual({ left: 1000, top: 1500, width: 1000, height: 1500 })
  })

  it('sem objectFit a foto inteira é o quadro (o editor estica)', () => {
    const f = acharFotoDaPagina([foto({ style: {} })])!
    expect(retanguloDoQuadro(natural, f)).toEqual({ left: 0, top: 0, width: 4000, height: 3000 })
  })

  it('recorta o arquivo no quadro', async () => {
    const arquivo = await sharp({ create: { width: 400, height: 300, channels: 3, background: '#884422' } }).jpeg().toBuffer()
    const f = acharFotoDaPagina([foto({ size: { width: 100, height: 200 } })])!
    const q = await recortarQuadro(arquivo, f)
    expect(q.height).toBe(300)
    expect(q.width).toBe(150)
    const meta = await sharp(q.buffer).metadata()
    expect([meta.width, meta.height]).toEqual([150, 300])
  })
})

describe('caixaDoAssuntoNoQuadro', () => {
  it('leva a caixa da foto inteira para frações do quadro, cortando o que sobra', () => {
    const natural = { width: 4000, height: 3000 }
    const quadro = { left: 1000, top: 0, width: 2000, height: 3000 }
    const c = caixaDoAssuntoNoQuadro({ x0: 0.5, y0: 0.5, x1: 1, y1: 1 }, natural, quadro)!
    expect(c).toEqual({ x: 0.5, y: 0.5, largura: 0.5, altura: 0.5 })
    expect(caixaDoAssuntoNoQuadro({ x0: 0, y0: 0, x1: 0.2, y1: 0.2 }, natural, quadro)).toBeNull()
  })
})

describe('proporcaoMaisProxima', () => {
  it('escolhe entre as proporções que o gerador aceita', () => {
    expect(proporcaoMaisProxima(1080, 1920)).toBe('9:16')
    expect(proporcaoMaisProxima(1080, 1350)).toBe('4:5')
    expect(proporcaoMaisProxima(1080, 1080)).toBe('1:1')
    expect(proporcaoMaisProxima(1080, 690)).toBe('3:2')
    expect(proporcaoMaisProxima(1243, 1350)).toBe('1:1')
  })
})

describe('ajustarAoQuadro', () => {
  it('devolve a foto gerada na proporção do quadro, sem ampliar além do que o gerador entregou', async () => {
    const gerada = await sharp({ create: { width: 1536, height: 2752, channels: 3, background: '#224488' } }).png().toBuffer()
    const saida = await ajustarAoQuadro(gerada, { width: 1000, height: 2000 })
    const meta = await sharp(saida).metadata()
    expect(meta.format).toBe('jpeg')
    expect(meta.width! / meta.height!).toBeCloseTo(0.5, 2)
    expect(meta.height).toBeLessThanOrEqual(2752)
    expect(meta.width).toBeLessThanOrEqual(1536)
  })
})

describe('caixaDoTextoNoQuadro', () => {
  it('é a união dos textos visíveis, em frações da caixa da foto', () => {
    const layers = [foto(), texto('a', 108, 192, 540, 96), texto('b', 108, 384, 864, 192), texto('oculto', 0, 1800, 1080, 100, { visible: false }), texto('vazio', 0, 1800, 1080, 100, { content: '  ' })]
    const caixa = caixaDoTextoNoQuadro(layers, 'bg-img')!
    expect(caixa.x).toBeCloseTo(0.1, 5)
    expect(caixa.y).toBeCloseTo(0.1, 5)
    expect(caixa.largura).toBeCloseTo(0.8, 5)
    expect(caixa.altura).toBeCloseTo(0.2, 5)
  })

  it('só conta o que cai dentro da foto, e devolve null sem texto', () => {
    const meia = foto({ position: { x: 0, y: 960 }, size: { width: 1080, height: 960 } })
    expect(caixaDoTextoNoQuadro([meia, texto('fora', 0, 0, 1080, 200)], 'bg-img')).toBeNull()
    expect(caixaDoTextoNoQuadro([foto()], 'bg-img')).toBeNull()
  })
})

describe('caixasDaMarcaNoQuadro', () => {
  it('devolve a caixa da logo e dos elementos que ficam sobre a foto, e ignora o resto', () => {
    const layers = [foto(), texto('t', 0, 0, 500, 100), { id: 'logo', type: 'logo', fileUrl: 'https://x/l.png', position: { x: 864, y: 1728 }, size: { width: 216, height: 192 } }, { id: 'oculto', type: 'element', visible: false, position: { x: 0, y: 0 }, size: { width: 100, height: 100 } }]
    const caixas = caixasDaMarcaNoQuadro(layers, 'bg-img')
    expect(caixas).toHaveLength(1)
    expect(caixas[0].x).toBeCloseTo(0.8, 5)
    expect(caixas[0].y).toBeCloseTo(0.9, 5)
    expect(caixas[0].largura).toBeCloseTo(0.2, 5)
    expect(caixas[0].altura).toBeCloseTo(0.1, 5)
  })
})

describe('camadasComFotoTrocada', () => {
  it('troca só a foto pedida e deixa o recorte inteiro: a foto nova já vem no quadro', () => {
    const original = [foto({ style: { objectFit: 'cover', cropPosition: 'left-top', crop: { x: 0.2, y: 0, width: 0.5, height: 1 }, opacity: 0.9 } }), texto('t', 0, 0, 10, 10), { id: 'logo', type: 'logo', fileUrl: 'https://x/logo.png' }]
    const novas = camadasComFotoTrocada(original, 'bg-img', 'https://x/nova.jpg') as any[]
    expect(novas[0].fileUrl).toBe('https://x/nova.jpg')
    expect(novas[0].style.crop).toEqual(RECORTE_INTEIRO)
    expect(novas[0].style.opacity).toBe(0.9)
    expect(novas[1]).toEqual(original[1])
    expect(novas[2]).toEqual(original[2])
    // a entrada não é mutada
    expect((original[0] as any).fileUrl).toContain('foto.jpg')
  })
})

describe('diferencaDeTom', () => {
  const cena = (r: number, g: number, b: number, extra?: (raw: Buffer) => void) => {
    const raw = Buffer.alloc(200 * 300 * 3)
    for (let i = 0; i < raw.length; i += 3) raw.set([r + ((i / 3) % 7), g, b], i)
    extra?.(raw)
    return sharp(raw, { raw: { width: 200, height: 300, channels: 3 } }).jpeg({ quality: 95 }).toBuffer()
  }

  it('é perto de zero na mesma foto e acompanha o tratamento global', async () => {
    const origem = await cena(120, 100, 80)
    expect(await diferencaDeTom(origem, await cena(120, 100, 80))).toBeLessThan(1)
    // Balanço de branco: menos vermelho, mais azul, na foto inteira.
    const tratada = await diferencaDeTom(origem, await cena(108, 100, 94))
    expect(tratada).toBeGreaterThan(6)
    expect(tratada).toBeLessThan(12)
  })

  it('um elemento pequeno novo quase não mexe no tom', async () => {
    const origem = await cena(120, 100, 80)
    const comMao = await cena(120, 100, 80, (raw) => {
      for (let y = 100; y < 130; y++) for (let x = 150; x < 200; x++) raw.set([230, 190, 160], (y * 200 + x) * 3)
    })
    expect(await diferencaDeTom(origem, comMao)).toBeLessThan(3)
  })
})


describe('medidas do tratamento e do assunto', () => {
  const W = 300
  const H = 400
  /** Fundo liso com um "prato" texturizado (xadrez fino) no retângulo dado. */
  const cena = async (x0: number, y0: number, w: number, h: number, desfoque = 0) => {
    const raw = Buffer.alloc(W * H * 3, 60)
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if ((Math.floor(x / 23) + Math.floor(y / 17)) % 2 === 0) raw.fill(75, (y * W + x) * 3, (y * W + x) * 3 + 3)
    for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) {
      const u = (x - x0) / w
      const v = (y - y0) / h
      const tom = 110 + 100 * Math.sin(u * 9) * Math.cos(v * 7) + ((Math.floor(u * 12) + Math.floor(v * 12)) % 2) * 30
      raw.fill(Math.max(0, Math.min(255, Math.round(tom))), (y * W + x) * 3, (y * W + x) * 3 + 3)
    }
    const img = sharp(raw, { raw: { width: W, height: H, channels: 3 } })
    return (desfoque > 0 ? img.blur(desfoque) : img).png().toBuffer()
  }
  const caixa = { x: 90 / W, y: 140 / H, largura: 120 / W, altura: 160 / H }

  it('nitidezDentroEFora: fundo desfocado baixa a razão de fora e mantém a de dentro', async () => {
    const origem = await cena(90, 140, 120, 160)
    const igual = await nitidezDentroEFora(origem, origem, caixa)
    expect(igual.dentro).toBeCloseTo(1, 5)
    expect(igual.fora).toBeCloseTo(1, 5)
    // Desfoca tudo e devolve o assunto nítido por cima: só o fundo muda.
    const borrada = await cena(90, 140, 120, 160, 4)
    const assunto = await sharp(origem).extract({ left: 90, top: 140, width: 120, height: 160 }).toBuffer()
    const tratada = await sharp(borrada).composite([{ input: assunto, left: 90, top: 140 }]).png().toBuffer()
    const r = await nitidezDentroEFora(origem, tratada, caixa)
    expect(r.fora).toBeLessThan(0.7)
    expect(r.dentro!).toBeGreaterThan(0.9)
    expect((await nitidezDentroEFora(origem, tratada, null)).dentro).toBeNull()
  })

  it('assuntoNaFotoNova: acha o assunto no mesmo lugar e do mesmo tamanho', async () => {
    const origem = await cena(90, 140, 120, 160)
    const r = await assuntoNaFotoNova(origem, origem, caixa)
    expect(r.escala).toBeCloseTo(1, 1)
    expect(Math.abs(r.dx)).toBeLessThan(0.02)
    expect(Math.abs(r.dy)).toBeLessThan(0.02)
    expect(r.correlacao).toBeGreaterThan(0.95)
  })

  it('assuntoNaFotoNova: mede o assunto que encolheu e subiu', async () => {
    const origem = await cena(90, 140, 120, 160)
    // 70% do tamanho, centro 60 px acima (15% da altura) e 30 px à direita (10% da largura).
    const nova = await cena(138, 104, 84, 112)
    const r = await assuntoNaFotoNova(origem, nova, caixa)
    expect(r.escala).toBeGreaterThan(0.6)
    expect(r.escala).toBeLessThan(0.8)
    expect(r.dy).toBeLessThan(-0.1)
    expect(r.dx).toBeGreaterThan(0.05)
    expect(r.correlacao).toBeGreaterThan(0.6)
  })
})
