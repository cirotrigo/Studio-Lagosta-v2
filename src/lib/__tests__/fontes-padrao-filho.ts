/**
 * Processo-filho de `fontes-padrao-processo-isolado.test.ts` (o registro de fontes do @napi-rs/canvas é global, então
 * cada medida nasce num processo novo). Imprime UMA linha JSON no stdout. Só canvas sintético; sem rede, sem banco.
 *   modo `fontes`: registro padrão e, por família/peso, o hash dos pixels e a largura da mesma frase;
 *   modo `miniatura-fria`: `generateThumbnail` num processo que nunca desenhou nada;
 *   modo `miniatura-quente`: o mesmo design, depois de um render completo do CanvasRenderer no mesmo processo.
 */
import { createHash } from 'node:crypto'
import { createCanvas } from '@napi-rs/canvas'
import type { DesignData } from '@/types/template'

const FRASE = 'ALMOÇO às 12h — ÇÃÉ'
const hash = (b: Uint8ClampedArray | Buffer) => createHash('sha256').update(b).digest('hex')

function raster(font: string, texto = FRASE) {
  const ctx = createCanvas(640, 120).getContext('2d')
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, 640, 120)
  ctx.fillStyle = '#000000'
  ctx.font = font
  ctx.fillText(texto, 10, 80)
  return { hash: hash(ctx.getImageData(0, 0, 640, 120).data), largura: ctx.measureText(texto).width }
}

const design: DesignData = {
  canvas: { width: 1080, height: 1080, backgroundColor: '#ffffff' },
  layers: ['sans-serif', 'serif', 'FamiliaQueNaoExiste', 'Montserrat'].map((fontFamily, i) => ({
    id: `t${i}`,
    name: `t${i}`,
    type: 'text',
    visible: true,
    locked: false,
    order: i,
    content: FRASE,
    position: { x: 40, y: 80 + i * 240 },
    size: { width: 1000, height: 200 },
    style: { fontFamily, fontSize: 72, fontWeight: i % 2 ? '700' : '400', fill: '#111111' },
  })),
} as unknown as DesignData

async function main() {
  const modo = process.argv[2]
  if (modo === 'fontes') {
    const { garantirFontesPadrao } = await import('@/lib/canvas-renderer')
    const estado = garantirFontesPadrao()
    const casos: Record<string, { hash: string; largura: number }> = {}
    for (const familia of ['Montserrat', 'sans-serif', 'serif', 'FamiliaQueNaoExiste']) {
      for (const peso of ['400', '700']) casos[`${familia} ${peso}`] = raster(`${peso} 40px ${familia}`)
    }
    // Tofu: o Ç da família tem o mesmo desenho de um código não atribuído (U+0378, sempre .notdef)?
    const tofu: Record<string, boolean> = {}
    for (const familia of ['sans-serif', 'serif', 'FamiliaQueNaoExiste']) {
      for (const peso of ['400', '700']) tofu[`${familia} ${peso}`] = raster(`${peso} 40px ${familia}`, 'Ç').hash === raster(`${peso} 40px ${familia}`, '͸').hash
    }
    console.log(JSON.stringify({ estado, casos, tofu }))
    return
  }
  const { generateThumbnail } = await import('@/lib/render-engine')
  if (modo === 'miniatura-quente') {
    const { CanvasRenderer } = await import('@/lib/canvas-renderer')
    await new CanvasRenderer(1080, 1080).renderDesign(design, {})
  } else if (modo !== 'miniatura-fria') throw new Error(`modo desconhecido: ${modo}`)
  const png = await generateThumbnail(design, {}, { width: 300, height: 300 })
  const ctx = createCanvas(300, 300).getContext('2d')
  const { loadImage } = await import('@napi-rs/canvas')
  ctx.drawImage(await loadImage(png), 0, 0)
  console.log(JSON.stringify({ hash: hash(ctx.getImageData(0, 0, 300, 300).data) }))
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
