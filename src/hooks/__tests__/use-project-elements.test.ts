import { describe, expect, it, vi } from 'vitest'
import { MutationObserver, QueryClient, QueryObserver } from '@tanstack/react-query'
import { consultaDosElementos, envioDeElemento, exclusaoDeElemento } from '../use-project-elements'

/**
 * CP-V2e: as opções que a tela usa (consulta, envio, exclusão), num QueryClient de verdade (com os padrões do
 * `QueryProvider`), contra um `fetch` falso que registra método, caminho, cabeçalhos e corpo.
 */
const ITEM = { id: 11, name: 'Selo', fileUrl: 'https://blob.test/selo.png', category: null, projectId: 8 }
const HTML = '<!DOCTYPE html><html><body>sign-in</body></html>'

type Resposta = { status?: number; corpo: unknown; tipo?: 'json' | 'html' | 'texto' }
function servidor(respostas: Resposta[]) {
  const chamadas: Array<{ url: string; metodo: string; headers: Headers; corpo: unknown }> = []
  const fetch = vi.fn(async (url: string, init?: RequestInit) => {
    chamadas.push({ url, metodo: init?.method ?? 'GET', headers: new Headers(init?.headers), corpo: init?.body })
    const r = respostas.shift()
    if (!r) throw new Error(`chamada a mais: ${init?.method} ${url}`)
    const tipo = r.tipo ?? 'json'
    const body = tipo === 'json' ? JSON.stringify(r.corpo) : String(r.corpo)
    return new Response(body, { status: r.status ?? 200, headers: { 'content-type': tipo === 'json' ? 'application/json' : tipo === 'html' ? 'text/html' : 'text/plain' } })
  })
  vi.stubGlobal('fetch', fetch)
  return { chamadas, fetch }
}

const cliente = () =>
  new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })

async function consultar(qc: QueryClient, projectId: number) {
  const obs = new QueryObserver(qc, consultaDosElementos(projectId))
  const fim = new Promise<void>((resolve) => {
    const parar = obs.subscribe((r) => {
      if (r.status !== 'pending') {
        parar()
        resolve()
      }
    })
  })
  await fim
  return obs.getCurrentResult()
}

const arquivo = (nome: string, tipo: string) => new File([new Uint8Array([1, 2, 3])], nome, { type: tipo })

describe('consulta estrita', () => {
  it('[] é vazia confirmada; lista válida passa', async () => {
    servidor([{ corpo: [] }, { corpo: [ITEM] }])
    expect((await consultar(cliente(), 8)).data).toEqual([])
    expect((await consultar(cliente(), 8)).data).toEqual([ITEM])
  })
  it.each([
    ['HTML 200', { corpo: HTML, tipo: 'html' as const }],
    ['{} com 200', { corpo: {} }],
    ['item sem fileUrl', { corpo: [{ ...ITEM, fileUrl: undefined }] }],
    ['item de outro projeto', { corpo: [{ ...ITEM, projectId: 9 }] }],
  ])('%s é ERRO, nunca vazia', async (_n, r) => {
    servidor([r])
    const res = await consultar(cliente(), 8)
    expect(res.status).toBe('error')
    expect(res.data).toBeUndefined()
  })
})

