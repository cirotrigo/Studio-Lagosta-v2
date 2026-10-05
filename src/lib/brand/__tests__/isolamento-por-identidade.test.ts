import { describe, expect, it } from 'vitest'
import { identidadeDoEndpoint, isolamentoDoCache, isolamentoDoIndexador, podeIndexar } from '../migracao-da-voz'

/**
 * PR13-49 (revisão final do Codex, 18/09/2026): a classificação comparava
 * STRINGS — `https://PROD.upstash.io` no dev contra `https://prod.upstash.io`
 * na produção dava "isolado", e `--dev` escrevia no índice (e no cache) de
 * produção. Agora vale a identidade do endpoint.
 */
const VEC = 'https://prod-vector.upstash.io'
const RED = 'https://prod-redis.upstash.io'
const prod = { UPSTASH_VECTOR_REST_URL: VEC, UPSTASH_VECTOR_REST_TOKEN: 'p', UPSTASH_REDIS_REST_URL: RED, UPSTASH_REDIS_REST_TOKEN: 'p' }
const alvo = (vec: string, red: string) => ({ UPSTASH_VECTOR_REST_URL: vec, UPSTASH_VECTOR_REST_TOKEN: 'd', UPSTASH_REDIS_REST_URL: red, UPSTASH_REDIS_REST_TOKEN: 'd' })

describe('isolamento do Upstash pela identidade do endpoint (PR13-49)', () => {
  const equivalentes: Array<[string, string, string]> = [
    ['caixa diferente no host', 'https://PROD-vector.upstash.io', 'https://Prod-Redis.UPSTASH.io'],
    ['porta padrão explícita', 'https://prod-vector.upstash.io:443', 'https://prod-redis.upstash.io:443/'],
    ['barra de raiz e ponto final', 'https://prod-vector.upstash.io./', 'https://prod-redis.upstash.io./'],
    ['espaços em volta', '  https://prod-vector.upstash.io  ', ' https://prod-redis.upstash.io '],
    ['outro esquema no mesmo host', 'http://prod-vector.upstash.io', 'http://prod-redis.upstash.io'],
    ['sem esquema', 'prod-vector.upstash.io', 'PROD-REDIS.upstash.io'],
  ]
  for (const [nome, vec, red] of equivalentes) {
    it(`${nome}: é PRODUÇÃO para Vector e Redis, e o dev não indexa`, () => {
      expect(isolamentoDoIndexador(prod, alvo(vec, red))).toBe('producao')
      expect(isolamentoDoCache(prod, alvo(vec, red))).toBe('producao')
      const r = podeIndexar({ banco: 'dev', indexador: isolamentoDoIndexador(prod, alvo(vec, red)), indexadorUrl: vec })
      expect(r.ok).toBe(false)
    })
  }

  it('URL ilegível no alvo não prova isolamento: conta como produção', () => {
    expect(isolamentoDoIndexador(prod, alvo('https://', 'https://'))).toBe('producao')
    expect(identidadeDoEndpoint('https://')).toBeNull()
  })

  it('controle: endpoints distintos continuam isolados e o dev indexa', () => {
    const dev = alvo('https://dev-vector.upstash.io', 'https://dev-redis.upstash.io')
    expect(isolamentoDoIndexador(prod, dev)).toBe('isolado')
    expect(isolamentoDoCache(prod, dev)).toBe('isolado')
    expect(podeIndexar({ banco: 'dev', indexador: 'isolado', indexadorUrl: dev.UPSTASH_VECTOR_REST_URL }, { url: dev.UPSTASH_VECTOR_REST_URL }).ok).toBe(true)
  })

  it('controle: produção sem URL declarada não bloqueia um dev declarado', () => {
    expect(isolamentoDoIndexador({}, alvo('https://dev-vector.upstash.io', 'https://dev-redis.upstash.io'))).toBe('isolado')
  })
})
