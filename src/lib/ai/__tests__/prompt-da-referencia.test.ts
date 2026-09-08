/**
 * A porta da referência: foto + arte escolhida + prompt curto. O que se
 * protege aqui é a FORMA medida em 07-08/09/2026 — a frase que ancora a
 * foto, a lista do que se herda, a trava dupla e a copy por último, entre
 * aspas. Cada caso é uma variação que o runner de fato manda.
 */
import { describe, expect, it } from 'vitest'
import { montarPromptDaReferencia } from '../prompt-da-referencia'

const COPY = ['Happy Hour', 'Brinde com descontos especiais em vinhos e entradas selecionadas.', 'Seg a Sáb - 16h às 19h']

describe('montarPromptDaReferencia', () => {
  it('story padrão: foto intocada, herda tudo da referência, trava dupla e copy por último', () => {
    const p = montarPromptDaReferencia({ marca: 'Wine Vix', copy: COPY })
    expect(p).toContain('Image 1 is the photograph for a 1080x1920 Instagram Story of Wine Vix. Use it as the background, exactly as it is.')
    expect(p).toContain('Image 2 is an approved Wine Vix Story — the design model.')
    expect(p).toContain('the same typography, colours, ornaments, logo and layout as Image 2')
    expect(p).toContain('Only the photograph and the words change')
    expect(p).toContain('belongs to that OLD post')
    expect(p).toContain('Render exactly these 3 copy blocks, each once, and nothing else')
    const linhas = p.trim().split('\n')
    expect(linhas.slice(-3)).toEqual(COPY.map((c) => `"${c}"`))
    expect(p).not.toContain('Note from the client')
    expect(p).not.toContain('NO brand mark')
  })

  it('logo colada depois: a logo sai da herança e a trava diz que a peça não leva marca', () => {
    const p = montarPromptDaReferencia({ marca: 'TERO', copy: COPY, logoColadaDepois: true })
    expect(p).toContain('the same typography, colours, ornaments and layout as Image 2')
    expect(p).not.toContain('ornaments, logo')
    expect(p).toContain('this piece carries NO brand mark at all')
  })

  it('modo livre: herda o estilo e compõe o layout para esta foto', () => {
    const p = montarPromptDaReferencia({ marca: 'Espeto', copy: COPY, layoutLivre: true })
    expect(p).toContain('the same typography, colours, ornaments and logo as Image 2')
    expect(p).toContain('compose the layout for THIS photograph')
    expect(p).not.toContain('Only the photograph and the words change')
  })

  it('ajuste na foto vira a única exceção ao "exactly as it is"', () => {
    const p = montarPromptDaReferencia({ marca: 'Real', copy: COPY, instrucaoImagem: 'remove the fork on the left' })
    expect(p).toContain('The ONLY change allowed to the photograph is this one, requested by the client: remove the fork on the left.')
    expect(p).not.toContain('Use it as the background, exactly as it is.')
  })

  it('observação de quem pediu entra numa linha, antes da copy', () => {
    const p = montarPromptDaReferencia({ marca: 'Real', copy: ['Feriado'], pedido: 'texto no rodapé' })
    expect(p).toContain('Note from the client, to honour without breaking the model: texto no rodapé')
    expect(p.indexOf('Note from the client')).toBeLessThan(p.indexOf('Render exactly'))
    expect(p).toContain('Render exactly this copy block, each once')
  })

  it('feed e quadrado mudam o tamanho e o nome da peça; índices são configuráveis', () => {
    const feed = montarPromptDaReferencia({ marca: 'Bacana', copy: COPY, formato: 'feed', indiceDaFoto: 2, indiceDaReferencia: 3 })
    expect(feed).toContain('Image 2 is the photograph for a 1080x1350 Instagram feed post of Bacana')
    expect(feed).toContain('Image 3 is an approved Bacana feed post')
    expect(montarPromptDaReferencia({ marca: 'Bacana', copy: COPY, formato: 'quadrado' })).toContain('1080x1080 Instagram square post')
  })

  it('copy chega limpa: espaços colapsados e blocos vazios fora', () => {
    const p = montarPromptDaReferencia({ marca: 'X', copy: ['  Happy   Hour ', '', '   '] })
    expect(p.trim().split('\n').slice(-1)).toEqual(['"Happy Hour"'])
    expect(p).toContain('this copy block')
  })
})
