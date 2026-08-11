import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

/**
 * O defeito que estes testes protegem (reproduzido em 11/08/2026):
 *
 * O Upstash devolve HTTP 200 com `{"error": ...}` no corpo quando o banco está
 * suspenso ou com rate limit. O @upstash/redis só lança em resposta não-2xx,
 * então o envelope de erro chega ao auto-pipeline e estoura
 * `TypeError: res.map is not a function`. O erro era engolido por um catch, o
 * cache nunca acertava, e TODA busca na base pagava a ida ao servidor — medido
 * em ~600ms por busca, mais duas linhas de console.error.
 */

/** Exatamente o que o auto-pipeline do @upstash/redis faz com um corpo de erro. */
const ERRO_DO_BACKEND_CAIDO = (): never => {
  throw new TypeError('res.map is not a function')
}

type Comportamento = {
  mget?: () => unknown
  get?: () => unknown
  set?: () => unknown
}

/** Conta as idas ao servidor — é o que precisa parar quando o backend cai. */
function montarRedisFalso(comportamento: Comportamento) {
  const chamadas = { mget: 0, get: 0, set: 0 }

  const cliente = {
    mget: vi.fn(async () => {
      chamadas.mget++
      return comportamento.mget?.() ?? [null, null]
    }),
    get: vi.fn(async () => {
      chamadas.get++
      return comportamento.get?.() ?? null
    }),
    set: vi.fn(async () => {
      chamadas.set++
      return comportamento.set?.() ?? 'OK'
    }),
  }

  return { cliente, chamadas, total: () => chamadas.mget + chamadas.get + chamadas.set }
}

async function carregarCache(comportamento: Comportamento) {
  const falso = montarRedisFalso(comportamento)

  vi.doMock('@upstash/redis', () => ({
    Redis: class {
      constructor() {
        return falso.cliente as never
      }
    },
  }))

  const mod = await import('../cache')
  mod.__resetCacheBreakerForTests()
  return { ...mod, ...falso }
}

beforeEach(() => {
  vi.resetModules()
  vi.clearAllMocks()
  process.env.UPSTASH_REDIS_REST_URL = 'https://exemplo.upstash.io'
  process.env.UPSTASH_REDIS_REST_TOKEN = 'token-de-teste'
  vi.spyOn(console, 'error').mockImplementation(() => {})
  vi.spyOn(console, 'warn').mockImplementation(() => {})
})

afterEach(() => {
  vi.doUnmock('@upstash/redis')
  vi.restoreAllMocks()
  vi.useRealTimers()
})

/** Uma busca = uma leitura + uma escrita, como searchKnowledgeBase faz. */
async function umaBusca(mod: Awaited<ReturnType<typeof carregarCache>>, query = 'happy hour') {
  const lido = await mod.getCachedResults(query, 3, undefined, { topK: 5, minScore: 0.7 })
  await mod.setCachedResults(query, 3, [], undefined, undefined, { topK: 5, minScore: 0.7 })
  return lido
}

