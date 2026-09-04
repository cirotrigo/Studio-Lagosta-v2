import { describe, it, expect } from 'vitest'

import {
  normalizarCamadas,
  pesoDeFonteValido,
  prepararCamadasParaGravar,
  validarCamadas,
} from '../layer-contract'
import type { Layer } from '@/types/template'

const texto = (extra: Partial<Layer> = {}): Layer => ({
  id: 't1',
  type: 'text',
  name: 'Titulo',
  visible: true,
  locked: false,
  order: 0,
  position: { x: 10, y: 10 },
  size: { width: 500, height: 100 },
  content: 'Olá',
  style: { fontSize: 40, fontFamily: 'Lobster', color: '#fff' },
  ...extra,
})

describe('pesoDeFonteValido', () => {
  it('arredonda para múltiplo de 100 e limita a 100..900', () => {
    expect(pesoDeFonteValido(250)).toBe(300)
    expect(pesoDeFonteValido(310)).toBe(300)
    expect(pesoDeFonteValido(50)).toBe(100)
    expect(pesoDeFonteValido(1000)).toBe(900)
    expect(pesoDeFonteValido('bold')).toBe(700)
    expect(pesoDeFonteValido('xis')).toBeNull()
  })
})

describe('validarCamadas', () => {
  it('lê array, string e string dupla-codificada', () => {
    const arr = [texto()]
    expect(validarCamadas(arr).camadas).toHaveLength(1)
    expect(validarCamadas(JSON.stringify(arr)).camadas).toHaveLength(1)
    expect(validarCamadas(JSON.stringify(JSON.stringify(arr))).camadas).toHaveLength(1)
  })

  it('recusa camada sem tamanho e diz qual', () => {
    const r = validarCamadas([{ ...texto(), size: undefined }])
    expect(r.camadas).toHaveLength(0)
    expect(r.problemas[0]).toMatch(/camada t1/)
    expect(r.problemas[0]).toMatch(/size/)
  })

  it('entrada ilegível devolve zero camadas e um problema', () => {
    const r = validarCamadas('{nao é json')
    expect(r.camadas).toEqual([])
    expect(r.problemas).toHaveLength(1)
  })
})

describe('normalizarCamadas', () => {
  it('corrige fontWeight e grava a entrelinha nos dois campos', () => {
    const { camadas, avisos } = normalizarCamadas([texto({ style: { fontSize: 40, fontWeight: 250, lineHeight: 0.94 } })])
    expect(camadas[0].style?.fontWeight).toBe(300)
    expect(camadas[0].style?.lineHeight).toBe(0.94)
    expect(camadas[0].textboxConfig?.autoWrap?.lineHeight).toBe(0.94)
    expect(camadas[0].textboxConfig?.autoWrap?.autoExpand).toBe(true)
    expect(avisos.some((a) => a.includes('fontWeight 250 → 300'))).toBe(true)
  })

  it('a entrelinha do autoWrap vence a do style quando divergem (é a que o render lê)', () => {
    const { camadas } = normalizarCamadas([
      texto({ style: { fontSize: 40, lineHeight: 1.5 }, textboxConfig: { autoWrap: { lineHeight: 1.1 } } as any }),
    ])
    expect(camadas[0].style?.lineHeight).toBe(1.1)
    expect(camadas[0].textboxConfig?.autoWrap?.lineHeight).toBe(1.1)
  })

  it('renumera order pela ordem estável e imagem ganha cover', () => {
    const { camadas } = normalizarCamadas([
      texto({ id: 'b', order: 5 }),
      { ...texto({ id: 'a', order: 2 }), type: 'image', style: {} },
      texto({ id: 'c', order: undefined }),
    ])
    expect(camadas.map((c) => c.id)).toEqual(['a', 'c', 'b'])
    expect(camadas.map((c) => c.order)).toEqual([0, 1, 2])
    expect(camadas[0].style?.objectFit).toBe('cover')
  })
})

describe('prepararCamadasParaGravar', () => {
  it('lança em vez de gravar metade', () => {
    expect(() => prepararCamadasParaGravar([texto(), { id: 'x', type: 'text' }])).toThrow(/camada x/)
  })
})
