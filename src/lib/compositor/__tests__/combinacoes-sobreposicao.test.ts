import { describe, expect, it } from 'vitest'

import type { Layer } from '@/types/template'

import { arranjoDasCamadas, vaoDaPagina } from '../combinacoes'

/** Régua falsa: uma linha por \n, altura = linhas × fontSize × lineHeight. */
const medirFalso = (layer: Layer) => {
  const fontSize = Number(layer.style?.fontSize ?? 16)
  const linhas = (layer.content ?? '').split('\n')
  return {
    height: linhas.length * fontSize * Number(layer.style?.lineHeight ?? 1.1),
    maxLineWidth: Math.min(layer.size.width - 12, Math.max(...linhas.map((l) => l.length * fontSize * 0.55))),
    lineCount: linhas.length,
  }
}

const texto = (id: string, content: string, y: number, altura: number, fontSize: number, lineHeight: number): Layer =>
  ({
    id,
    name: id,
    type: 'text',
    visible: true,
    locked: false,
    order: 0,
    rotation: 0,
    content,
    style: { fontFamily: 'Bevan', fontSize, lineHeight, color: '#FFFFFF', textAlign: 'left' },
    position: { x: 92, y },
    size: { width: 896, height: altura },
    metadata: { groupId: 'g' },
  }) as Layer

describe('vão da página entre textos que se sobrepõem', () => {
  it('sobrepor até meia linha é lockup apertado e vale; mais que isso não dá vão', () => {
    const anterior = { y: 0, altura: 100, umaLinha: 50 }
    expect(vaoDaPagina(anterior, 110)).toBe(10)
    expect(vaoDaPagina(anterior, 80)).toBe(-20)
    expect(vaoDaPagina(anterior, 70)).toBeNull()
  })

  it('a voz 2 desenhada sobre a 2ª linha da manchete (variantes do Espeto) cai no ritmo da casa', () => {
    // A caixa da voz 1 guarda as duas linhas; a voz 2 repete a última, por cima dela
    const a = arranjoDasCamadas({
      id: 'promo:g',
      nome: 'Promoção — story',
      origem: 'pagina',
      camadas: [texto('headline', 'COSTELA\nNO BAFO', 231, 157, 76, 0.95), texto('headline2', 'NO BAFO', 303, 85, 76, 0.95)],
      medir: medirFalso,
    })!
    expect(a.textos.map((t) => t.papel)).toEqual(['headline', 'headline2'])
    expect(a.textos[1].vaoAntes).toBeNull()
  })

  it('duas vozes empilhadas com as caixas encostando um pouco mantêm o vão da página', () => {
    const a = arranjoDasCamadas({
      id: 'hh:g',
      nome: 'Happy hour',
      origem: 'pagina',
      camadas: [texto('headline', 'HAPPY', 1300, 80, 80, 1), texto('headline2', 'HOUR', 1370, 80, 80, 1)],
      medir: medirFalso,
    })!
    expect(a.textos[1].vaoAntes).toBe(-10)
  })
})
