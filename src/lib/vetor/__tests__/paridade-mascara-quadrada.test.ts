/**
 * Máscara "Quadrado 1:1" da foto (26/10/2026): a conta (`aplicarMascaraQuadrada`) e a PARIDADE editor × servidor.
 * Editor = Konva REAL no Node (Group com o clipFunc do `konva-layer-factory` + KonvaImage com o crop de
 * `resolveImageSourceRect`); servidor = `CanvasRenderer`. A foto de teste codifica a coordenada de origem na cor
 * (R = x, G = y), então dá para provar que o quadrado mostra a área certa SEM deformar.
 * Limite: napi × napi no Node — não é o Konva do navegador nem o componente React montado.
 */
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import sharp from 'sharp'
import { loadImage } from '@napi-rs/canvas'
import { Group } from 'konva/lib/Group'
import { Image as KonvaImage } from 'konva/lib/shapes/Image'
import type { Shape } from 'konva/lib/Shape'
import type { Layer } from '@/types/template'
import { traceSvgPath } from '@/lib/konva/svg-path-clip'
import { MASCARA_QUADRADA, aplicarMascaraQuadrada, dimensoesDaFotoCarregada, resolveImageSourceRect } from '@/lib/image-fit'
import { MASCARAS_DE_IMAGEM } from '@/lib/assets/shapes-library'
import { travaDeProporcao, ANCORAS_DOS_CANTOS } from '@/lib/konva/trava-de-proporcao'
import { pixelsDoNoKonva, pixelsDoServidor, type Pixels } from './suporte/konva-no-node'

/** Foto W×H com R = x/(W-1)·255 e G = y/(H-1)·255 */
async function fotoGradiente(W: number, H: number) {
  const raw = Buffer.alloc(W * H * 3)
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const i = (y * W + x) * 3
      raw[i] = Math.round((x / (W - 1)) * 255)
      raw[i + 1] = Math.round((y / (H - 1)) * 255)
      raw[i + 2] = 128
    }
  return sharp(raw, { raw: { width: W, height: H, channels: 3 } }).png().toBuffer()
}

const camada = (over: Partial<Layer>): Layer =>
  ({ id: 'foto', name: 'Foto', type: 'image', visible: true, locked: false, order: 0, rotation: 0, ...over }) as Layer

