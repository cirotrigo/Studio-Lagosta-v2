/**
 * Q2 · fila de medição dos ajustes: a grade de 28 fotos não começa 28 decodificações juntas. Medidor controlado pelo
 * teste (cada medida fica pendente até ser resolvida à mão); sem rede, sem DOM, sem relógio.
 */
import { describe, expect, it } from 'vitest'
import type { MedidorDeFoto } from '../medir-foto'
import { MEDIDAS_SIMULTANEAS, medirEmFila } from '../fila-de-medidas'

type Foto = { src: string; width: number; height: number }
function medidorControlado() {
  const st = { ativas: 0, pico: 0, iniciadas: [] as string[], sinais: [] as Array<AbortSignal | undefined>, pendentes: [] as Array<{ url: string; ok: (f: Foto) => void; falha: (e: Error) => void }> }
  const medir: MedidorDeFoto = (url, opcoes) =>
    new Promise<Foto>((resolve, reject) => {
      st.ativas++
      st.pico = Math.max(st.pico, st.ativas)
      st.iniciadas.push(url)
      st.sinais.push(opcoes?.signal)
      const fim = <T>(f: (v: T) => void) => (v: T) => {
        st.ativas--
        f(v)
      }
      st.pendentes.push({ url, ok: fim(resolve), falha: fim(reject) })
    })
  return { st, medir }
}
const correr = async () => {
  for (let i = 0; i < 10; i++) await Promise.resolve()
}
const URLS = Array.from({ length: 28 }, (_, i) => `https://x/f${i}.jpg`)

describe('Q2 · medirEmFila', () => {
  it('duas medidas por vez, como padrão', () => {
    expect(MEDIDAS_SIMULTANEAS).toBe(2)
  })

  it('28 URLs: nunca mais de 2 em voo; cada uma medida uma vez, na ordem; o resultado fica na URL pedida', async () => {
    const { st, medir } = medidorControlado()
    const p = medirEmFila(URLS, medir)
    await correr()
    expect(st.iniciadas).toEqual(URLS.slice(0, 2))
    while (st.pendentes.length) {
      const m = st.pendentes.shift()!
      m.ok({ src: m.url, width: 1600, height: 1200 })
      await correr()
      expect(st.ativas).toBeLessThanOrEqual(2)
    }
    const r = await p
    expect(st.pico).toBe(2)
    expect(st.iniciadas).toEqual(URLS)
    expect(r.size).toBe(28)
    expect(r.get(URLS[5])).toEqual({ src: URLS[5], width: 1600, height: 1200 })
  })

  it('falha não trava a fila e fica sem resultado; foto de OUTRA URL volta como veio (quem confere a URL exata é o chamador)', async () => {
    const { st, medir } = medidorControlado()
    const p = medirEmFila(URLS.slice(0, 5), medir)
    await correr()
    st.pendentes.shift()!.falha(new Error('A foto não carregou.'))
    await correr()
    const segunda = st.pendentes.shift()!
    segunda.ok({ src: 'https://x/outra.jpg', width: 10, height: 10 })
    await correr()
    while (st.pendentes.length) {
      const m = st.pendentes.shift()!
      m.ok({ src: m.url, width: 1, height: 1 })
      await correr()
    }
    const r = await p
    expect(st.iniciadas).toEqual(URLS.slice(0, 5))
    expect(r.has(URLS[0])).toBe(false)
    expect(r.get(URLS[1])).toEqual({ src: 'https://x/outra.jpg', width: 10, height: 10 })
    expect(r.size).toBe(4)
  })

  it('cancelar durante a espera: as em voo recebem o sinal e nenhuma medida nova começa', async () => {
    const { st, medir } = medidorControlado()
    const c = new AbortController()
    const p = medirEmFila(URLS, medir, { signal: c.signal })
    await correr()
    expect(st.iniciadas).toHaveLength(2)
    expect(st.sinais).toEqual([c.signal, c.signal])
    c.abort()
    // o medidor real rejeita no abort; uma que ainda assim termine também não abre vaga para a próxima
    st.pendentes.shift()!.falha(new Error('Medida cancelada.'))
    st.pendentes.shift()!.ok({ src: URLS[1], width: 1, height: 1 })
    await correr()
    await p
    expect(st.iniciadas).toHaveLength(2)
  })

  it('sinal já cancelado ou lista vazia: nada é medido', async () => {
    const { st, medir } = medidorControlado()
    const c = new AbortController()
    c.abort()
    expect((await medirEmFila(URLS, medir, { signal: c.signal })).size).toBe(0)
    expect((await medirEmFila([], medir)).size).toBe(0)
    expect(st.iniciadas).toEqual([])
  })
})
