import { describe, expect, it } from 'vitest'
import { avisoDeAcento, divergenciasDeAcento } from '../acento'

describe('divergenciasDeAcento — o acento que a régua deixa passar', () => {
  it('acusa "familia" por "família" (o caso do Espeto, 05/09/2026)', () => {
    const d = divergenciasDeAcento(['Bora almoçar em família!'], ['BORA ALMOÇAR EM FAMILIA!', 'SEG 7 E TER 8'])
    expect(d).toEqual([{ esperado: 'Bora almoçar em família!', transcrito: 'bora almoçar em familia!' }])
  })

  it('não acusa quando o acento está certo, nem quando o bloco não tem acento', () => {
    expect(divergenciasDeAcento(['Bora almoçar em família!'], ['Bora almoçar em família!'])).toEqual([])
    expect(divergenciasDeAcento(['SEG 7 E TER 8'], ['seg 7 e ter 8'])).toEqual([])
  })

  it('acha o bloco dentro de uma linha maior da transcrição', () => {
    const d = divergenciasDeAcento(['Terça-feira'], ['Programação Feriado | Terca-feira'])
    expect(d).toEqual([{ esperado: 'Terça-feira', transcrito: 'terca-feira' }])
  })

  it('bloco que não aparece na transcrição não é divergência de acento (é falta, e disso a régua cuida)', () => {
    expect(divergenciasDeAcento(['Terça-feira'], ['Sábado'])).toEqual([])
  })

  it('o aviso é aviso: entregueComAlerta e texto legível', () => {
    const aviso = avisoDeAcento([{ esperado: 'família', transcrito: 'familia' }])
    expect(aviso.entregueComAlerta).toBe(true)
    expect(String(aviso.acentoAlerta)).toContain('"familia" no lugar de "família"')
    expect(avisoDeAcento([])).toEqual({})
  })
})
