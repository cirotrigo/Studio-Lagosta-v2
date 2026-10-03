import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { relogioDaPagina } from '../relogio-da-pagina'

let agora = 1000
beforeEach(() => {
  agora = 1000
  vi.spyOn(performance, 'now').mockImplementation(() => agora)
})
afterEach(() => vi.restoreAllMocks())

const avancar = (ms: number) => {
  agora += ms
}

describe('relogioDaPagina', () => {
  it('nasce parado em 0 e é um por página', () => {
    const a = relogioDaPagina('a')
    expect(a.estado()).toEqual({ t: 0, tocando: false, modo: 'previa' })
    expect(relogioDaPagina('a')).toBe(a)
    expect(relogioDaPagina('b')).not.toBe(a)
    expect(relogioDaPagina(undefined)).toBe(relogioDaPagina(null))
  })

  it('tocando, o tempo anda pelo relógio de parede; pausado, congela', () => {
    const r = relogioDaPagina('t1')
    r.tocar()
    avancar(1500)
    expect(r.agora()).toBeCloseTo(1.5, 5)
    r.pausar()
    avancar(1000)
    expect(r.agora()).toBeCloseTo(1.5, 5)
    expect(r.estado().t).toBeCloseTo(1.5, 5)
    r.tocar()
    avancar(500)
    expect(r.agora()).toBeCloseTo(2, 5)
  })

  it('ir(t) e zerar valem tocando ou parado, e o snapshot só muda em evento', () => {
    const r = relogioDaPagina('t2')
    const ouvinte = vi.fn()
    r.subscribe(ouvinte)
    r.ir(3)
    expect(r.agora()).toBe(3)
    r.tocar()
    avancar(200)
    const snapshot = r.estado()
    avancar(200)
    expect(r.estado()).toBe(snapshot) // nenhum evento entre as duas leituras
    r.ir(-5)
    expect(r.agora()).toBe(0)
    r.zerar()
    expect(r.estado()).toEqual({ t: 0, tocando: false, modo: 'previa' })
    expect(ouvinte).toHaveBeenCalledTimes(4) // ir, tocar, ir, zerar
    r.zerar()
    expect(ouvinte).toHaveBeenCalledTimes(4) // já estava zerado: não emite
  })

  it('alternar troca entre tocar e pausar', () => {
    const r = relogioDaPagina('t3')
    r.alternar()
    expect(r.estado().tocando).toBe(true)
    r.alternar()
    expect(r.estado().tocando).toBe(false)
  })

  it('gravação é exclusiva: tocar/pausar/ir/zerar são recusados e só avancarGravacao anda', () => {
    const r = relogioDaPagina('t4')
    r.ir(2)
    r.tocar()
    r.iniciarGravacao()
    expect(r.estado()).toEqual({ t: 0, tocando: false, modo: 'gravacao' })
    r.tocar()
    r.ir(9)
    r.zerar()
    avancar(5000)
    expect(r.agora()).toBe(0)
    r.avancarGravacao(1.25)
    expect(r.agora()).toBe(1.25)
    r.encerrarGravacao()
    expect(r.estado()).toEqual({ t: 0, tocando: false, modo: 'previa' })
    r.avancarGravacao(3) // fora da gravação, ignorado
    expect(r.agora()).toBe(0)
  })
})
