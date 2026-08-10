import { describe, it, expect } from 'vitest'
import { chaveDeSugestao, diaBRT, resumoEstavel } from '../chaves'

describe('chaveDeSugestao', () => {
  it('a mesma proposta produz a mesma chave', () => {
    expect(chaveDeSugestao('slot', 'cadencia-v1', 8, '2026-08-14 19:00')).toBe(
      chaveDeSugestao('slot', 'cadencia-v1', 8, '2026-08-14 19:00'),
    )
  })

  it('separa por projeto, por versão e por alvo', () => {
    const a = chaveDeSugestao('slot', 'cadencia-v1', 8, '2026-08-14 19:00')
    expect(a).not.toBe(chaveDeSugestao('slot', 'cadencia-v1', 9, '2026-08-14 19:00'))
    expect(a).not.toBe(chaveDeSugestao('slot', 'cadencia-v2', 8, '2026-08-14 19:00'))
    expect(a).not.toBe(chaveDeSugestao('slot', 'cadencia-v1', 8, '2026-08-14 19:30'))
  })

  /**
   * Sem preservar a posição, `[projeto, tema, pasta]` com tema vazio colidiria
   * com o mesmo trio de pasta vazia — duas propostas viradas uma.
   */
  it('parte vazia mantém a posição', () => {
    expect(chaveDeSugestao('foto', 8, '', 'ambiente')).not.toBe(
      chaveDeSugestao('foto', 8, 'ambiente', ''),
    )
  })
})

describe('resumoEstavel', () => {
  it('não depende da ordem em que o objeto foi escrito', () => {
    expect(resumoEstavel({ theme: 'picanha', folder: '01_cortes' })).toBe(
      resumoEstavel({ folder: '01_cortes', theme: 'picanha' }),
    )
  })

  it('ignora ausência escrita de formas diferentes', () => {
    expect(resumoEstavel({ theme: 'picanha' })).toBe(
      resumoEstavel({ theme: 'picanha', folder: undefined, tags: null, quality: '' }),
    )
  })

  it('trata caixa e espaço como o mesmo critério', () => {
    expect(resumoEstavel({ theme: ' Picanha ' })).toBe(resumoEstavel({ theme: 'picanha' }))
  })

  it('critério diferente, resumo diferente', () => {
    expect(resumoEstavel({ theme: 'picanha' })).not.toBe(resumoEstavel({ theme: 'chopp' }))
    expect(resumoEstavel({ tags: ['a', 'b'] })).not.toBe(resumoEstavel({ tags: ['b', 'a'] }))
  })
})

describe('diaBRT', () => {
  // 03:00Z de 15/08 ainda é 14/08 em Brasília — a dedupe por dia tem de
  // acompanhar o dia de quem está usando o Studio, não o UTC.
  it('usa o dia de Brasília, não o UTC', () => {
    expect(diaBRT(new Date('2026-08-15T02:59:00.000Z'))).toBe('2026-08-14')
    expect(diaBRT(new Date('2026-08-15T03:01:00.000Z'))).toBe('2026-08-15')
  })
})
