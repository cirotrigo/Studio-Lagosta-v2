import { describe, expect, it } from 'vitest'

import {
  ehTemplateDeTresLayouts,
  escolherLayoutPelaFoto,
  layoutDoNomeDaPagina,
} from '../layout-pela-foto'

describe('escolherLayoutPelaFoto', () => {
  it('a faixa mais calma recebe o texto', () => {
    expect(escolherLayoutPelaFoto({ topo: { energia: 10, luz: 100 }, rodape: { energia: 40, luz: 100 } }).layout).toBe('topo')
    expect(escolherLayoutPelaFoto({ topo: { energia: 40, luz: 100 }, rodape: { energia: 10, luz: 100 } }).layout).toBe('rodape')
  })

  it('diferença abaixo de 12% divide a peça', () => {
    const r = escolherLayoutPelaFoto({ topo: { energia: 30, luz: 100 }, rodape: { energia: 32, luz: 100 } })
    expect(r.layout).toBe('dividido')
    expect(r.diferenca).toBeLessThan(0.12)
    expect(r.motivo).toContain('equivalem')
  })

  it('12% cravado já decide (o limiar é exclusivo)', () => {
    expect(escolherLayoutPelaFoto({ topo: { energia: 88, luz: 0 }, rodape: { energia: 100, luz: 0 } }).layout).toBe('topo')
  })

  it('foto sem energia nenhuma (lisa) divide', () => {
    expect(escolherLayoutPelaFoto({ topo: { energia: 0, luz: 50 }, rodape: { energia: 0, luz: 200 } }).layout).toBe('dividido')
  })

  it('empate exato com limiar zero desempata pela faixa mais escura', () => {
    expect(escolherLayoutPelaFoto({ topo: { energia: 20, luz: 60 }, rodape: { energia: 20, luz: 180 } }, 0).layout).toBe('topo')
    expect(escolherLayoutPelaFoto({ topo: { energia: 20, luz: 180 }, rodape: { energia: 20, luz: 60 } }, 0).layout).toBe('rodape')
  })
})

describe('nomes do gerador', () => {
  it('reconhece o template "(3 layouts)"', () => {
    expect(ehTemplateDeTresLayouts('By Rock — Happy Hour (3 layouts)')).toBe(true)
    expect(ehTemplateDeTresLayouts('Story base (3 layouts)')).toBe(true)
    expect(ehTemplateDeTresLayouts('Arte Rápida')).toBe(false)
    expect(ehTemplateDeTresLayouts(null)).toBe(false)
  })

  it('lê o layout pelo rótulo, não pela descrição (o Dividido cita topo E rodapé)', () => {
    expect(layoutDoNomeDaPagina('1 · Dividido — manchete no topo, serviço no rodapé')).toBe('dividido')
    expect(layoutDoNomeDaPagina('2 · Topo — manchete e apoio no terço superior')).toBe('topo')
    expect(layoutDoNomeDaPagina('3 · Rodapé — bloco no terço inferior, foto domina')).toBe('rodape')
    expect(layoutDoNomeDaPagina('Página 1')).toBeNull()
    expect(layoutDoNomeDaPagina(undefined)).toBeNull()
  })
})
