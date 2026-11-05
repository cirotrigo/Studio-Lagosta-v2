/**
 * #9 — PARIDADE da `bg-foto` mascarada pelo arco-janela (MK-04, MK-05, MK-10): o editor (Konva REAL no Node: um Group
 * com o `clipFunc` que o `konva-layer-factory` monta — a escala da caixa em volta do `traceSvgPath` do editor, réplica
 * das linhas do `tracarMascara`) × o servidor (`CanvasRenderer` → `applyImageMaskClip` com o `Path2D` do @napi-rs/canvas),
 * Story e Feed, na caixa REAL (Story em y 806,4). Prova também que o alfa é CIRCULAR em px na caixa (a escala não
 * uniforme do path 0–100 compensada) e que `fracaoVisivelNoArco` é a fração de pixels que o alfa mostra (±0,5%).
 * Limite: napi × napi no Node — não é o Konva do navegador nem o componente React montado.
 */
import { describe, expect, it } from 'vitest'
import sharp from 'sharp'
import { Group } from 'konva/lib/Group'
import { Rect } from 'konva/lib/shapes/Rect'
import type { Shape } from 'konva/lib/Shape'
import type { Layer } from '@/types/template'
import { traceSvgPath } from '@/lib/konva/svg-path-clip'
import { fracaoVisivelNoArco, pathDoArcoJanela } from '@/lib/compositor/arquetipos/mascara'
import { pixelsDoNoKonva, pixelsDoServidor, type Pixels } from './suporte/konva-no-node'

const CASOS = {
  story: { canvas: { w: 1080, h: 1920 }, caixa: { x: 0, y: 806.4, w: 1080, h: 1114 } },
  feed: { canvas: { w: 1080, h: 1350 }, caixa: { x: 0, y: 594, w: 1080, h: 756 } },
} as const
const RAIO = 0.62
const luz = (p: Pixels, x: number, y: number) => p.dados[(y * p.largura + x) * 4]

async function servidor(nome: keyof typeof CASOS) {
  const { canvas, caixa } = CASOS[nome]
  const branca = await sharp({ create: { width: caixa.w, height: caixa.h, channels: 3, background: '#ffffff' } }).png().toBuffer()
  const bg = {
    id: 'bg-foto', name: 'Foto', type: 'image', visible: true, locked: false, order: 0,
    position: { x: caixa.x, y: caixa.y }, size: { width: caixa.w, height: caixa.h }, rotation: 0,
    fileUrl: `data:image/png;base64,${branca.toString('base64')}`,
    style: { objectFit: 'cover', cropPosition: 'center-middle', mask: { shapeId: 'arco-janela', path: pathDoArcoJanela(caixa, RAIO) } },
  } as unknown as Layer
  return pixelsDoServidor(canvas.w, canvas.h, '#000000', [bg])
}
function editor(nome: keyof typeof CASOS) {
  const { canvas, caixa } = CASOS[nome]
  const path = pathDoArcoJanela(caixa, RAIO)
  return pixelsDoNoKonva(canvas.w, canvas.h, '#000000', () => {
    const g = new Group({
      x: caixa.x,
      y: caixa.y,
      // As linhas do `tracarMascara` (konva-layer-factory.tsx): path 0–100 escalado para a caixa, escala desfeita depois.
      clipFunc: (ctx) => {
        ctx.scale(caixa.w / 100, caixa.h / 100)
        traceSvgPath(ctx, path)
        ctx.scale(100 / caixa.w, 100 / caixa.h)
      },
    })
    g.add(new Rect({ x: 0, y: 0, width: caixa.w, height: caixa.h, fill: '#ffffff' }))
    return g as unknown as Shape
  })
}

