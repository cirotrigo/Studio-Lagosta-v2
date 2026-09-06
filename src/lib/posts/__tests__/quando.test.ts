import { describe, expect, it } from 'vitest'
import {
  classificarDia,
  comHora,
  horarioPadrao,
  primeiraHoraLivre,
  proximoHorario,
  rotuloDoBotao,
} from '../quando'

// quinta-feira 10/09/2026, 14:00 local
const AGORA = new Date(2026, 8, 10, 14, 0, 0, 0)
const POR_DIA = { 4: ['10:00', '12:00', '19:00'], 5: ['09:00', '18:30'] }

describe('primeiraHoraLivre', () => {
  it('pula o que já passou e respeita a folga de 10 min', () => {
    expect(primeiraHoraLivre(POR_DIA, AGORA, AGORA)?.getHours()).toBe(19)
    const quaseSete = new Date(2026, 8, 10, 18, 55)
    expect(primeiraHoraLivre(POR_DIA, AGORA, quaseSete)).toBeNull()
  })
  it('sem histórico, 10:00 — ou a próxima hora cheia se hoje já passou das 10', () => {
    const amanha = new Date(2026, 8, 11)
    expect(primeiraHoraLivre({}, amanha, AGORA)?.getHours()).toBe(10)
    expect(primeiraHoraLivre({}, AGORA, AGORA)?.getHours()).toBe(15)
  })
})

describe('horarioPadrao', () => {
  it('próximo típico ainda hoje', () => {
    const d = horarioPadrao(POR_DIA, AGORA)
    expect(d.getDate()).toBe(10)
    expect(d.getHours()).toBe(19)
  })
  it('passou o último de hoje, amanhã no primeiro', () => {
    const tarde = new Date(2026, 8, 10, 20, 0)
    const d = horarioPadrao(POR_DIA, tarde)
    expect(d.getDate()).toBe(11)
    expect(d.getHours()).toBe(9)
  })
  it('com dia sugerido (o "+" da agenda) vai para o primeiro típico DAQUELE dia', () => {
    const sexta = new Date(2026, 8, 11, 10, 0)
    const d = horarioPadrao(POR_DIA, AGORA, { diaSugerido: sexta })
    expect(d.getDate()).toBe(11)
    expect(d.getHours()).toBe(9)
  })
  it('dia sugerido sem histórico cai em 10:00, não em 12:00', () => {
    const d = horarioPadrao({}, AGORA, { diaSugerido: new Date(2026, 8, 12) })
    expect(d.getHours()).toBe(10)
  })
})

describe('proximoHorario', () => {
  it('o típico seguinte no mesmo dia; sem próximo, +1h', () => {
    expect(proximoHorario(POR_DIA, comHora(AGORA, '12:00')).getHours()).toBe(19)
    expect(proximoHorario(POR_DIA, comHora(AGORA, '19:00')).getHours()).toBe(20)
  })
})

describe('rótulos', () => {
  it('o botão diz o que vai fazer', () => {
    expect(rotuloDoBotao('SCHEDULED', comHora(AGORA, '19:00'), false)).toBe('Agendar qui 19h')
    expect(rotuloDoBotao('SCHEDULED', comHora(AGORA, '19:30'), false)).toBe('Agendar qui 19:30')
    expect(rotuloDoBotao('IMMEDIATE', undefined, false)).toBe('Postar agora')
    expect(rotuloDoBotao('SCHEDULED', undefined, true)).toBe('Salvar alterações')
  })
  it('classifica hoje/amanhã/outro', () => {
    expect(classificarDia(AGORA, AGORA)).toBe('hoje')
    expect(classificarDia(new Date(2026, 8, 11, 8), AGORA)).toBe('amanha')
    expect(classificarDia(new Date(2026, 8, 13), AGORA)).toBe('outro')
  })
})
