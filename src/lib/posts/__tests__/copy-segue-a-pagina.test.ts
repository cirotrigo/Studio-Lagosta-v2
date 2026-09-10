import { describe, expect, it } from 'vitest'

import {
  comoCopiaDaPagina,
  copyIgual,
  ehCopiaDaPagina,
  slotValuesParaRender,
  slotValuesSeguindo,
  textosDoSlot,
} from '../copy-segue-a-pagina'

describe('a cópia da página não volta para a arte', () => {
  const copyDaPagina = {
    pre: 'Amanhã, 12 de setembro',
    headline: 'Dia do Milk-shake\nem Dobro',
    apoio: 'Sábado seu milk-shake vem em dobro!',
  }

  it('o agendamento marca a cópia, e o render desenha a página como está', () => {
    const slot = comoCopiaDaPagina(copyDaPagina)
    expect(ehCopiaDaPagina(slot)).toBe(true)
    expect(slotValuesParaRender(slot)).toBeUndefined()
  })

  it('o caso da Real Gelateria (10/09): cópia que divergiu da página continua fora da arte', () => {
    // O ajuste pelo chat reescreveu a página; a cópia ficou com o texto da manhã.
    const slot = comoCopiaDaPagina({ ...copyDaPagina, apoio: 'Na compra de um milk-shake,\nvocê leva dois.' })
    expect(copyIgual(textosDoSlot(slot), copyDaPagina)).toBe(false)
    expect(slotValuesParaRender(slot)).toBeUndefined()
  })

  it('a copy própria da via de template continua sobrepondo a página', () => {
    const slot = { Titulo: 'HAPPY HOUR', 'Pre-titulo': 'QUARTA-FEIRA', _driveImageId: 'abc' }
    expect(ehCopiaDaPagina(slot)).toBe(false)
    expect(slotValuesParaRender(slot)).toEqual(slot)
  })

  it('só o true literal marca', () => {
    expect(ehCopiaDaPagina({ _copiaDaPagina: 'true' })).toBe(false)
    expect(ehCopiaDaPagina({ _copiaDaPagina: 1 })).toBe(false)
    expect(ehCopiaDaPagina(null)).toBe(false)
    expect(ehCopiaDaPagina(['_copiaDaPagina'])).toBe(false)
  })

  it('sem slot nenhum não há o que aplicar', () => {
    expect(slotValuesParaRender({})).toBeUndefined()
    expect(slotValuesParaRender(null)).toBeUndefined()
    expect(slotValuesParaRender(undefined)).toBeUndefined()
    expect(slotValuesParaRender(['a'])).toBeUndefined()
  })

  it('a marca não vira texto para quem lê a copy, e sobrevive à sincronização com o render', () => {
    const slot = comoCopiaDaPagina(copyDaPagina)
    expect(textosDoSlot(slot)).toEqual(copyDaPagina)
    const depois = slotValuesSeguindo(slot, { apoio: 'Seu milk-shake vem em dobro esse sábado!' })
    expect(ehCopiaDaPagina(depois)).toBe(true)
    expect(textosDoSlot(depois)).toEqual({ apoio: 'Seu milk-shake vem em dobro esse sábado!' })
  })
})

describe('leitura e comparação da copy do slot', () => {
  const copyDaPagina = { pre: 'CHURRASCO TODO DIA', headline: 'FERIADO É\nDIA DE ESPETO', cta: 'Chama a piazada!' }

  it('ordem das chaves e espaço em branco não contam', () => {
    const doPost = { cta: 'Chama a piazada!', pre: 'CHURRASCO  TODO DIA', headline: 'FERIADO É\nDIA DE ESPETO ' }
    expect(copyIgual(textosDoSlot(doPost), copyDaPagina)).toBe(true)
  })

  it('texto diferente ou slot a mais é copy diferente', () => {
    const doPost = { pre: 'SEXTOU COM ESPETO', headline: 'RODÍZIO\nDE SEXTA', cta: 'Chama a piazada!' }
    expect(copyIgual(textosDoSlot(doPost), copyDaPagina)).toBe(false)
    expect(copyIgual(textosDoSlot({ ...copyDaPagina, apoio: 'das 10h às 15h' }), copyDaPagina)).toBe(false)
  })

  it('post sem texto ou página ilegível nunca casa', () => {
    expect(copyIgual(null, copyDaPagina)).toBe(false)
    expect(copyIgual(textosDoSlot({ _driveImageId: 'abc' }), copyDaPagina)).toBe(false)
    expect(copyIgual(textosDoSlot(copyDaPagina), null)).toBe(false)
  })

  it('lê slot em objeto com content e preserva o que não é texto ao seguir', () => {
    const slot = { headline: { content: 'FERIADO É\nDIA DE ESPETO' }, pre: 'CHURRASCO TODO DIA', cta: 'Chama a piazada!', _driveImageId: 'abc', foto: { fileUrl: 'https://x/y.jpg' } }
    expect(copyIgual(textosDoSlot(slot), copyDaPagina)).toBe(true)
    const novo = slotValuesSeguindo(slot, { pre: 'VAMOS ABRIR NO FERIADO', headline: 'ALMOÇO E\nJANTAR', cta: 'Chama a piazada!' })
    expect(novo).toEqual({
      _driveImageId: 'abc',
      foto: { fileUrl: 'https://x/y.jpg' },
      pre: 'VAMOS ABRIR NO FERIADO',
      headline: 'ALMOÇO E\nJANTAR',
      cta: 'Chama a piazada!',
    })
  })

  it('papel que sumiu da página sai do slot', () => {
    const novo = slotValuesSeguindo(copyDaPagina, { headline: 'ALMOÇO E JANTAR' })
    expect(novo).toEqual({ headline: 'ALMOÇO E JANTAR' })
  })
})
