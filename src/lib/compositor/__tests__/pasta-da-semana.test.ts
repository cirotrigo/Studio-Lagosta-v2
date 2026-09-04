import { describe, it, expect } from 'vitest'
import { nomeDaPagina, pastaDaPeca, semanaDe } from '../pasta-da-semana'

describe('semanaDe', () => {
  it('segunda a domingo em BRT, nome no mesmo mês', () => {
    const s = semanaDe(new Date('2026-09-10T12:00:00-03:00')) // quinta
    expect(s.chave).toBe('2026-09-07')
    expect(s.nome).toBe('Semana 7 a 13/09')
  })
  it('domingo 23:30 BRT ainda é da semana que termina nele', () => {
    const s = semanaDe(new Date('2026-09-13T23:30:00-03:00'))
    expect(s.chave).toBe('2026-09-07')
  })
  it('semana que cruza o mês leva os dois meses no nome', () => {
    const s = semanaDe(new Date('2026-09-30T10:00:00-03:00'))
    expect(s.nome).toBe('Semana 28/09 a 4/10')
  })
})

describe('pastaDaPeca', () => {
  it('com data vai para a semana; sem data, avulsas do mês', () => {
    expect(pastaDaPeca('2026-09-11T19:00:00-03:00').nome).toBe('Semana 7 a 13/09')
    const a = pastaDaPeca(null, new Date('2026-09-03T10:00:00-03:00'))
    expect(a.nome).toBe('Avulsas · setembro')
    expect(a.chave).toBe('mes:2026-09')
  })
})

describe('nomeDaPagina', () => {
  it('dia, hora, formato e tema', () => {
    expect(nomeDaPagina({ quando: '2026-09-08T09:00:00-03:00', formato: 'story', tema: 'Happy hour' })).toBe('Ter 09:00 · story · Happy hour')
    expect(nomeDaPagina({ formato: 'feed', nome: 'Prova' })).toBe('feed · Prova')
  })
})
