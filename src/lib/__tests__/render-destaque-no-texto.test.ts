/**
 * O render server-side de uma camada `text` com `destaques` desenha o trecho
 * marcado com a cor do `destaque` (pelo caminho do rich text) e o resto com a
 * cor da camada. Sem `destaques`, o texto sai inteiro na cor da camada.
 * Mesmo canvas de Node dos testes de paridade (`@napi-rs/canvas`).
 */
import { createCanvas, loadImage } from '@napi-rs/canvas'
import { describe, expect, it } from 'vitest'
import type { Layer } from '@/types/template'
import { CanvasRenderer } from '@/lib/canvas-renderer'

const VERMELHO = [230, 57, 70] as const

async function pixelsDe(layers: Layer[]) {
  const png = await new CanvasRenderer(400, 120).renderDesign({
    canvas: { width: 400, height: 120, backgroundColor: '#ffffff' },
    layers,
  } as never)
  const img = await loadImage(png)
  const c = createCanvas(img.width, img.height)
  const ctx = c.getContext('2d')
  ctx.drawImage(img, 0, 0)
  return ctx.getImageData(0, 0, img.width, img.height).data
}

/** Quantos pixels estão perto da cor (tolerância para antialias). */
function contar(dados: Uint8ClampedArray, cor: readonly [number, number, number]) {
  let n = 0
  for (let i = 0; i < dados.length; i += 4) {
    if (Math.abs(dados[i] - cor[0]) < 40 && Math.abs(dados[i + 1] - cor[1]) < 40 && Math.abs(dados[i + 2] - cor[2]) < 40) n++
  }
  return n
}

const camada = (extra: Partial<Layer>): Layer => ({
  id: 't',
  type: 'text',
  name: 'Manchete',
  visible: true,
  locked: false,
  order: 0,
  position: { x: 10, y: 10 },
  size: { width: 380, height: 100 },
  content: 'AAAA BBBB',
  style: { fontFamily: 'Arial', fontSize: 48, color: '#000000' },
  ...extra,
})

describe('render-engine — destaque por marcação na camada text', () => {
  it('com destaques, o trecho marcado sai na cor do destaque e o resto na cor da camada', async () => {
    const dados = await pixelsDe([camada({ destaques: [{ inicio: 5, fim: 9 }], destaque: { fill: '#e63946' } })])
    expect(contar(dados, VERMELHO)).toBeGreaterThan(50)
    expect(contar(dados, [0, 0, 0])).toBeGreaterThan(50)
  })

  it('sem destaques nada muda: nenhum pixel vermelho', async () => {
    const dados = await pixelsDe([camada({ destaque: { fill: '#e63946' } })])
    expect(contar(dados, VERMELHO)).toBe(0)
    expect(contar(dados, [0, 0, 0])).toBeGreaterThan(50)
  })
})
