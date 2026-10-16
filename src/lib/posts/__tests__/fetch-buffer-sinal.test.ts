/**
 * CP5c § 3 — `fetchBuffer(url, { signal, timeoutMs })`: o download aceita cancelamento (`req.destroy()` no abort),
 * segue redirecionamentos com o MESMO sinal (um laço de redirecionamento também cai no prazo) e tem um teto de
 * inatividade do socket (`req.setTimeout`). Sem as opções, o comportamento é o de sempre.
 *
 * A suíte unitária é hermética (nenhum socket, nem loopback — `vitest.setup.ts`): o `http` é simulado por módulo,
 * com um pedido falso que se comporta como o do Node (`destroy(erro)` emite `error`; `setTimeout(ms, cb)` agenda).
 */
import { EventEmitter } from 'node:events'
import { Readable } from 'node:stream'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/db', () => ({ db: {} }))

type Modo = 'ok' | 'laco' | 'mudo' | 'erro-http'
const rede = vi.hoisted(() => ({ modo: 'ok' as 'ok' | 'laco' | 'mudo' | 'erro-http', pedidos: [] as string[], destruidos: 0 }))

class PedidoFalso extends EventEmitter {
  destruido = false
  destroy(erro?: Error) {
    if (this.destruido) return this
    this.destruido = true
    rede.destruidos++
    if (erro) setImmediate(() => this.emit('error', erro))
    return this
  }
  setTimeout(ms: number, cb: () => void) {
    setTimeout(cb, ms)
    return this
  }
}
function get(url: string, cb: (res: Readable & { statusCode?: number; headers: Record<string, string> }) => void) {
  const req = new PedidoFalso()
  rede.pedidos.push(url)
  setImmediate(() => {
    if (req.destruido || rede.modo === 'mudo') return
    if (rede.modo === 'laco') {
      const res = Object.assign(new Readable({ read() {} }), { statusCode: 302, headers: { location: url.endsWith('/a') ? url.slice(0, -2) + '/b' : url.slice(0, -2) + '/a' } })
      return cb(res)
    }
    if (rede.modo === 'erro-http') {
      const res = Object.assign(new Readable({ read() {} }), { statusCode: 404, headers: {} })
      return cb(res)
    }
    const res = Object.assign(Readable.from([Buffer.from('bytes-da-fonte')]), { statusCode: 200, headers: {} })
    cb(res)
  })
  return req
}
vi.mock('http', async (original) => ({ ...(await original<typeof import('http')>()), get }))
vi.mock('https', async (original) => ({ ...(await original<typeof import('https')>()), get }))

import { fetchBuffer } from '../register-project-fonts'

beforeEach(() => {
  rede.modo = 'ok'
  rede.pedidos = []
  rede.destruidos = 0
})
const modo = (m: Modo) => void (rede.modo = m)

describe('fetchBuffer com sinal e prazo', () => {
  it('sem opções: baixa como sempre (http e https), e um erro HTTP rejeita com o código', async () => {
    expect((await fetchBuffer('http://blob.test/fonte.otf')).toString()).toBe('bytes-da-fonte')
    expect((await fetchBuffer('https://blob.test/fonte.otf')).toString()).toBe('bytes-da-fonte')
    modo('erro-http')
    await expect(fetchBuffer('https://blob.test/nada.otf')).rejects.toThrow('HTTP 404')
  })

  it('sinal já abortado: rejeita antes de abrir a conexão', async () => {
    const controle = new AbortController()
    controle.abort(new Error('cancelado antes'))
    await expect(fetchBuffer('https://blob.test/mudo', { signal: controle.signal })).rejects.toThrow('cancelado antes')
    expect(rede.pedidos).toEqual([])
  })

  it('redirecionamento em laço: cada salto segue com o MESMO sinal; o abort interrompe o laço, destrói o pedido e nenhum salto novo acontece', async () => {
    modo('laco')
    const controle = new AbortController()
    const promessa = fetchBuffer('https://blob.test/laco/a', { signal: controle.signal })
    await new Promise((r) => setTimeout(r, 30))
    expect(rede.pedidos.length).toBeGreaterThan(3)
    controle.abort(new Error('prazo da medição'))
    await expect(promessa).rejects.toThrow('prazo da medição')
    const saltos = rede.pedidos.length
    expect(rede.destruidos).toBeGreaterThan(0)
    await new Promise((r) => setTimeout(r, 30))
    expect(rede.pedidos.length).toBe(saltos)
  })

  it('socket mudo: o teto de inatividade (`timeoutMs`) destrói o pedido e rejeita; sem o teto, o abort pelo sinal rejeita', async () => {
    modo('mudo')
    await expect(fetchBuffer('https://blob.test/mudo', { timeoutMs: 20 })).rejects.toThrow(/sem resposta por 20 ms/)
    expect(rede.destruidos).toBe(1)
    const controle = new AbortController()
    const promessa = fetchBuffer('https://blob.test/mudo', { signal: controle.signal })
    setTimeout(() => controle.abort(new Error('abortado')), 10)
    await expect(promessa).rejects.toThrow('abortado')
    expect(rede.destruidos).toBe(2)
  })

  it('sem sinal nem teto: um socket mudo fica pendurado (o comportamento de sempre — por isso o prazo do gate é imposto por fora)', async () => {
    modo('mudo')
    const resultado = await Promise.race([fetchBuffer('https://blob.test/mudo').then(() => 'resolveu', () => 'rejeitou'), new Promise((r) => setTimeout(() => r('pendurado'), 50))])
    expect(resultado).toBe('pendurado')
  })
})
