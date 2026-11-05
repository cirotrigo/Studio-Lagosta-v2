import { describe, expect, it } from 'vitest'
import { applyOpacityToEditableColor, corDigitadaParaGravar } from '../shape-style'

/** Digitação caractere a caractere: cada prefixo é o que o `<Input>` entrega no onChange. */
const prefixos = (texto: string) => [...texto].map((_, i) => texto.slice(0, i + 1))

/**
 * No navegador o campo passa `CSS.supports('color', …)` (a matriz também roda contra o CSS real do
 * Chrome; ver o relatório). Aqui, um dublê: nome só `red`/`transparent`; função só com vírgulas OU só
 * com espaços — `rgba(1 2 3, 1)`, a saída malformada que o helper antigo dava, ele recusa.
 */
const tudoValeNoCss = () => true
const cssDeDuble = (cor: string) => {
  if (/^[a-z]+$/i.test(cor)) return ['red', 'transparent'].includes(cor.toLowerCase())
  const funcao = cor.match(/^(?:rgba?|hsla?)\(([^()]*)\)$/i)
  if (!funcao) return true
  const soVirgulas = /^\s*[^,\s]+\s*(?:,\s*[^,\s]+\s*){2,3}$/.test(funcao[1])
  const soEspacos = !funcao[1].includes(',')
  return soVirgulas || soEspacos
}

const gravar = (texto: string, opacidade = 1, ehCorCss = cssDeDuble) =>
  corDigitadaParaGravar(texto, opacidade, '#1e3a8a', ehCorCss)

describe('campo de texto da cor (smoke do CP-V1, 21/10/2026)', () => {
  it('reproduz o defeito antigo: gravar a cada tecla no campo controlado pelo salvo cola o resto atrás', () => {
    // O campo mostrava o SALVO; a tecla seguinte chegava somada ao que tinha sido gravado.
    let salvo = '#1e3a8a'
    let campo = ''
    for (const tecla of '#111827') {
      campo += tecla
      salvo = applyOpacityToEditableColor(campo, 1, '#1e3a8a')
      campo = salvo
    }
    expect(salvo).toBe('rgba(17, 17, 17, 1)827')
  })

  it('prefixos de #111827 que já são cor completa: por isso grava só ao confirmar, nunca por tecla', () => {
    const gravaveis = prefixos('#111827').filter((p) => gravar(p) !== null)
    // `#111` (3 dígitos) e `#1118` (4, com alpha) são cores sozinhas no meio da digitação.
    expect(gravaveis).toEqual(['#111', '#1118', '#111827'])
  })

  it('confirmar o texto inteiro grava a cor inteira', () => {
    expect(gravar('#111827')).toBe('rgba(17, 24, 39, 1)')
  })

  it('preserva a transparência atual do slider, como antes', () => {
    expect(gravar('#111827', 0.5)).toBe('rgba(17, 24, 39, 0.5)')
    expect(gravar('#11182780', 0.25)).toBe('rgba(17, 24, 39, 0.25)')
    expect(gravar('#abc')).toBe('rgba(170, 187, 204, 1)')
  })

  it('aceita colar rgb/rgba/hsl de vírgulas inteiros e espaços nas pontas', () => {
    expect(gravar('  rgb(1, 2, 3) ', 0.4)).toBe('rgba(1, 2, 3, 0.4)')
    expect(gravar('rgba(1, 2, 3, 0.9)')).toBe('rgba(1, 2, 3, 1)')
    expect(gravar('hsl(10, 50%, 50%)')).toBe('hsla(10, 50%, 50%, 1)')
    expect(gravar('hsl(-10deg,50%,50%)')).toBe('hsla(-10deg, 50%, 50%, 1)')
  })

  it('sintaxe moderna com espaços, com e sem alpha, sai em vírgulas válidas (não rgba(1 2 3, 1))', () => {
    expect(gravar('rgb(1 2 3)', 0.4)).toBe('rgba(1, 2, 3, 0.4)')
    expect(gravar('rgb(10% 20% 30% / 50%)', 0.7)).toBe('rgba(10%, 20%, 30%, 0.7)')
    expect(gravar('hsl(10 50% 50%)')).toBe('hsla(10, 50%, 50%, 1)')
    expect(gravar('hsl(10deg 50% 50% / .5)', 0.3)).toBe('hsla(10deg, 50%, 50%, 0.3)')
    expect(gravar('hsl(-0.5turn 50% 50%)')).toBe('hsla(-0.5turn, 50%, 50%, 1)')
  })

  it('saída que o CSS recusa não grava, mesmo com a entrada aceita', () => {
    const soEntrada = (cor: string) => cor === 'rgb(1 2 3)'
    expect(corDigitadaParaGravar('rgb(1 2 3)', 1, '#1e3a8a', soEntrada)).toBeNull()
  })

  it('nome CSS segue aceito como antes, gravado como digitado — se o CSS o conhece', () => {
    expect(gravar('red', 0.5)).toBe('red')
    expect(gravar('transparent')).toBe('transparent')
    expect(gravar('banana')).toBeNull()
    expect(gravar('notacolor')).toBeNull()
  })

  it('sem o veto do CSS, nome desconhecido também não passa quando o CSS diz não', () => {
    expect(corDigitadaParaGravar('red', 1, '#1e3a8a', () => false)).toBeNull()
    expect(corDigitadaParaGravar('#111827', 1, '#1e3a8a', () => false)).toBeNull()
  })

  it('texto incompleto ou inválido não grava, mesmo que o CSS deixasse (o formato é conferido aqui)', () => {
    const invalidos = [
      '', '#', '#1', '#11', '#11182', '#1118270', '#ggg', '#111 827',
      'rgba(17, 17, 17, 1)827', 'rgb(1, 2', 'rgb(abc)', 'rgba(1)', 'rgb(1, 2)', 'rgba(1,2,3,NaN)',
      'rgb(1, 2, 3, 4, 5)', 'rgb(1 2 3 4)', 'hsl(lixo)', 'hsl(10, 50, 50)', 'hsla(10, 50%)',
    ]
    for (const texto of invalidos) expect(gravar(texto, 1, tudoValeNoCss), texto).toBeNull()
  })
})
