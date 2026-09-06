import { describe, expect, it } from 'vitest'
import { ehUrlDoBlob, substituirUrl } from '../reapontar-midias-contrato'

const A = 'https://x.public.blob.vercel-storage.com/2026-05-18_arte-OXX7XT.png'
const D = 'https://lh3.googleusercontent.com/d/1abc=w2000'

describe('substituirUrl', () => {
  it('troca por posição e nunca reduz a contagem', () => {
    const { novas, posicoes } = substituirUrl(['u1', A, 'u3'], A, D)
    expect(novas).toEqual(['u1', D, 'u3'])
    expect(posicoes).toEqual([1])
  })

  it('troca toda ocorrência (carrossel pode repetir a arte)', () => {
    const { novas, posicoes } = substituirUrl([A, 'u2', A], A, D)
    expect(novas).toEqual([D, 'u2', D])
    expect(posicoes).toEqual([0, 2])
  })

  it('é exata: prefixo igual não casa', () => {
    const parecida = `${A}?x=1`
    const { novas, posicoes } = substituirUrl([parecida], A, D)
    expect(novas).toEqual([parecida])
    expect(posicoes).toEqual([])
  })

  it('lista vazia continua vazia', () => {
    expect(substituirUrl([], A, D)).toEqual({ novas: [], posicoes: [] })
  })
})

describe('ehUrlDoBlob', () => {
  it('só o Vercel Blob é alvo do cleanup', () => {
    expect(ehUrlDoBlob(A)).toBe(true)
    expect(ehUrlDoBlob(D)).toBe(false)
    expect(ehUrlDoBlob(null)).toBe(false)
  })
})
