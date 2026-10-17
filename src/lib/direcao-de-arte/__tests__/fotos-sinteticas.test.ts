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

  it('cada caso tem as dimensões do formato, é PNG legível e só A1/A2 têm assunto — dentro da foto', async () => {
    for (const formato of ['story', 'feed'] as const) {
      const fotos = await fotosDoLote(formato)
      expect(fotos.map((f) => f.caso)).toEqual([...CASOS_DA_FOTO])
      for (const f of fotos) {
        const meta = await sharp(f.png).metadata()
        expect([meta.width, meta.height]).toEqual([DIMENSOES_DA_FOTO[formato].width, DIMENSOES_DA_FOTO[formato].height])
        expect(f.dataUrl.startsWith('data:image/png;base64,')).toBe(true)
        if (f.caso === 'A1' || f.caso === 'A2') {
          expect(f.assuntoVerdade).toEqual(caixaDoAssunto(formato))
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
