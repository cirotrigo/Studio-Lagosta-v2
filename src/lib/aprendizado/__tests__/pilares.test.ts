import { describe, it, expect } from 'vitest'
import {
  casarPilar,
  comPisoDeConfianca,
  CONFIANCA_MINIMA,
  ehReservado,
  MAX_PILARES,
  nomeDoPilar,
  PILAR_OUTRO,
  PILAR_SEM_TEXTO,
  slugDePilar,
  taxonomiaEmTexto,
  validarTaxonomia,
  type Pilar,
} from '@/lib/aprendizado/pilares'

const TAXONOMIA: Pilar[] = [
  { slug: 'happy-hour', nome: 'Happy hour', exemplos: ['drinks', 'chope'] },
  { slug: 'almoco-executivo', nome: 'Almoço executivo' },
]

describe('slug', () => {
  it('é estável para o mesmo nome escrito de formas diferentes', () => {
    expect(slugDePilar('Happy Hour')).toBe('happy-hour')
    expect(slugDePilar('happy-hour')).toBe('happy-hour')
    expect(slugDePilar('HAPPY  HOUR ')).toBe('happy-hour')
  })

  it('tira acento e pontuação', () => {
    expect(slugDePilar('Almoço Executivo!')).toBe('almoco-executivo')
    expect(slugDePilar('Café da manhã')).toBe('cafe-da-manha')
  })
})

describe('validarTaxonomia', () => {
  it('recusa o item torto sem derrubar a lista inteira', () => {
    const { pilares, avisos } = validarTaxonomia([
      { nome: 'Happy hour' },
      { nome: '' },
      'lixo',
      { nome: 'Almoço executivo' },
    ])
    expect(pilares.map((p) => p.slug)).toEqual(['happy-hour', 'almoco-executivo'])
    expect(avisos.length).toBe(2)
  })

  it('recusa slug reservado do sistema', () => {
    const { pilares, avisos } = validarTaxonomia([{ nome: 'Outro' }, { nome: 'Sem texto' }])
    expect(pilares).toEqual([])
    expect(avisos.join(' ')).toContain('reservado')
  })

  it('recusa pilar repetido, mesmo escrito diferente', () => {
    const { pilares } = validarTaxonomia([{ nome: 'Happy Hour' }, { nome: 'happy hour' }])
    expect(pilares.length).toBe(1)
  })

  it('respeita o teto de pilares', () => {
    const muitos = Array.from({ length: MAX_PILARES + 3 }, (_, i) => ({ nome: `Assunto ${i}` }))
    const { pilares, avisos } = validarTaxonomia(muitos)
    expect(pilares.length).toBe(MAX_PILARES)
    expect(avisos.join(' ')).toContain('máximo')
  })

  it('entrada que não é lista vira aviso, não exceção', () => {
    expect(validarTaxonomia(null).pilares).toEqual([])
    expect(validarTaxonomia({ nome: 'x' }).avisos.length).toBe(1)
  })
})

describe('casarPilar — o classificador é constrangido ao enum', () => {
  it('casa por slug e por nome', () => {
    expect(casarPilar('happy-hour', TAXONOMIA)).toBe('happy-hour')
    expect(casarPilar('Happy Hour', TAXONOMIA)).toBe('happy-hour')
  })

  it('rótulo inventado vira "outro", sem aproximação por semelhança', () => {
    // "drinks" é EXEMPLO do happy hour, e mesmo assim não vira happy-hour:
    // aproximar é como um pilar engole o vizinho.
    expect(casarPilar('drinks', TAXONOMIA)).toBe(PILAR_OUTRO)
    expect(casarPilar('happy hours', TAXONOMIA)).toBe(PILAR_OUTRO)
    expect(casarPilar(undefined, TAXONOMIA)).toBe(PILAR_OUTRO)
    expect(casarPilar(42, TAXONOMIA)).toBe(PILAR_OUTRO)
  })

  it('deixa passar os reservados', () => {
    expect(casarPilar('outro', TAXONOMIA)).toBe(PILAR_OUTRO)
    expect(casarPilar('sem-texto', TAXONOMIA)).toBe(PILAR_SEM_TEXTO)
    expect(ehReservado(PILAR_SEM_TEXTO)).toBe(true)
  })
})

describe('piso de confiança', () => {
  it('baixa confiança vai para "outro", nunca para o rótulo mais provável', () => {
    expect(comPisoDeConfianca('happy-hour', CONFIANCA_MINIMA - 0.01)).toBe(PILAR_OUTRO)
    expect(comPisoDeConfianca('happy-hour', CONFIANCA_MINIMA)).toBe('happy-hour')
  })

  it('confiança ausente também vira "outro"', () => {
    expect(comPisoDeConfianca('happy-hour', null)).toBe(PILAR_OUTRO)
    expect(comPisoDeConfianca('happy-hour', Number.NaN)).toBe(PILAR_OUTRO)
  })

  it('não mexe nos reservados — "sem texto" não tem confiança para medir', () => {
    expect(comPisoDeConfianca(PILAR_SEM_TEXTO, null)).toBe(PILAR_SEM_TEXTO)
  })
})

describe('rótulos', () => {
  it('distingue os dois baldes na tela', () => {
    expect(nomeDoPilar(PILAR_OUTRO, TAXONOMIA)).toBe('outro')
    expect(nomeDoPilar(PILAR_SEM_TEXTO, TAXONOMIA)).toBe('sem texto no sistema')
    expect(nomeDoPilar(null, TAXONOMIA)).toBe('não classificado')
    expect(nomeDoPilar('happy-hour', TAXONOMIA)).toBe('Happy hour')
  })

  it('o texto do prompt traz slug, nome e exemplos', () => {
    const texto = taxonomiaEmTexto(TAXONOMIA)
    expect(texto).toContain('happy-hour: Happy hour')
    expect(texto).toContain('drinks, chope')
  })
})
