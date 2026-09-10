import { describe, expect, it } from 'vitest'
import { ajusteDeAlturaMedida } from '../texto-altura-automatica'

const base = { x: 150, y: 1676, width: 620, atual: 45, natural: 48 }

describe('altura medida de texto com crescimento automático', () => {
  it('âncora no topo grava só a altura — nunca um y velho por cima do deslocamento da pilha', () => {
    const ajuste = ajusteDeAlturaMedida({ ...base, anchor: 'top' })
    expect(ajuste).toEqual({ size: { width: 620, height: 48 } })
    expect('position' in ajuste).toBe(false)
  })

  it('âncora embaixo sobe a caixa pelo quanto ela cresceu', () => {
    expect(ajusteDeAlturaMedida({ ...base, anchor: 'bottom' }).position).toEqual({ x: 150, y: 1673 })
  })

  it('âncora no meio divide o crescimento entre cima e baixo', () => {
    expect(ajusteDeAlturaMedida({ ...base, anchor: 'middle', natural: 50 }).position).toEqual({ x: 150, y: 1674 })
  })
})
