/**
 * PR #238, revisão do Codex (18/10/2026): o import ESTÁTICO de `canvas-renderer` (que carrega o addon nativo no
 * topo) fazia `register-project-fonts` lançar no import quando o addon falta — antes do `try/catch` de
 * `familiasNaoCarregadas`, que promete devolver todas as famílias como não carregadas. Esta é a prova que falhou,
 * agora permanente: sem o addon, o módulo importa, `fetchBuffer` baixa e `familiasNaoCarregadas` devolve tudo; e
 * o REGISTRO falha alto (nunca vira sucesso nem medida aprovada).
 *
 * O addon "indisponível" é a fábrica do mock lançando — o mesmo erro que o import real dá sem o binário. O `http`
 * é simulado como em `fetch-buffer-sinal.test.ts` (a suíte é hermética).
 */
import { EventEmitter } from 'node:events'
import { Readable } from 'node:stream'
import { describe, expect, it, vi } from 'vitest'

vi.mock('@napi-rs/canvas', () => {
  throw new Error('addon nativo indisponível (simulado)')
})
vi.mock('@/lib/db', () => ({ db: {} }))
const rede = vi.hoisted(() => ({ pedidos: [] as string[] }))
function get(url: string, cb: (res: Readable & { statusCode?: number; headers: Record<string, string> }) => void) {
  rede.pedidos.push(url)
  const req: EventEmitter & { destroy: () => unknown; setTimeout: () => unknown } = Object.assign(new EventEmitter(), { destroy: () => req, setTimeout: () => req })
  setImmediate(() => cb(Object.assign(Readable.from([Buffer.from('bytes-da-fonte')]), { statusCode: 200, headers: {} })))
  return req
}
vi.mock('http', async (original) => ({ ...(await original<typeof import('http')>()), get }))
vi.mock('https', async (original) => ({ ...(await original<typeof import('https')>()), get }))

const clienteCom = (fontes: Array<{ fontFamily: string; fileUrl: string }>) => ({ customFont: { findMany: vi.fn(async () => fontes) } })

describe('register-project-fonts sem o addon nativo', () => {
  it('o módulo importa e fetchBuffer baixa sem tocar no addon', async () => {
    const mod = await import('../register-project-fonts')
    expect((await mod.fetchBuffer('https://blob.test/fonte.otf')).toString()).toBe('bytes-da-fonte')
    expect(rede.pedidos).toEqual(['https://blob.test/fonte.otf'])
  })

  it('familiasNaoCarregadas devolve TODAS as famílias pedidas (o lado honesto), sem duplicar nem aceitar vazio', async () => {
    const { familiasNaoCarregadas } = await import('../register-project-fonts')
    expect([...(await familiasNaoCarregadas(['Montserrat', 'Branley GC', 'Montserrat', ' ']))].sort()).toEqual(['Branley GC', 'Montserrat'])
  })

  it('registerProjectFonts REJEITA — com e sem fontes no projeto: ausência nativa nunca vira sucesso', async () => {
    const { registerProjectFonts } = await import('../register-project-fonts')
    const vazio = clienteCom([])
    await expect(registerProjectFonts(1, { cliente: vazio })).rejects.toThrow()
    const comFonte = clienteCom([{ fontFamily: 'Branley GC', fileUrl: 'https://blob.test/branley.otf' }])
    await expect(registerProjectFonts(1, { cliente: comFonte })).rejects.toThrow()
  })
})
