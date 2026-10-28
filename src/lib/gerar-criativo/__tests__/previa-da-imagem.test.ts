/**
 * G4.2 — o que exige a prévia nova e como ela desenha a imagem (o piso do editor, o recorte pelo helper único, raio e
 * espelho). A paridade em pixels contra o servidor está em `src/lib/grades/__tests__/paridade-da-grade.test.ts`.
 */
import { describe, expect, it } from 'vitest'
import type { Layer } from '@/types/template'
import { resolveImageSourceRect } from '@/lib/image-fit'
import { calculateImageCrop } from '@/lib/image-crop-utils'
import { celula } from '@/lib/grades/__tests__/fixtures'
import { desenhoDaImagemNaPrevia, imagensQueExigemAPrevia } from '../previa-da-imagem'

const BLOB = 'https://2rhsgfleozgl5jbm.public.blob.vercel-storage.com'
const g = { id: 'g1', layout: '2-colunas' }
const cel = (extra: Partial<Layer> = {}) => celula('c0', g, 0, { x: 0, y: 0, w: 535, h: 1350 }, { fileUrl: `${BLOB}/a.jpg`, ...extra })
const foto = (extra: Partial<Layer> = {}): Layer =>
  ({ id: 'f', type: 'image', name: 'Foto', visible: true, locked: false, order: 0, position: { x: 0, y: 0 }, size: { width: 400, height: 300 }, fileUrl: `${BLOB}/f.jpg`, ...extra }) as Layer
const CROP = { x: 0.2, y: 0.1, width: 0.5, height: 0.4 }

describe('imagensQueExigemAPrevia', () => {
  it('toda célula de grade desenhada (com ou sem foto) e toda imagem com foto e recorte manual', () => {
    expect(imagensQueExigemAPrevia([cel(), cel({ id: 'vazia', fileUrl: '' } as Partial<Layer>)])).toEqual(['c0', 'vazia'])
    expect(imagensQueExigemAPrevia([foto({ style: { crop: CROP } })])).toEqual(['f'])
    expect(imagensQueExigemAPrevia([foto({ type: 'logo', style: { crop: CROP } })])).toEqual(['f'])
  })

  it('fica de fora: oculta, invisível, recorte sem foto, recorte degenerado, cover sem recorte e não imagem', () => {
    expect(imagensQueExigemAPrevia([cel()], new Set(['c0']))).toEqual([])
    expect(imagensQueExigemAPrevia([cel({ visible: false })])).toEqual([])
    expect(imagensQueExigemAPrevia([foto({ fileUrl: '', style: { crop: CROP } })])).toEqual([])
    expect(imagensQueExigemAPrevia([foto({ style: { crop: { x: 0, y: 0, width: 0, height: 1 } } })])).toEqual([])
    expect(imagensQueExigemAPrevia([foto({ style: { objectFit: 'cover', flipH: true } })])).toEqual([])
    expect(imagensQueExigemAPrevia([{ id: 's', type: 'shape', style: { crop: CROP } } as Layer])).toEqual([])
  })
})

describe('desenhoDaImagemNaPrevia', () => {
  const NAT = { width: 1600, height: 1200 }

  it('célula de 8×8 desenha 8×8 (piso do editor), foto avulsa pequena segue no piso de 20', () => {
    const d = desenhoDaImagemNaPrevia(celula('m', g, 0, { x: 0, y: 0, w: 8, h: 8 }), NAT)
    expect([d.largura, d.altura]).toEqual([8, 8])
    expect(desenhoDaImagemNaPrevia(foto({ size: { width: 10, height: 10 } }), NAT)).toMatchObject({ largura: 20, altura: 20 })
  })

  it('recorte manual: o retângulo do helper único, em px da foto', () => {
    const d = desenhoDaImagemNaPrevia(cel({ style: { objectFit: 'cover', crop: CROP, border: { radius: 30 } } as Layer['style'] }), NAT)
    const r = resolveImageSourceRect(NAT, { width: 535, height: 1350 }, { crop: CROP })!
    expect(d.crop).toEqual({ x: r.cropX, y: r.cropY, width: r.cropWidth, height: r.cropHeight })
    expect(d.cornerRadius).toBe(30)
    expect(d.espelho).toBeNull()
  })

  it('espelhos dentro da caixa; sem foto conferida, nada de recorte', () => {
    expect(desenhoDaImagemNaPrevia(cel({ style: { objectFit: 'cover', flipH: true, flipV: true } as Layer['style'] }), NAT).espelho).toEqual({ x: 535, y: 1350, scaleX: -1, scaleY: -1 })
    expect(desenhoDaImagemNaPrevia(cel({ style: { objectFit: 'cover', flipH: true } as Layer['style'] }), NAT).espelho).toEqual({ x: 535, y: 0, scaleX: -1, scaleY: 1 })
    expect(desenhoDaImagemNaPrevia(cel(), undefined).crop).toBeUndefined()
  })

  it('foto avulsa sem objectFit: o cover centrado de sempre da prévia (igual ao calculateImageCrop antigo)', () => {
    const d = desenhoDaImagemNaPrevia(foto(), NAT)
    const antigo = calculateImageCrop(NAT, { width: 400, height: 300 }, 'center-middle')
    expect(d.crop).toEqual({ x: antigo.cropX, y: antigo.cropY, width: antigo.cropWidth, height: antigo.cropHeight })
  })
})
