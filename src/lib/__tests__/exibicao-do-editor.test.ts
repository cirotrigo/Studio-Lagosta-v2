/**
 * L2 das linhas-guia (29/10/2026): a preferência de exibição (R, M, C, encaixe) lida do localStorage sem derrubar
 * nada por lixo, e a leitura das teclas — R/M/C só sozinhas, Shift+Alt+C/M centralizam (eram atalhos fantasma).
 */
import { describe, expect, it } from 'vitest'

import { acaoDaTecla, CHAVE_DA_EXIBICAO, EXIBICAO_PADRAO, lerExibicao } from '@/lib/exibicao-do-editor'

describe('lerExibicao', () => {
  it('sem nada gravado vale o padrão: margens e interface ligadas, bordas desligadas, encaixe ligado', () => {
    expect(lerExibicao(null)).toEqual({ margens: true, interface: true, bordas: false, encaixe: true })
    expect(lerExibicao(undefined)).toEqual(EXIBICAO_PADRAO)
    expect(lerExibicao(null)).not.toBe(EXIBICAO_PADRAO) // cópia, nunca o objeto compartilhado
  })

  it('gravação parcial ou com lixo: cada chave cai no padrão sozinha', () => {
    expect(lerExibicao(JSON.stringify({ margens: false }))).toEqual({ margens: false, interface: true, bordas: false, encaixe: true })
    expect(lerExibicao(JSON.stringify({ margens: 'não', bordas: true, encaixe: 0, extra: 1 }))).toEqual({ margens: true, interface: true, bordas: true, encaixe: true })
    expect(lerExibicao('{lixo')).toEqual(EXIBICAO_PADRAO)
    expect(lerExibicao('7')).toEqual(EXIBICAO_PADRAO)
    expect(lerExibicao('null')).toEqual(EXIBICAO_PADRAO)
  })

  it('a chave do localStorage segue o padrão do editor', () => {
    expect(CHAVE_DA_EXIBICAO).toBe('lagosta:editor:exibicao')
  })
})

describe('acaoDaTecla', () => {
  it('R, M e C sozinhas alternam margens, interface e bordas (maiúscula também)', () => {
    expect(acaoDaTecla({ key: 'r' })).toBe('margens')
    expect(acaoDaTecla({ key: 'M' })).toBe('interface')
    expect(acaoDaTecla({ key: 'c', code: 'KeyC' })).toBe('bordas')
    expect(acaoDaTecla({ key: 'x' })).toBeNull()
  })

  it('com Ctrl/Cmd não é exibição (Cmd+R é o navegador; Cmd+C é copiar)', () => {
    expect(acaoDaTecla({ key: 'r', metaKey: true })).toBeNull()
    expect(acaoDaTecla({ key: 'c', ctrlKey: true, code: 'KeyC' })).toBeNull()
  })

  it('Windows: Shift+Alt+C chega como "c" e NÃO liga as bordas — centraliza na horizontal', () => {
    expect(acaoDaTecla({ key: 'C', code: 'KeyC', shiftKey: true, altKey: true })).toBe('centrar-h')
    expect(acaoDaTecla({ key: 'M', code: 'KeyM', shiftKey: true, altKey: true })).toBe('centrar-v')
  })

  it('Mac: Alt+C produz "ç" em key; o code decide', () => {
    expect(acaoDaTecla({ key: 'Ç', code: 'KeyC', shiftKey: true, altKey: true })).toBe('centrar-h')
    expect(acaoDaTecla({ key: 'µ', code: 'KeyM', shiftKey: true, altKey: true })).toBe('centrar-v')
    expect(acaoDaTecla({ key: 'ç', code: 'KeyC', altKey: true })).toBeNull() // só Alt, sem Shift: nada
  })

  it('Shift sozinho ou Alt sozinho com R/M/C não alterna nada', () => {
    expect(acaoDaTecla({ key: 'R', shiftKey: true })).toBeNull()
    expect(acaoDaTecla({ key: 'm', altKey: true, code: 'KeyM' })).toBeNull()
    expect(acaoDaTecla({ key: 'x', code: 'KeyX', shiftKey: true, altKey: true })).toBeNull()
  })
})
