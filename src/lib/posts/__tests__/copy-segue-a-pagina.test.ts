import { describe, expect, it } from 'vitest'

import { copyIgual, slotValuesSeguindo, textosDoSlot } from '../copy-segue-a-pagina'

describe('copy segue a página', () => {
  const copyDaPagina = { pre: 'CHURRASCO TODO DIA', headline: 'FERIADO É\nDIA DE ESPETO', cta: 'Chama a piazada!' }

  it('reconhece o post que carregava a copy da página (via de conteúdo)', () => {
    // O agendamento grava a mesma copy; ordem das chaves e espaço em branco não contam.
    const doPost = { cta: 'Chama a piazada!', pre: 'CHURRASCO  TODO DIA', headline: 'FERIADO É\nDIA DE ESPETO ' }
    expect(copyIgual(textosDoSlot(doPost), copyDaPagina)).toBe(true)
  })

  it('NÃO mexe no post com copy própria (via de template: N posts numa página)', () => {
    const doPost = { pre: 'SEXTOU COM ESPETO', headline: 'RODÍZIO\nDE SEXTA', cta: 'Chama a piazada!' }
    expect(copyIgual(textosDoSlot(doPost), copyDaPagina)).toBe(false)
    // Um slot a mais também é copy própria.
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
