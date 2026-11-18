import { describe, expect, it } from 'vitest'
import { caixaDoDiretor, contextoDaFoto, problemasDoPromptDeFoto, type PlanejarMelhoriaDeFotoArgs } from '../diretor-de-foto'

const args = (extra: Partial<PlanejarMelhoriaDeFotoArgs> = {}): PlanejarMelhoriaDeFotoArgs => ({
  foto: Buffer.from(''),
  receitas: [{ id: 'humanizar', lado: 'direita' }],
  proporcao: '9:16',
  ...extra,
})

describe('contextoDaFoto', () => {
  it('leva as receitas com o trecho fotográfico de cada uma', () => {
    const c = contextoDaFoto(args({ receitas: [{ id: 'humanizar', lado: 'direita' }, { id: 'foto-profissional' }] }))
    expect(c).toContain('Humanizar')
    expect(c).toContain('Foto profissional')
    expect(c).toMatch(/right edge/)
    expect(c).toMatch(/white balance/i)
  })

  it('leva a direção de foto do DNA, o que se sabe da foto e o pedido', () => {
    const c = contextoDaFoto(
      args({
        marca: 'By Rock',
        cozinha: 'hamburgueria',
        direcaoDeFoto: 'Luz quente de bar, fundo escuro.',
        sobreAFoto: { prato: 'Chope pilsen', caixaDoAssunto: { x: 0.3, y: 0.4, largura: 0.4, altura: 0.5 } },
        caixaDoTexto: { x: 0.1, y: 0.05, largura: 0.8, altura: 0.2 },
        pedido: 'a mão segurando o copo',
      }),
    )
    expect(c).toContain('By Rock')
    expect(c).toContain('Luz quente de bar, fundo escuro.')
    expect(c).toContain('Chope pilsen')
    expect(c).toMatch(/ASSUNTO[^\n]*30%[^\n]*40%/)
    expect(c).toMatch(/TEXTO DA ARTE[^\n]*10%[^\n]*5%/)
    expect(c).toContain('a mão segurando o copo')
  })

  it('avisa onde a logo fica por cima da foto', () => {
    const c = contextoDaFoto(args({ caixasDaMarca: [{ x: 0.8, y: 0.9, largura: 0.2, altura: 0.1 }] }))
    expect(c).toMatch(/LOGO E ELEMENTOS[^\n]*80%[^\n]*90%/)
  })

  it('diz quando a imagem é a arte chapada (reserva)', () => {
    expect(contextoDaFoto(args({ arteChapada: true }))).toMatch(/ARTE PRONTA/)
    expect(contextoDaFoto(args())).toMatch(/FOTO LIMPA/)
  })

  it('sem receita e sem pedido ainda descreve a tarefa', () => {
    expect(contextoDaFoto(args({ receitas: [] }))).toMatch(/RECEITAS: \(nenhuma/)
  })
})

describe('problemasDoPromptDeFoto', () => {
  const bom =
    'Add a hand entering from the right edge, pulling a slice. Keep the dish, the table and the background exactly the same. Full-frame camera, 50mm lens at f/2.8, soft side light.'

  it('aceita um prompt na estrutura pedida', () => {
    expect(problemasDoPromptDeFoto(bom)).toEqual([])
  })

  it('acusa prompt acima de 4000 caracteres', () => {
    expect(problemasDoPromptDeFoto(`${bom} ${'x'.repeat(4000)}`).join(' ')).toMatch(/4000/)
  })

  it('acusa prompt sem a lista do que fica igual', () => {
    expect(problemasDoPromptDeFoto('Add a hand entering from the right edge. 50mm lens at f/2.8.').join(' ')).toMatch(/fica igual/)
  })

  it('acusa contraste acrescentado para texto', () => {
    const p = problemasDoPromptDeFoto(`${bom} Add a dark gradient overlay at the top for the text.`)
    expect(p.join(' ')).toMatch(/contraste/)
  })

  it('não confunde "no veil, no gradient" (a proibição) com o pedido de contraste', () => {
    expect(problemasDoPromptDeFoto(`${bom} The photograph carries no veil and no gradient.`)).toEqual([])
  })

  it('acusa prompt vazio', () => {
    expect(problemasDoPromptDeFoto('  ').length).toBe(1)
  })
})

describe('caixaDoDiretor', () => {
  it('aceita a caixa em frações e corta o que passa do quadro', () => {
    expect(caixaDoDiretor({ x: 0.2, y: 0.3, largura: 0.5, altura: 0.4 })).toEqual({ x: 0.2, y: 0.3, largura: 0.5, altura: 0.4 })
    expect(caixaDoDiretor({ x: 0.8, y: -0.1, largura: 0.5, altura: 0.4 })).toEqual({ x: 0.8, y: 0, largura: 0.19999999999999996, altura: 0.4 })
  })
  it('recusa caixa ausente, sem tamanho ou que não é número', () => {
    expect(caixaDoDiretor(null)).toBeNull()
    expect(caixaDoDiretor({ x: 0.5, y: 0.5, largura: 0.01, altura: 0.3 })).toBeNull()
    expect(caixaDoDiretor({ x: Number.NaN, y: 0, largura: 0.5, altura: 0.5 })).toBeNull()
  })
})

