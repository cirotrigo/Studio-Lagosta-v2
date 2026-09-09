import { expect, it, vi } from 'vitest'
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { resolve } from 'node:path'
import type { Layer } from '@/types/template'
vi.mock('@/lib/posts/register-project-fonts', () => ({ fetchBuffer: async (url: string) => readFileSync(url) }))
it('renderiza duas cópias editáveis locais com difusão e gradiente', async () => {
  const root = resolve('.tmp-medicao-compositor')
  const out = resolve(root, 'real-difusao'); mkdirSync(out, { recursive: true })
  const snapshot = JSON.parse(readFileSync(resolve(root, 'snapshot.json'), 'utf8'))
  const real = snapshot.casos.find((c: any) => c.projeto.id === 1)
  const { GlobalFonts } = await import('@napi-rs/canvas')
  for (const f of real.fontes) expect(GlobalFonts.registerFromPath(snapshot.assets[f.fileUrl], f.fontFamily)).toBeTruthy()
  const base: Layer[] = JSON.parse(readFileSync(resolve(root, '1-anterior-0.png.layers.json'), 'utf8'))
  const { CanvasRenderer } = await import('@/lib/canvas-renderer')
  const { medirContrasteDaPeca } = await import('@/lib/compositor/regua')
  const sharp = (await import('sharp')).default
  const resultados = []
  for (const tipo of ['difusao', 'gradiente']) {
    const layers = structuredClone(base)
    for (const l of layers.filter((l) => l.type === 'text')) {
      if (tipo === 'difusao') Object.assign(l.effects!.background!, { blur: 850, padding: 220, paddingX: 260, paddingY: 180, opacity: 1, borderRadius: 180, offsetX: -60, offsetY: -30 })
      else { delete l.effects!.background; l.order += 1 }
    }
    if (tipo === 'gradiente') layers.splice(1, 0, {
      id: 'gradiente-local-real', name: 'Gradiente suave', type: 'gradient', visible: true, locked: false, order: 1,
      position: { x: 0, y: 0 }, size: { width: 1080, height: 1200 },
      style: { gradientType: 'linear', gradientStartX: 0, gradientStartY: 0, gradientEndX: 0, gradientEndY: 1,
        gradientStops: [[0, .58], [.15, .54], [.32, .41], [.55, .20], [.8, .04], [1, 0]].map(([position, opacity], i) => ({ id: `s${i}`, position, opacity, color: '#000000' })) },
    })
    expect(layers.filter((l) => l.type === 'text').map((l) => l.content)).toEqual(base.filter((l) => l.type === 'text').map((l) => l.content))
    expect(layers.find((l) => l.id === 'bg-foto')).toEqual(base.find((l) => l.id === 'bg-foto'))
    expect(layers.find((l) => l.id === 'logo')).toEqual(base.find((l) => l.id === 'logo'))
    const design = { canvas: { width: 1080, height: 1920 }, layers }
    const png = await new CanvasRenderer(1080, 1920).renderDesign(design)
    writeFileSync(resolve(out, `${tipo}.png`), png)
    writeFileSync(resolve(out, `${tipo}.design.json`), JSON.stringify(design, null, 2))
    await sharp(png).resize(360).png().toFile(resolve(out, `${tipo}-360.png`))
    const regua = await medirContrasteDaPeca({ layers, canvas: design.canvas, background: '#000000', faixa: [0,1], corrigir: false })
    resultados.push({ tipo, contraste: regua.medidas, avisos: regua.avisos })
  }
  const labels = Buffer.from('<svg width="744" height="48"><rect width="744" height="48" fill="#171717"/><text x="8" y="30" fill="white" font-family="Arial" font-size="20">Difusão ampliada</text><text x="392" y="30" fill="white" font-family="Arial" font-size="20">Gradiente suave</text></svg>')
  await sharp({ create: { width: 744, height: 688, channels: 4, background: '#171717' } }).composite([{ input: labels, left: 0, top: 0 }, { input: resolve(out, 'difusao-360.png'), left: 0, top: 48 }, { input: resolve(out, 'gradiente-360.png'), left: 384, top: 48 }]).png().toFile(resolve(out, 'comparacao.png'))
  writeFileSync(resolve(out, 'medidas.json'), JSON.stringify(resultados, null, 2))
})