describe('envio multipart', () => {
  it('1 POST com FormData (file + name), sem Content-Type JSON; devolve o elemento; invalida as 3 keys da ORIGEM', async () => {
    const { chamadas } = servidor([{ status: 201, corpo: { ...ITEM, id: 20, uploadedBy: 'u', createdAt: 'x' } }])
    const qc = cliente()
    const espiao = vi.spyOn(qc, 'invalidateQueries')
    const m = new MutationObserver(qc, envioDeElemento(qc))
    const criado = await m.mutate({ projectId: 8, file: arquivo('selo novo.png', 'image/png') })
    expect(criado).toEqual({ ...ITEM, id: 20 })
    expect(chamadas).toHaveLength(1)
    expect([chamadas[0].metodo, chamadas[0].url]).toEqual(['POST', '/api/projects/8/elements'])
    expect(chamadas[0].headers.get('content-type')).toBeNull()
    const corpo = chamadas[0].corpo as FormData
    expect(corpo).toBeInstanceOf(FormData)
    expect((corpo.get('file') as File).name).toBe('selo novo.png')
    expect(corpo.get('name')).toBe('selo novo')
    expect(espiao.mock.calls.map((c) => c[0]?.queryKey)).toEqual([
      ['project-elements', 8],
      ['project-assets', 8, 'elements'],
      ['project', 8, 'elements'],
    ])
  })

  it.each([
    ['HTML 200', { corpo: HTML, tipo: 'html' as const }, /não confirmou/],
    ['texto 200', { corpo: 'ok', tipo: 'texto' as const }, /não confirmou/],
    ['objeto incompleto', { status: 201, corpo: { id: 20 } }, /não confirmou/],
    ['outro projectId', { status: 201, corpo: { ...ITEM, projectId: 9 } }, /não confirmou/],
    ['415 JSON', { status: 415, corpo: { error: 'Formato não suportado' } }, /Formato não suportado/],
    ['413 da plataforma (texto)', { status: 413, corpo: 'Request Entity Too Large', tipo: 'texto' as const }, /grande demais/],
    ['500', { status: 500, corpo: { error: 'falha simulada' } }, /falha simulada/],
  ])('%s: erro, 1 só POST (sem nova tentativa) e reconcilia as 3 keys mesmo assim', async (_n, r, mensagem) => {
    const { fetch } = servidor([r])
    const qc = cliente()
    const espiao = vi.spyOn(qc, 'invalidateQueries')
    const m = new MutationObserver(qc, envioDeElemento(qc))
    await expect(m.mutate({ projectId: 8, file: arquivo('a.png', 'image/png') })).rejects.toThrow(mensagem)
    expect(fetch).toHaveBeenCalledTimes(1)
    expect(espiao.mock.calls.map((c) => c[0]?.queryKey)).toHaveLength(3)
  })
})

describe('exclusão', () => {
  it('1 DELETE no caminho do item; só { success: true } é sucesso; invalida as 3 keys do projeto da VARIÁVEL', async () => {
    const { chamadas } = servidor([{ corpo: { success: true } }])
    const qc = cliente()
    const espiao = vi.spyOn(qc, 'invalidateQueries')
    const m = new MutationObserver(qc, exclusaoDeElemento(qc))
    await m.mutate({ projectId: 7, elementId: 11 })
    expect(chamadas.map((c) => [c.metodo, c.url])).toEqual([['DELETE', '/api/projects/7/elements/11']])
    expect(espiao.mock.calls.map((c) => c[0]?.queryKey)).toEqual([
      ['project-elements', 7],
      ['project-assets', 7, 'elements'],
      ['project', 7, 'elements'],
    ])
  })

  it.each([
    ['HTML 200', { corpo: HTML, tipo: 'html' as const }],
    ['texto 200', { corpo: 'ok', tipo: 'texto' as const }],
    ['{ success: false }', { corpo: { success: false } }],
    ['{}', { corpo: {} }],
    ['403', { status: 403, corpo: { error: 'Não autorizado' } }],
    ['500', { status: 500, corpo: { error: 'falha' } }],
  ])('%s: erro, 1 só DELETE, e a nova leitura reconcilia (sem repetir o pedido)', async (_n, r) => {
    const { fetch } = servidor([r])
    const qc = cliente()
    const espiao = vi.spyOn(qc, 'invalidateQueries')
    const m = new MutationObserver(qc, exclusaoDeElemento(qc))
    await expect(m.mutate({ projectId: 8, elementId: 11 })).rejects.toThrow()
    expect(fetch).toHaveBeenCalledTimes(1)
    expect(espiao.mock.calls.map((c) => c[0]?.queryKey)).toEqual([
      ['project-elements', 8],
      ['project-assets', 8, 'elements'],
      ['project', 8, 'elements'],
    ])
  })

  it('resposta perdida depois de o servidor apagar: a nova leitura é autoritativa (o item some)', async () => {
    servidor([{ corpo: [ITEM] }, { status: 500, corpo: { error: 'gateway' } }, { corpo: [] }])
    const qc = cliente()
    const obs = new QueryObserver(qc, consultaDosElementos(8))
    const parar = obs.subscribe(() => {})
    await vi.waitFor(() => expect(obs.getCurrentResult().data).toEqual([ITEM]))
    const m = new MutationObserver(qc, exclusaoDeElemento(qc))
    await expect(m.mutate({ projectId: 8, elementId: 11 })).rejects.toThrow()
    await vi.waitFor(() => expect(obs.getCurrentResult().data).toEqual([]))
    parar()
  })
})