describe('aplicarMascaraQuadrada: a conta', () => {
  it('foto horizontal em cover: caixa vira o quadrado do menor lado, mesmo centro, recorte 1:1 em px', () => {
    const natural = { width: 1600, height: 900 }
    const r = aplicarMascaraQuadrada(
      camada({ position: { x: 100, y: 50 }, size: { width: 400, height: 200 }, style: { objectFit: 'cover', opacity: 0.8, flipH: true } }),
      natural,
    )!
    expect(r.size).toEqual({ width: 200, height: 200 })
    expect(r.position).toEqual({ x: 200, y: 50 })
    expect(r.style.mask).toEqual(MASCARA_QUADRADA)
    // outras propriedades preservadas
    expect(r.style).toMatchObject({ objectFit: 'cover', opacity: 0.8, flipH: true })
    // sem deformar: o recorte em px tem a proporção da caixa (1:1)
    expect(r.style.crop!.width * natural.width).toBeCloseTo(r.style.crop!.height * natural.height, 6)
    // centro da foto preservado (cover centrado → centro da imagem)
    expect(r.style.crop!.x + r.style.crop!.width / 2).toBeCloseTo(0.5, 6)
    expect(r.style.crop!.y + r.style.crop!.height / 2).toBeCloseTo(0.5, 6)
  })

  it('foto vertical com recorte manual: mantém escala e centro do enquadramento manual', () => {
    const natural = { width: 900, height: 1600 }
    const crop = { x: 0.1, y: 0.2, width: 0.6, height: 0.5 } // 540×800 px numa caixa 270×400 → escala 0,5
    const r = aplicarMascaraQuadrada(camada({ position: { x: 0, y: 0 }, size: { width: 270, height: 400 }, style: { crop } }), natural)!
    expect(r.size).toEqual({ width: 270, height: 270 })
    expect(r.position.x).toBeCloseTo(0, 6)
    expect(r.position.y).toBeCloseTo(65, 6)
    const c = r.style.crop!
    expect(c.width * natural.width).toBeCloseTo(540, 6) // mesma escala: 270 / 0,5
    expect(c.height * natural.height).toBeCloseTo(540, 6)
    expect(c.x + c.width / 2).toBeCloseTo(crop.x + crop.width / 2, 6)
    expect(c.y + c.height / 2).toBeCloseTo(crop.y + crop.height / 2, 6)
  })

  it('rotacionada: o centro da caixa no canvas não anda (pivô no canto superior esquerdo)', () => {
    const r = aplicarMascaraQuadrada(camada({ position: { x: 300, y: 300 }, size: { width: 400, height: 200 }, rotation: 90, style: { objectFit: 'cover' } }), { width: 1600, height: 900 })!
    // centro antigo: (300,300) + rot90(200,100) = (200,500); novo: pos + rot90(100,100) = pos + (-100,100)
    expect(r.position.x - 100).toBeCloseTo(200, 6)
    expect(r.position.y + 100).toBeCloseTo(500, 6)
  })

  it('caixa já quadrada: não mexe em posição nem tamanho; sem dimensões: não aplica', () => {
    const r = aplicarMascaraQuadrada(camada({ position: { x: 10, y: 20 }, size: { width: 300, height: 300 }, style: { objectFit: 'cover' } }), { width: 1600, height: 900 })!
    expect(r.position).toEqual({ x: 10, y: 20 })
    expect(r.style.border).toBeUndefined()
    expect(r.size).toEqual({ width: 300, height: 300 })
    expect(aplicarMascaraQuadrada(camada({ size: { width: 0, height: 300 } }), { width: 10, height: 10 })).toBeUndefined()
    expect(aplicarMascaraQuadrada(camada({ size: { width: 300, height: 200 } }), { width: 0, height: 0 })).toBeUndefined()
  })

  it('cantos retos: o raio da borda vai a 0 e cor/largura ficam', () => {
    const r = aplicarMascaraQuadrada(camada({ size: { width: 300, height: 200 }, style: { objectFit: 'cover', border: { width: 4, color: '#ff0000', radius: 24 } } }), { width: 1600, height: 900 })!
    expect(r.style.border).toEqual({ width: 4, color: '#ff0000', radius: 0 })
  })

  it('salvar/reabrir (JSON) preserva tudo e a trava segue só nos cantos; as 26 legadas intactas', () => {
    const r = aplicarMascaraQuadrada(camada({ position: { x: 0, y: 0 }, size: { width: 400, height: 200 }, style: { objectFit: 'cover' } }), { width: 1600, height: 900 })!
    const reaberta = JSON.parse(JSON.stringify(camada({ ...r })))
    expect(reaberta.style).toEqual(r.style)
    expect(travaDeProporcao([reaberta], ['foto'], false)).toEqual({ keepRatio: true, ancoras: ANCORAS_DOS_CANTOS })
    expect(MASCARAS_DE_IMAGEM).toHaveLength(26)
    expect(MASCARAS_DE_IMAGEM.some((m) => m.id === MASCARA_QUADRADA.shapeId)).toBe(false)
  })
})

