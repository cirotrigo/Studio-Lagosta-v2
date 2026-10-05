import { describe, expect, it } from 'vitest'
import { EscritaAbortada, foiAbortada, lancarSeAbortado, motivoDoAborto } from '../aborto'

describe('aborto cooperativo das escritas da base (PR13-20)', () => {
  it('sem sinal, ou com sinal vivo, não faz nada; disparado, lança EscritaAbortada com a etapa e o motivo', () => {
    expect(() => lancarSeAbortado(undefined, 'gravar chunks')).not.toThrow()
    const c = new AbortController()
    expect(() => lancarSeAbortado(c.signal, 'gravar chunks')).not.toThrow()
    c.abort(new Error('a trava por projeto se perdeu'))
    let erro: unknown
    try { lancarSeAbortado(c.signal, 'gravar chunks') } catch (e) { erro = e }
    expect(foiAbortada(erro)).toBe(true)
    expect((erro as EscritaAbortada).etapa).toBe('gravar chunks')
    expect((erro as Error).message).toMatch(/abortada antes de "gravar chunks": a trava por projeto se perdeu/)
    expect(motivoDoAborto(c.signal)).toBe('a trava por projeto se perdeu')
  })
  it('foiAbortada reconhece pelo código também (erro serializado entre módulos) e recusa erro comum', () => {
    expect(foiAbortada({ code: 'ESCRITA_ABORTADA' })).toBe(true)
    expect(foiAbortada(new Error('outra coisa'))).toBe(false)
    const d = new AbortController(); d.abort('motivo em texto')
    expect(motivoDoAborto(d.signal)).toBe('motivo em texto')
  })
})
