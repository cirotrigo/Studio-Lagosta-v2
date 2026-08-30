import { describe, it, expect } from 'vitest'
import {
  desfechoVenceOAnterior,
  exigeSugestao,
  normalizarDesfecho,
  normalizarSuperficie,
  normalizarTipo,
} from '../vocabulario'

describe('normalização do vocabulário', () => {
  it('aceita caixa, acento e underscore', () => {
    expect(normalizarTipo('COPY')).toBe('copy')
    expect(normalizarTipo(' Modelo ')).toBe('modelo')
    expect(normalizarDesfecho('Aceita_como_veio')).toBe('aceita-como-veio')
    expect(normalizarDesfecho('escolha própria')).toBe('escolha-propria')
    expect(normalizarSuperficie('Agenda')).toBe('agenda')
  })

  it('nunca inventa: valor desconhecido é undefined', () => {
    // 'legenda' era o exemplo de desconhecido até virar tipo de verdade em
    // d3d6295b (a LEGENDA entrou no corpus) — a fixture ficou para trás.
    expect(normalizarTipo('legenda')).toBe('legenda')
    expect(normalizarTipo('rodape-magico')).toBeUndefined()
    expect(normalizarDesfecho('mais ou menos')).toBeUndefined()
    expect(normalizarSuperficie(42)).toBeUndefined()
    expect(normalizarTipo(null)).toBeUndefined()
  })
})

describe('desfechoVenceOAnterior', () => {
  it('grava quando ainda não há desfecho', () => {
    expect(desfechoVenceOAnterior(null, 'aceita-como-veio')).toBe(true)
    expect(desfechoVenceOAnterior(undefined, 'expirada')).toBe(true)
  })

  // A regra da F4: a janela vai até a publicação. Uma edição posterior diz
  // mais sobre a proposta do que o "aceitei" de dez minutos antes.
  it('evidência mais forte sobrescreve; o caminho de volta, não', () => {
    expect(desfechoVenceOAnterior('aceita-como-veio', 'editada')).toBe(true)
    expect(desfechoVenceOAnterior('aceita-como-veio', 'descartada')).toBe(true)
    expect(desfechoVenceOAnterior('editada', 'aceita-como-veio')).toBe(false)
    expect(desfechoVenceOAnterior('descartada', 'editada')).toBe(false)
  })

  it('o mesmo desfecho duas vezes não é regravado (idempotência)', () => {
    expect(desfechoVenceOAnterior('editada', 'editada')).toBe(false)
  })

  it('expirada só vale sobre o vazio', () => {
    expect(desfechoVenceOAnterior('aceita-como-veio', 'expirada')).toBe(false)
  })

  it('escolha-propria não participa da disputa', () => {
    expect(desfechoVenceOAnterior('escolha-propria', 'editada')).toBe(false)
    expect(desfechoVenceOAnterior('aceita-como-veio', 'escolha-propria')).toBe(false)
    expect(exigeSugestao('escolha-propria')).toBe(false)
    expect(exigeSugestao('aceita-como-veio')).toBe(true)
  })
})