describe('Quadrado 1:1: paridade editor × servidor em pixels', () => {
  const CANVAS = { w: 600, h: 400 }
  const casos = {
    horizontal: { natural: { width: 800, height: 450 }, caixa: { x: 40, y: 60, w: 480, h: 270 }, style: { objectFit: 'cover' } },
    'vertical com recorte manual e raio': { natural: { width: 450, height: 800 }, caixa: { x: 100, y: 20, w: 224, h: 360 }, style: { crop: { x: 0.05, y: 0.3, width: 0.8, height: 0.6 }, border: { width: 0, color: '#000000', radius: 40 } } },
  } as const

  for (const [nome, caso] of Object.entries(casos)) {
    it(`${nome}: mesmos pixels, quadrado ${'exato'} e foto sem deformar`, async () => {
      const png = await fotoGradiente(caso.natural.width, caso.natural.height)
      const r = aplicarMascaraQuadrada(
        camada({ position: { x: caso.caixa.x, y: caso.caixa.y }, size: { width: caso.caixa.w, height: caso.caixa.h }, style: caso.style as Layer['style'] }),
        caso.natural,
      )!
      const layer = camada({ ...r, fileUrl: `data:image/png;base64,${png.toString('base64')}` })
      const s = await pixelsDoServidor(CANVAS.w, CANVAS.h, '#000000', [layer])

      const img = await loadImage(png)
      const src = resolveImageSourceRect(caso.natural, r.size, r.style)!
      const k = pixelsDoNoKonva(CANVAS.w, CANVAS.h, '#000000', () => {
        const { width: w, height: h } = r.size
        const g = new Group({
          x: r.position.x,
          y: r.position.y,
          clipFunc: (ctx) => {
            ctx.scale(w / 100, h / 100)
            traceSvgPath(ctx, r.style.mask!.path)
            ctx.scale(100 / w, 100 / h)
          },
        })
        g.add(new KonvaImage({ image: img as unknown as HTMLImageElement, width: w, height: h, crop: { x: src.cropX, y: src.cropY, width: src.cropWidth, height: src.cropHeight } }))
        return g as unknown as Shape
      })

      let acima = 0
      for (let i = 0; i < s.dados.length; i++) if (i % 4 !== 3 && Math.abs(s.dados[i] - k.dados[i]) > 8) acima++
      expect(acima).toBe(0)

      // O que aparece é EXATAMENTE o quadrado da caixa (B = 128 só na foto)
      const azul = (p: Pixels, x: number, y: number) => p.dados[(y * p.largura + x) * 4 + 2]
      let minX = Infinity, maxX = -1, minY = Infinity, maxY = -1
      for (let y = 0; y < CANVAS.h; y++)
        for (let x = 0; x < CANVAS.w; x++)
          if (azul(s, x, y) > 64) { minX = Math.min(minX, x); maxX = Math.max(maxX, x); minY = Math.min(minY, y); maxY = Math.max(maxY, y) }
      expect(maxX - minX + 1).toBe(maxY - minY + 1)
      expect(maxX - minX + 1).toBe(Math.min(caso.caixa.w, caso.caixa.h))

      // Sem deformar: a cor no pixel bate com a origem prevista pelo recorte, escala uniforme nos dois eixos
      expect(src.cropWidth).toBeCloseTo(src.cropHeight, 6)
      const lado = r.size.width
      for (const [fx, fy] of [[0.25, 0.25], [0.5, 0.5], [0.75, 0.6]]) {
        const px = Math.floor(r.position.x + fx * lado)
        const py = Math.floor(r.position.y + fy * lado)
        const ox = src.cropX + (px + 0.5 - r.position.x) * (src.cropWidth / lado)
        const oy = src.cropY + (py + 0.5 - r.position.y) * (src.cropHeight / lado)
        const i = (py * s.largura + px) * 4
        expect(Math.abs(s.dados[i] - (ox / (caso.natural.width - 1)) * 255)).toBeLessThan(4)
        expect(Math.abs(s.dados[i + 1] - (oy / (caso.natural.height - 1)) * 255)).toBeLessThan(4)
      }
    })
  }
})

/**
 * Corrida do `use-image` instalado (revisão do Codex, 26/10): o `index.js` REAL roda com um React mínimo (um componente,
 * hooks por ordem de chamada) e um `<img>` falso cujo `decode()` o teste resolve na mão. A foto A demora; a seleção
 * troca para B; o `finally` de A grava a imagem de A depois, e o hook a devolve na URL de B.
 */
