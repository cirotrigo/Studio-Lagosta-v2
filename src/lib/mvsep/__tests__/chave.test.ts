import { afterEach, describe, expect, it, vi } from 'vitest'
import { chaveDaMvsep } from '../chave'

describe('chaveDaMvsep', () => {
  afterEach(() => vi.unstubAllEnvs())

  it('falha com erro claro quando a variável não existe', () => {
    vi.stubEnv('MVSEP_API_KEY', '')
    expect(() => chaveDaMvsep()).toThrow(/MVSEP_API_KEY não está definida/)
  })

  it('falha quando a variável só tem espaços', () => {
    vi.stubEnv('MVSEP_API_KEY', '   ')
    expect(() => chaveDaMvsep()).toThrow(/MVSEP_API_KEY/)
  })

  it('devolve a chave do ambiente', () => {
    vi.stubEnv('MVSEP_API_KEY', 'chave-de-teste')
    expect(chaveDaMvsep()).toBe('chave-de-teste')
  })
})
