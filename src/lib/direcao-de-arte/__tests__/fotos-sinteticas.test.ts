/** Piloto sintético — as fotos sintéticas são determinísticas, têm as dimensões do formato e o assunto construído cabe na foto. */
import { createHash } from 'node:crypto'
import sharp from 'sharp'
import { describe, expect, it } from 'vitest'
import { CASOS_DA_FOTO, DIMENSOES_DA_FOTO, caixaDoAssunto, fotoSintetica, fotosDoLote, prng } from './suporte/fotos-sinteticas'

const sha = (b: Buffer) => createHash('sha256').update(b).digest('hex')

describe('fotos sintéticas', () => {
  it('determinísticas: a mesma semente dá o mesmo PNG; sementes diferentes, PNGs diferentes', async () => {
    const [a, b, c] = await Promise.all([fotoSintetica('A1', 'story', 7), fotoSintetica('A1', 'story', 7), fotoSintetica('A1', 'story', 8)])
    expect(sha(a.png)).toBe(sha(b.png))
    expect(sha(a.png)).not.toBe(sha(c.png))
    const r1 = prng(42)
    const r2 = prng(42)
    expect([r1(), r1(), r1()]).toEqual([r2(), r2(), r2()])
  }, 60_000)

  it('cada caso tem as dimensões do formato, é PNG legível e só A1/A2/A3 têm assunto — dentro da foto', async () => {
    for (const formato of ['story', 'feed'] as const) {
      const fotos = await fotosDoLote(formato)
      expect(fotos.map((f) => f.caso)).toEqual([...CASOS_DA_FOTO])
      for (const f of fotos) {
        const meta = await sharp(f.png).metadata()
        expect([meta.width, meta.height]).toEqual([DIMENSOES_DA_FOTO[formato].width, DIMENSOES_DA_FOTO[formato].height])
        expect(f.dataUrl.startsWith('data:image/png;base64,')).toBe(true)
        if (f.caso === 'A1' || f.caso === 'A2' || f.caso === 'A3') {
          expect(f.assuntoVerdade).toEqual(caixaDoAssunto(formato, f.caso))
          expect(f.assuntoVerdade!.x + f.assuntoVerdade!.width).toBeLessThanOrEqual(f.width)
          expect(f.assuntoVerdade!.y + f.assuntoVerdade!.height).toBeLessThanOrEqual(f.height)
        } else expect(f.assuntoVerdade).toBeNull()
      }
    }
  }, 120_000)

  it('A1 tem contraste forte na caixa do assunto e A2 fraco; C e D são lisos; E varia de claro a escuro', async () => {
    const stats = async (png: Buffer, r?: { left: number; top: number; width: number; height: number }) => {
      const img = r ? sharp(png).extract(r) : sharp(png)
      const { data, info } = await img.greyscale().raw().toBuffer({ resolveWithObject: true })
      let min = 255, max = 0
      for (let i = 0; i < info.width * info.height; i++) { const v = data[i]; if (v < min) min = v; if (v > max) max = v }
      return { min, max }
    }
    const caixa = caixaDoAssunto('story')
    const r = { left: caixa.x, top: caixa.y, width: caixa.width, height: caixa.height }
    const a1 = await stats((await fotoSintetica('A1', 'story')).png, r)
    const a2 = await stats((await fotoSintetica('A2', 'story')).png, r)
    expect(a1.max - a1.min).toBeGreaterThan(150)
    expect(a2.max - a2.min).toBeLessThan(40)
    const c = await stats((await fotoSintetica('C', 'story')).png)
    const d = await stats((await fotoSintetica('D', 'story')).png)
    expect(c.max - c.min).toBe(0)
    expect(d.max - d.min).toBe(0)
    const e = await fotoSintetica('E', 'story')
    const topo = await stats(e.png, { left: 0, top: 0, width: 1080, height: 10 })
    const base = await stats(e.png, { left: 0, top: 1910, width: 1080, height: 10 })
    expect(topo.min).toBeGreaterThan(220)
    expect(base.max).toBeLessThan(45)
  }, 120_000)
})

describe('A3 — assunto na borda superior sobre fundo escuro (adendo § 1/§ 2)', () => {
  it('a caixa fica colada ao topo, centrada, fora das zonas de texto dos arquétipos de centro (y ≥ 0,42); o fundo é escuro (~72) e o assunto claro', async () => {
    const sharp = (await import('sharp')).default
    for (const formato of ['story', 'feed'] as const) {
      const f = await fotoSintetica('A3', formato)
      const { width, height } = DIMENSOES_DA_FOTO[formato]
      expect(f.assuntoVerdade).toEqual({ x: Math.round(width * 0.3), y: Math.round(height * 0.03), width: Math.round(width * 0.4), height: Math.round(height * 0.17) })
      expect(f.assuntoVerdade!.y + f.assuntoVerdade!.height).toBeLessThan(Math.round(height * 0.42))
      const fundo = await sharp(f.png).extract({ left: 0, top: Math.round(height * 0.5), width, height: 40 }).toBuffer().then((b) => sharp(b).stats())
      expect(fundo.channels[0].mean).toBeGreaterThan(60)
      expect(fundo.channels[0].mean).toBeLessThan(85)
      const assunto = await sharp(f.png).extract({ left: f.assuntoVerdade!.x, top: f.assuntoVerdade!.y, width: f.assuntoVerdade!.width, height: f.assuntoVerdade!.height }).toBuffer().then((b) => sharp(b).stats())
      expect(assunto.channels[0].mean).toBeGreaterThan(120)
    }
  }, 60_000)
})
