import { describe, it, expect } from 'vitest'
import {
  vigenteEm,
  estaVigente,
  parseValidade,
  avisoValidadeAusente,
} from '../vigencia'

describe('parseValidade', () => {
  // O contrato de três estados é o que permite "não mexer" e "limpar" serem
  // coisas diferentes no PATCH da entrada.
  it('undefined = não veio no pedido, não mexe', () => {
    expect(parseValidade(undefined)).toBeUndefined()
  })

  it('null e string vazia = limpa o prazo', () => {
    expect(parseValidade(null)).toBeNull()
    expect(parseValidade('')).toBeNull()
    expect(parseValidade('   ')).toBeNull()
  })

  // A regra que evita encerrar a campanha um dia antes do combinado.
  it('data pura vira o FIM daquele dia em Brasília', () => {
    const d = parseValidade('2026-08-31') as Date
    expect(d.toISOString()).toBe('2026-09-01T02:59:59.999Z')
  })

  it('o dia 31 inteiro ainda é vigente; o dia 1º já não é', () => {
    const validade = parseValidade('2026-08-31') as Date
    expect(estaVigente(validade, new Date('2026-08-31T23:00:00-03:00'))).toBe(true)
    expect(estaVigente(validade, new Date('2026-09-01T00:30:00-03:00'))).toBe(false)
  })

  it('aceita data e hora ISO como está', () => {
    const d = parseValidade('2026-08-31T18:00:00-03:00') as Date
    expect(d.toISOString()).toBe('2026-08-31T21:00:00.000Z')
  })

  it('recusa data inválida com mensagem que ensina o formato', () => {
    expect(() => parseValidade('31/08/2026')).toThrow(/AAAA-MM-DD/)
    expect(() => parseValidade('amanhã')).toThrow(/AAAA-MM-DD/)
  })

  // O `Date` do V8 aceita "2026-02-31" e devolve 3 de março, calado — a
  // campanha ganharia dias que ninguém combinou.
  it('recusa dia que não existe em vez de rolar para o mês seguinte', () => {
    expect(() => parseValidade('2026-02-31')).toThrow(/não é um dia que existe/)
    expect(() => parseValidade('2026-13-05')).toThrow(/não é um dia que existe/)
  })
})

describe('estaVigente', () => {
  it('entrada sem prazo vale sempre', () => {
    expect(estaVigente(null, new Date('2099-01-01'))).toBe(true)
    expect(estaVigente(undefined)).toBe(true)
  })

  // É a comparação contra a DATA DO SLOT: campanha viva hoje que vence antes
  // do slot não pode entrar na copy daquele slot.
  it('campanha viva hoje já não vale para um slot depois do prazo', () => {
    const fim = new Date('2026-08-31T23:59:59-03:00')
    expect(estaVigente(fim, new Date('2026-08-20T12:00:00-03:00'))).toBe(true)
    expect(estaVigente(fim, new Date('2026-09-05T12:00:00-03:00'))).toBe(false)
  })
})

describe('vigenteEm', () => {
  it('monta o filtro "sem prazo OU prazo à frente"', () => {
    const ref = new Date('2026-08-10T12:00:00Z')
    expect(vigenteEm(ref)).toEqual({
      OR: [{ expiresAt: null }, { expiresAt: { gt: ref } }],
    })
  })
})

describe('avisoValidadeAusente', () => {
  it('cutuca campanha sem prazo', () => {
    expect(avisoValidadeAusente('CAMPANHAS', null)).toMatch(/SEM data de fim/)
  })

  it('cala quando a campanha tem prazo', () => {
    expect(avisoValidadeAusente('CAMPANHAS', new Date())).toBeUndefined()
  })

  it('não cutuca categoria sem prazo natural', () => {
    expect(avisoValidadeAusente('HORARIOS', null)).toBeUndefined()
  })
})