describe('cache da base de conhecimento — backend indisponível', () => {
  it('não propaga o TypeError do auto-pipeline: a busca segue funcionando sem cache', async () => {
    const mod = await carregarCache({ mget: ERRO_DO_BACKEND_CAIDO, get: ERRO_DO_BACKEND_CAIDO })

    await expect(umaBusca(mod)).resolves.toBeNull()
  })

  it('para de ir ao servidor depois de o backend se provar caído', async () => {
    const mod = await carregarCache({ mget: ERRO_DO_BACKEND_CAIDO, get: ERRO_DO_BACKEND_CAIDO })

    // Duas buscas bastam para passar do limiar de 3 falhas seguidas.
    await umaBusca(mod)
    await umaBusca(mod)
    const idasAteDisparar = mod.total()
    expect(idasAteDisparar).toBeGreaterThan(0)

    // A partir daqui, nenhuma busca pode custar ida ao servidor.
    await umaBusca(mod)
    await umaBusca(mod)
    await umaBusca(mod)

    expect(mod.total()).toBe(idasAteDisparar)
  })

  it('avisa UMA vez, com diagnóstico acionável, em vez de logar a cada busca', async () => {
    const mod = await carregarCache({ mget: ERRO_DO_BACKEND_CAIDO, get: ERRO_DO_BACKEND_CAIDO })

    for (let i = 0; i < 10; i++) await umaBusca(mod)

    const avisos = vi.mocked(console.warn).mock.calls.map((c) => String(c[0]))
    const sobreDesativacao = avisos.filter((linha) => linha.includes('[cache] desativado'))

    expect(sobreDesativacao).toHaveLength(1)
    expect(sobreDesativacao[0]).toContain('HTTP 200 com corpo de erro')
    expect(sobreDesativacao[0]).toContain('UPSTASH_REDIS_REST_URL')
  })

  it('volta a testar sozinho e reativa o cache quando o banco melhora', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-08-11T12:00:00Z'))

    let backendCaido = true
    const payload = JSON.stringify({ v: 0, t: Date.now(), results: [{ chunkId: 'c1' }] })

    const mod = await carregarCache({
      mget: () => {
        if (backendCaido) ERRO_DO_BACKEND_CAIDO()
        return [null, payload]
      },
      get: () => {
        if (backendCaido) ERRO_DO_BACKEND_CAIDO()
        return null
      },
    })

    await umaBusca(mod)
    await umaBusca(mod)
    const idasEnquantoCaido = mod.total()

    // Backend consertado, mas ainda dentro do cooldown: ninguém incomoda o servidor.
    backendCaido = false
    await umaBusca(mod)
    expect(mod.total()).toBe(idasEnquantoCaido)

    // Passado o cooldown, a sonda entra e o cache volta — sem redeploy.
    vi.advanceTimersByTime(61_000)
    const lido = await mod.getCachedResults('happy hour', 3, undefined, { topK: 5, minScore: 0.7 })

    expect(mod.total()).toBeGreaterThan(idasEnquantoCaido)
    expect(lido).toEqual([{ chunkId: 'c1' }])
  })

  it('uma falha isolada não desliga o cache', async () => {
    let primeira = true
    const mod = await carregarCache({
      mget: () => {
        if (primeira) {
          primeira = false
          throw new Error('soluço de rede')
        }
        return [null, JSON.stringify({ v: 0, t: Date.now(), results: [] })]
      },
    })

    await mod.getCachedResults('a', 3)
    const depoisDaFalha = mod.chamadas.mget

    await mod.getCachedResults('b', 3)

    expect(mod.chamadas.mget).toBe(depoisDaFalha + 1)
  })
})

describe('cache da base de conhecimento — caminho saudável', () => {
  it('devolve o que está cacheado e nunca dispara o disjuntor', async () => {
    const payload = JSON.stringify({ v: 0, t: Date.now(), results: [{ chunkId: 'c1' }] })
    const mod = await carregarCache({ mget: () => [null, payload] })

    for (let i = 0; i < 5; i++) {
      const lido = await mod.getCachedResults('happy hour', 3, undefined, { topK: 5, minScore: 0.7 })
      expect(lido).toEqual([{ chunkId: 'c1' }])
    }

    expect(mod.chamadas.mget).toBe(5)
    expect(console.warn).not.toHaveBeenCalled()
  })

  it('ignora payload de versão antiga em vez de servir dado velho', async () => {
    const payload = JSON.stringify({ v: 1, t: Date.now(), results: [{ chunkId: 'antigo' }] })
    const mod = await carregarCache({ mget: () => [7, payload] })

    await expect(mod.getCachedResults('happy hour', 3)).resolves.toBeNull()
  })
})

describe('cache da base de conhecimento — sem credenciais', () => {
  it('desliga silenciosamente, avisando só uma vez', async () => {
    delete process.env.UPSTASH_REDIS_REST_URL
    delete process.env.UPSTASH_REDIS_REST_TOKEN

    const mod = await carregarCache({})

    for (let i = 0; i < 5; i++) await umaBusca(mod)

    expect(mod.total()).toBe(0)
    expect(vi.mocked(console.warn).mock.calls.filter((c) => String(c[0]).includes('não configurado'))).toHaveLength(1)
  })
})
