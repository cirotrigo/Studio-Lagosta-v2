/**
 * A medição da foto, com imagens SINTÉTICAS geradas pelo sharp — sem rede,
 * sem banco. O que se confere: a luz sai do retângulo certo, o `cover`
 * centralizado é simulado (a foto é medida como aparece na peça), e a
 * energia de borda separa faixa lisa de faixa texturizada.
 */
import sharp from 'sharp'
import { describe, expect, it } from 'vitest'

import { lerFotoComoCover, medirFaixasDaFoto, medirLuzDaFoto } from '../halo-medicao'

/** PNG de `width`×`height` pintado pixel a pixel por `cor(x, y)` (cinza 0..255). */
async function imagem(width: number, height: number, cor: (x: number, y: number) => number): Promise<Buffer> {
  const raw = Buffer.alloc(width * height * 3)
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const v = Math.max(0, Math.min(255, Math.round(cor(x, y))))
      const i = (y * width + x) * 3
      raw[i] = v
      raw[i + 1] = v
      raw[i + 2] = v
    }
  }
  return sharp(raw, { raw: { width, height, channels: 3 } }).png().toBuffer()
}

describe('medirLuzDaFoto', () => {
  it('metade clara em cima, metade escura embaixo — cada retângulo lê a sua metade', async () => {
    const foto = await imagem(400, 800, (_x, y) => (y < 400 ? 240 : 20))
    const canvas = { width: 400, height: 800 }
    const [topo, rodape] = await medirLuzDaFoto(foto, {
      canvas,
      rects: [
        { x: 40, y: 40, width: 320, height: 300 },
        { x: 40, y: 460, width: 320, height: 300 },
      ],
    })
    expect(topo).not.toBeNull()
    expect(rodape).not.toBeNull()
    expect(topo!.media).toBeGreaterThan(230)
    expect(topo!.p75).toBeGreaterThan(230)
    expect(rodape!.media).toBeLessThan(30)
    expect(rodape!.p75).toBeLessThan(30)
  })

  it('simula o cover centralizado: o que fica fora do recorte não entra na conta', async () => {
    // Foto paisagem 1200×600 com o quarto esquerdo PRETO. Num canvas 300×600
    // (retrato) o cover pega só os 300px centrais da largura — tudo branco.
    // Esticar a foto inteira na caixa leria o preto e erraria a média.
    const foto = await imagem(1200, 600, (x) => (x < 300 ? 0 : 255))
    const canvas = { width: 300, height: 600 }
    const [luz] = await medirLuzDaFoto(foto, {
      canvas,
      rects: [{ x: 0, y: 0, width: 300, height: 600 }],
    })
    expect(luz!.media).toBeGreaterThan(250)
  })

  it('retângulo fora do quadro devolve null, nunca um número inventado', async () => {
    const foto = await imagem(100, 100, () => 128)
    const [fora, degenerado] = await medirLuzDaFoto(foto, {
      canvas: { width: 100, height: 100 },
      rects: [
        { x: 500, y: 500, width: 50, height: 50 },
        { x: 10, y: 10, width: 0, height: 20 },
      ],
    })
    expect(fora).toBeNull()
    expect(degenerado).toBeNull()
  })

  it('aceita a foto já decodificada, sem decodificar de novo', async () => {
    const foto = await imagem(200, 400, () => 200)
    const raster = await lerFotoComoCover(foto, { width: 200, height: 400 })
    expect(raster.stride).toBeGreaterThanOrEqual(1)
    const [luz] = await medirLuzDaFoto(raster, {
      canvas: raster.canvas,
      rects: [{ x: 0, y: 0, width: 200, height: 400 }],
    })
    expect(Math.round(luz!.media)).toBe(200)
  })
})

describe('medirFaixasDaFoto', () => {
  it('faixa lisa tem energia baixa; faixa xadrez tem energia alta', async () => {
    // Topo: cinza liso. Rodapé: xadrez de 4px, muita borda.
    const foto = await imagem(400, 800, (x, y) =>
      y < 400 ? 128 : ((Math.floor(x / 4) + Math.floor(y / 4)) % 2 === 0 ? 30 : 220),
    )
    const faixas = await medirFaixasDaFoto(foto, { width: 400, height: 800 })
    expect(faixas.topo.energia).toBeLessThan(5)
    expect(faixas.rodape.energia).toBeGreaterThan(50)
    expect(Math.round(faixas.topo.luz)).toBe(128)
  })
})
