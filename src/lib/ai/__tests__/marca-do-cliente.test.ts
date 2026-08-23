import { describe, expect, it } from 'vitest'
import sharp from 'sharp'
import { comporLogo, instrucaoMarcaDoCliente, logoModePadraoPara } from '../logo-compositor'

/**
 * Co-branding (23/08/2026): a peça da Lagosta Criativa leva a marca da casa E a
 * do cliente citado. As duas são COMPOSTAS (não desenhadas), cada uma num
 * canto decidido em código — por isso `cantoFixo` existe.
 */
describe('marca do cliente citado', () => {
  it('o prompt reserva o canto do cliente e proíbe desenhar a marca', () => {
    const txt = instrucaoMarcaDoCliente('bottom-left', 'Empório Fonseca')
    expect(txt).toContain('[CLIENT LOGO — DO NOT DRAW]')
    expect(txt).toContain('Empório Fonseca')
    expect(txt).toContain('lower-left corner')
    expect(txt).toContain('do NOT draw')
  })

  it('a Lagosta Criativa (8) compõe a própria marca — duas marcas desenhadas seriam loteria', () => {
    expect(logoModePadraoPara(8)).toBe('compor')
    expect(logoModePadraoPara(3)).toBe('compor')
    expect(logoModePadraoPara(1)).toBe('modelo')
  })

  it('cantoFixo manda a logo para o canto pedido mesmo quando ele é o mais "barulhento"', async () => {
    // Arte: metade esquerda ruidosa (xadrez), metade direita lisa. A disputa
    // por calma escolheria a direita; o canto fixo obriga a esquerda.
    const w = 400
    const h = 400
    const xadrez = Buffer.alloc(w * h * 3)
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const i = (y * w + x) * 3
        const v = x < w / 2 ? (((x >> 3) + (y >> 3)) % 2 ? 255 : 0) : 128
        xadrez[i] = xadrez[i + 1] = xadrez[i + 2] = v
      }
    }
    const arte = await sharp(xadrez, { raw: { width: w, height: h, channels: 3 } }).png().toBuffer()
    const logo = await sharp({ create: { width: 80, height: 40, channels: 4, background: { r: 255, g: 120, b: 0, alpha: 1 } } })
      .png()
      .toBuffer()
    const r = await comporLogo(arte, logo, { cantoFixo: 'bottom-left', formato: 'feed', larguraRatio: 0.13 })
    expect(r.corner).toBe('bottom-left')
    const meta = await sharp(r.buffer).metadata()
    expect(meta.width).toBe(w)
  })
})

describe('versão negativa por falta de contraste', () => {
  it('logo escura em peça escura sai em branco (knockout), preservando o desenho', async () => {
    const w = 400, h = 400
    const arte = await sharp({ create: { width: w, height: h, channels: 3, background: { r: 12, g: 10, b: 14 } } }).png().toBuffer()
    // logo escura (luminância ~40)
    const logo = await sharp({ create: { width: 100, height: 40, channels: 4, background: { r: 40, g: 38, b: 42, alpha: 1 } } }).png().toBuffer()
    const r = await comporLogo(arte, logo, { cantoFixo: 'bottom-left', formato: 'feed' })
    expect(r.versao).toBe('negativa')
    // o canto agora tem pixels claros (a marca ficou visível)
    const stats = await sharp(r.buffer).extract({ left: 10, top: h - 60, width: 120, height: 50 }).toBuffer().then((b) => sharp(b).greyscale().stats())
    expect(stats.channels[0].max).toBeGreaterThan(200)
  })

  it('com contraste bom, o arquivo sai na cor original', async () => {
    const arte = await sharp({ create: { width: 400, height: 400, channels: 3, background: { r: 12, g: 10, b: 14 } } }).png().toBuffer()
    const logo = await sharp({ create: { width: 100, height: 40, channels: 4, background: { r: 255, g: 120, b: 0, alpha: 1 } } }).png().toBuffer()
    const r = await comporLogo(arte, logo, { cantoFixo: 'bottom-left', formato: 'feed' })
    expect(r.versao).toBe('original')
  })
})
