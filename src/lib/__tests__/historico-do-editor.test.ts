import { describe, expect, it } from 'vitest'
import { desfazerNaPilha, mesmaEntradaDeDesfazer, registrarEdicao, type PilhaDeDesfazer } from '../historico-do-editor'

describe('mesmaEntradaDeDesfazer', () => {
  it('sem gesto, a mesma chave funde só dentro de 800 ms', () => {
    expect(mesmaEntradaDeDesfazer({ key: 'k', time: 0 }, { coalesceKey: 'k' }, 500)).toBe(true)
    expect(mesmaEntradaDeDesfazer({ key: 'k', time: 0 }, { coalesceKey: 'k' }, 900)).toBe(false)
  })
  it('no gesto, a pausa longa não abre entrada nova', () => {
    expect(mesmaEntradaDeDesfazer({ key: 'g', time: 0 }, { coalesceKey: 'g', gesto: true }, 60_000)).toBe(true)
  })
  it('desfazer no meio do gesto (chave zerada) reabre a entrada', () => {
    expect(mesmaEntradaDeDesfazer({ key: null, time: 0 }, { coalesceKey: 'g', gesto: true }, 10)).toBe(false)
  })
  it('outra edição no meio do gesto também reabre', () => {
    expect(mesmaEntradaDeDesfazer({ key: 'layer:x', time: 0 }, { coalesceKey: 'g', gesto: true }, 10)).toBe(false)
  })
  it('sem chave nunca funde', () => {
    expect(mesmaEntradaDeDesfazer({ key: null, time: 0 }, undefined, 10)).toBe(false)
  })
})

describe('aplicar página de outro template é edição desfazível', () => {
  const naoClonar = () => {
    throw new Error('não devia clonar o design')
  }
  type Design = { canvas: { width: number; height: number; backgroundColor?: string }; layers: { id: string; content?: string }[] }
  const antes: Design = {
    canvas: { width: 1080, height: 1350, backgroundColor: '#1a1a1a' },
    layers: [{ id: 'titulo', content: 'Meu trabalho' }],
  }
  const aplicada: Design = { canvas: { width: 1080, height: 1920 }, layers: [{ id: 'da-outra' }] }

  it('a pilha da página ganha 1 entrada com o design de antes, e o refazer morre', () => {
    const historicos = new Map<string, PilhaDeDesfazer<Design>>([
      ['pagina-1', { past: [{ canvas: antes.canvas, layers: [] }], future: [aplicada] }],
    ])
    const ultima = registrarEdicao(historicos.get('pagina-1')!, () => structuredClone(antes), { key: 'texto', time: 0 }, undefined, 100)

    // A pilha é a do mapa — mutada, nunca trocada nem zerada
    expect(historicos.get('pagina-1')!.past).toHaveLength(2)
    expect(historicos.get('pagina-1')!.past[1]).toEqual(antes)
    expect(historicos.get('pagina-1')!.future).toEqual([])
    expect(ultima).toEqual({ key: null, time: 100 })
  })

  it('desfazer volta exatamente às camadas e ao canvas de antes', () => {
    const pilha: PilhaDeDesfazer<Design> = { past: [], future: [] }
    registrarEdicao(pilha, () => structuredClone(antes), { key: null, time: 0 }, undefined, 0)

    expect(desfazerNaPilha(pilha, () => aplicada)).toEqual(antes)
    expect(pilha.past).toEqual([])
    expect(pilha.future).toEqual([aplicada])
  })

  it('no mesmo gesto não empilha de novo nem clona o design', () => {
    const pilha: PilhaDeDesfazer<Design> = { past: [antes], future: [] }
    const ultima = registrarEdicao(pilha, naoClonar, { key: 'g', time: 0 }, { coalesceKey: 'g', gesto: true }, 5_000)

    expect(pilha.past).toHaveLength(1)
    expect(ultima).toEqual({ key: 'g', time: 5_000 })
  })

  it('sem passado, desfazer não mexe na pilha', () => {
    const pilha: PilhaDeDesfazer<Design> = { past: [], future: [aplicada] }
    expect(desfazerNaPilha(pilha, naoClonar)).toBeNull()
    expect(pilha.future).toEqual([aplicada])
  })
})
