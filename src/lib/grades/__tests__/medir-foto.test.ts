/**
 * G2 · medidor da foto com prazo e cancelamento. `window.Image` é um dublê: o teste decide quando a foto "carrega".
 * Nada de rede nem de DOM real.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { PRAZO_DA_MEDIDA_MS, medirFotoNoNavegador } from '../medir-foto'

class ImagemFalsa {
  static ultima: ImagemFalsa | null = null
  onload: (() => void) | null = null
  onerror: (() => void) | null = null
  naturalWidth = 0
  naturalHeight = 0
  src = ''
  constructor() {
    ImagemFalsa.ultima = this
  }
  carregar(w: number, h: number) {
    this.naturalWidth = w
    this.naturalHeight = h
    this.onload?.()
  }
}

beforeEach(() => {
  vi.useFakeTimers()
  vi.stubGlobal('window', { Image: ImagemFalsa })
})
afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe('G2 · medirFotoNoNavegador', () => {
  it('devolve a URL carregada e as dimensões NATURAIS', async () => {
    const p = medirFotoNoNavegador('https://x/a.jpg')
    expect(ImagemFalsa.ultima!.src).toBe('https://x/a.jpg')
    ImagemFalsa.ultima!.carregar(1600, 1200)
    await expect(p).resolves.toEqual({ src: 'https://x/a.jpg', width: 1600, height: 1200 })
  })

  it('erro de carregamento rejeita', async () => {
    const p = medirFotoNoNavegador('https://x/a.jpg')
    ImagemFalsa.ultima!.onerror?.()
    await expect(p).rejects.toThrow()
  })

  it('foto que nunca carrega rejeita no prazo (o botão não fica preso)', async () => {
    const p = medirFotoNoNavegador('https://x/a.jpg', { prazoMs: 1000 })
    const pego = p.catch((e: Error) => e)
    vi.advanceTimersByTime(999)
    ImagemFalsa.ultima!.naturalWidth = 0
    vi.advanceTimersByTime(1)
    expect(await pego).toBeInstanceOf(Error)
    // depois do prazo, um onload atrasado não muda nada
    ImagemFalsa.ultima!.carregar(10, 10)
    await expect(p).rejects.toThrow()
    expect(PRAZO_DA_MEDIDA_MS).toBeGreaterThan(0)
  })

  it('cancelamento rejeita na hora; sinal já cancelado nem começa a carregar', async () => {
    const c = new AbortController()
    const p = medirFotoNoNavegador('https://x/a.jpg', { signal: c.signal })
    c.abort()
    await expect(p).rejects.toThrow()
    const c2 = new AbortController()
    c2.abort()
    ImagemFalsa.ultima = null
    await expect(medirFotoNoNavegador('https://x/b.jpg', { signal: c2.signal })).rejects.toThrow()
    expect(ImagemFalsa.ultima).toBeNull()
  })
})
