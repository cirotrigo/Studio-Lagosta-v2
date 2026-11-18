import sharp from 'sharp'
import { describe, expect, it } from 'vitest'
import { currentSourceRect } from '@/lib/image-fit'
import {
  RECORTE_INTEIRO,
  acharFotoDaPagina,
  ajustarAoQuadro,
  caixaDoAssuntoNoQuadro,
  caixaDoTextoNoQuadro,
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