describe('#9 · paridade da bg-foto mascarada (editor × servidor)', () => {
  for (const nome of ['story', 'feed'] as const) {
    it(`MK-10 ${nome}: Konva-no-Node × servidor — pixels que diferem > 32 níveis`, async () => {
      const s = await servidor(nome)
      const k = editor(nome)
      let acima32 = 0
      let maior = 0
      for (let i = 0; i < s.dados.length; i += 4) {
        const d = Math.abs(s.dados[i] - k.dados[i])
        maior = Math.max(maior, d)
        if (d > 32) acima32++
      }
      console.info(`[MK-10] ${nome}: ${acima32} px > 32 níveis; maior diferença ${maior}`)
      expect(acima32).toBe(0)
      // O controle negativo: SEM a máscara no editor, a mesma comparação acusa os cantos.
      const semMascara = pixelsDoNoKonva(CASOS[nome].canvas.w, CASOS[nome].canvas.h, '#000000', () => new Rect({ ...CASOS[nome].caixa, width: CASOS[nome].caixa.w, height: CASOS[nome].caixa.h, fill: '#ffffff' }) as unknown as Shape)
      let cantos = 0
      for (let i = 0; i < s.dados.length; i += 4) if (Math.abs(s.dados[i] - semMascara.dados[i]) > 32) cantos++
      expect(cantos).toBeGreaterThan(50_000)
    })

    it(`MK-04 ${nome}: o alfa é um CÍRCULO de raio ${RAIO}×largura em px na caixa real (a escala não uniforme compensada)`, async () => {
      const s = await servidor(nome)
      const { caixa } = CASOS[nome]
      const r = RAIO * caixa.w
      let pior = 0
      for (let x = 10; x < caixa.w - 10; x += 10) {
        // A borda do alfa na coluna: a meia-luz (128) por interpolação linear entre os dois pixels que a cruzam.
        let borda = NaN
        for (let y = Math.floor(caixa.y) - 1; y < caixa.y + caixa.h - 1; y++) {
          const a = luz(s, x, y)
          const b = luz(s, x, y + 1)
          if (a < 128 && b >= 128) {
            borda = y + 0.5 + (128 - a) / (b - a)
            break
          }
        }
        const esperado = caixa.y + r - Math.sqrt(r * r - (x + 0.5 - caixa.w / 2) ** 2)
        pior = Math.max(pior, Math.abs(borda - esperado))
      }
      console.info(`[MK-04] ${nome}: pior desvio da borda do alfa ao círculo ${pior.toFixed(3)} px`)
      expect(pior).toBeLessThanOrEqual(1)
      // Os cantos de cima ficam no fundo; abaixo do toque, a lateral é foto.
      expect([luz(s, 2, Math.ceil(caixa.y) + 2), luz(s, caixa.w - 3, Math.ceil(caixa.y) + 2)]).toEqual([0, 0])
      expect(luz(s, 2, Math.round(caixa.y + caixa.h - 5))).toBe(255)
    })

    it(`MK-05 ${nome}: fracaoVisivelNoArco = a fração do alfa (soma) dentro do retângulo, ±0,5%`, async () => {
      const s = await servidor(nome)
      const { caixa } = CASOS[nome]
      const oy = Math.round(caixa.y) // retângulos em px inteiros da tela
      for (const ret of [
        { x: 440, y: 20, width: 200, height: 160 },
        { x: 0, y: 0, width: 180, height: 220 },
        { x: 900, y: 100, width: 180, height: 200 },
        { x: 300, y: 300, width: 400, height: 200 },
      ]) {
        let soma = 0
        for (let y = oy + ret.y; y < oy + ret.y + ret.height; y++) for (let x = ret.x; x < ret.x + ret.width; x++) soma += luz(s, x, y) / 255
        const alfa = soma / (ret.width * ret.height)
        const produto = fracaoVisivelNoArco({ ...ret, y: ret.y + oy - caixa.y }, caixa, RAIO)
        expect(Math.abs(produto - alfa), `${JSON.stringify(ret)}: produto ${produto.toFixed(4)} × alfa ${alfa.toFixed(4)}`).toBeLessThanOrEqual(0.005)
      }
    })
  }
})