describe('Quadrado 1:1: foto atrasada A → seleção B', () => {
  const BASE = 'http://localhost:3000/templates/1/editor'
  const TAMANHOS: Record<string, { width: number; height: number }> = {
    'https://blob.exemplo/a.jpg': { width: 1600, height: 900 },
    'https://blob.exemplo/b.jpg': { width: 900, height: 1600 },
  }

  type ImgFalsa = { src: string; width: number; height: number; load: () => void; terminarDecode: () => Promise<void> }

  function montarUseImage() {
    const fonte = readFileSync(createRequire(import.meta.url).resolve('use-image'), 'utf8')
    const slots: unknown[] = []
    let i = 0
    let efeito: { deps: unknown[]; limpar?: () => void } | null = null
    let pendente: { fn: () => (() => void) | void; deps: unknown[] } | null = null
    const React = {
      useRef: (v?: unknown) => { const k = i++; if (!(k in slots)) slots[k] = { current: v }; return slots[k] },
      useState: (v: unknown) => { const k = i++; if (!(k in slots)) slots[k] = v; return [slots[k], () => {}] },
      useLayoutEffect: (fn: () => (() => void) | void, deps: unknown[]) => { pendente = { fn, deps } },
    }
    const criadas: ImgFalsa[] = []
    const documento = {
      createElement: () => {
        const ouvintes: Record<string, () => void> = {}
        let fimDoDecode: () => void = () => {}
        const alvo = {
          src: '', width: 0, height: 0,
          addEventListener: (t: string, f: () => void) => { ouvintes[t] = f },
          removeEventListener: (t: string) => { delete ouvintes[t] },
          decode: () => new Promise<void>((r) => { fimDoDecode = r }),
        }
        const img = new Proxy(alvo, {
          set(o, chave, valor) {
            if (chave === 'src') { o.src = new URL(String(valor), BASE).href; Object.assign(o, TAMANHOS[String(valor)] ?? {}) }
            else (o as Record<string | symbol, unknown>)[chave] = valor
            return true
          },
        })
        criadas.push({
          get src() { return alvo.src }, get width() { return alvo.width }, get height() { return alvo.height },
          load: () => ouvintes.load?.(),
          terminarDecode: async () => { fimDoDecode(); await new Promise((r) => setTimeout(r, 0)) },
        })
        return img
      },
    }
    const modulo = { exports: null as unknown as (url: string, co?: string) => [{ src: string; width: number; height: number } | undefined, string] }
    const g = globalThis as { document?: unknown }
    const anterior = g.document
    g.document = documento
    new Function('require', 'module', fonte)((n: string) => (n === 'react' ? React : undefined), modulo)
    const render = (url: string) => {
      i = 0
      const r = modulo.exports(url, 'anonymous')
      const p = pendente!
      if (!efeito || efeito.deps.some((d, k) => d !== p.deps[k])) {
        efeito?.limpar?.()
        efeito = { deps: p.deps, limpar: p.fn() || undefined }
      }
      return r
    }
    return { render, criadas, restaurar: () => { g.document = anterior } }
  }

  it('reproduz a corrida no use-image e a toolbar não usa as dimensões de A na camada B', async () => {
    const A = 'https://blob.exemplo/a.jpg'
    const B = 'https://blob.exemplo/b.jpg'
    const { render, criadas, restaurar } = montarUseImage()
    try {
      render(A)
      criadas[0].load() // A carregou; o decode() de A fica pendente
      render(B) // a seleção troca para B (o cleanup só tira os ouvintes de A)
      await criadas[0].terminarDecode() // o finally de A roda agora
      const [imagem] = render(B)

      // A corrida: o hook, já na URL de B, devolve a imagem de A
      expect(imagem?.src).toBe(A)
      expect(imagem).toMatchObject(TAMANHOS[A])

      // A toolbar: botão desabilitado (sem dimensões) e o clique não aplica nada
      expect(dimensoesDaFotoCarregada(imagem, B, BASE)).toBeUndefined()

      // Quando B chega, as dimensões são as de B
      criadas[1].load()
      await criadas[1].terminarDecode()
      const [imagemB] = render(B)
      expect(dimensoesDaFotoCarregada(imagemB, B, BASE)).toEqual(TAMANHOS[B])
    } finally {
      restaurar()
    }
  })

  it('identidade da URL: relativa resolve pela base, data: compara inteira, URL inválida ou sem dimensões não passa', () => {
    const img = (src: string, width = 10, height = 20) => ({ src, width, height })
    expect(dimensoesDaFotoCarregada(img('http://localhost:3000/uploads/x.png'), '/uploads/x.png', BASE)).toEqual({ width: 10, height: 20 })
    expect(dimensoesDaFotoCarregada(img('data:image/png;base64,AAA'), 'data:image/png;base64,AAA', BASE)).toEqual({ width: 10, height: 20 })
    expect(dimensoesDaFotoCarregada(img('data:image/png;base64,AAA'), 'data:image/png;base64,AAB', BASE)).toBeUndefined()
    expect(dimensoesDaFotoCarregada(img('http://localhost:3000/x.png'), '/x.png', undefined)).toBeUndefined()
    expect(dimensoesDaFotoCarregada(img('https://a/b.png', 0, 0), 'https://a/b.png', BASE)).toBeUndefined()
    expect(dimensoesDaFotoCarregada(undefined, 'https://a/b.png', BASE)).toBeUndefined()
  })
})
