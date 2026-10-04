import { test } from 'node:test'
import assert from 'node:assert/strict'
import { assertPreviewDatabaseIsolation, isPreviewSmokeRequestAllowed, assertExternalEffectsAllowed } from '../preview-isolation'

const policy = { approvedDestinations: [{ endpoint: 'ep-synthetic-stage', database: 'fixture', role: 'fixture', schema: 'public' }], productionEndpoints: ['ep-synthetic-production'] }
const connection = (endpoint: string, pooled = false) => `postgresql://fixture:synthetic@${endpoint}${pooled ? '-pooler' : ''}.c-2.us-east-1.aws.neon.tech/fixture?sslmode=require`
const env = () => ({ VERCEL_ENV: 'preview', DATABASE_URL: connection('ep-synthetic-stage', true), DIRECT_URL: connection('ep-synthetic-stage') })
test('preview aprovado usa pooled/direct do mesmo banco, sem conectar', () => assert.doesNotThrow(() => assertPreviewDatabaseIsolation(env(), policy)))
test('fora de preview mantém comportamento existente', () => assert.doesNotThrow(() => assertPreviewDatabaseIsolation({ VERCEL_ENV: 'production' }, policy)))
test('preview sem alvo aprovado falha', () => assert.throws(() => assertPreviewDatabaseIsolation(env(), { ...policy, approvedDestinations: [] })))
test('production continua proibido mesmo se incluído por engano na aprovação', () => {
  const e = env(); e.DATABASE_URL = connection('ep-synthetic-production', true); e.DIRECT_URL = connection('ep-synthetic-production')
  assert.throws(() => assertPreviewDatabaseIsolation(e, { ...policy, approvedDestinations: [...policy.approvedDestinations, { endpoint: 'ep-synthetic-production', database: 'fixture', role: 'fixture', schema: 'public' }] }))
})
for (const name of ['DATABASE_URL', 'DIRECT_URL'] as const) {
  test(`${name} ausente falha`, () => { const e = env(); delete (e as Partial<typeof e>)[name]; assert.throws(() => assertPreviewDatabaseIsolation(e, policy)) })
  test(`${name} inválida não expõe credenciais`, () => {
    const e = env(); e[name] = 'postgresql://fixture:must-not-leak@invalid-host/fixture'
    assert.throws(() => assertPreviewDatabaseIsolation(e, policy), (error: Error) => !error.message.includes('must-not-leak') && !error.message.includes('fixture:'))
  })
}
for (const [name, mutate] of [
  ['outro endpoint', (e: ReturnType<typeof env>) => { e.DIRECT_URL = connection('ep-another-stage') }],
  ['outro banco', (e: ReturnType<typeof env>) => { e.DIRECT_URL = e.DIRECT_URL.replace('/fixture?', '/another?') }],
  ['outro role', (e: ReturnType<typeof env>) => { e.DIRECT_URL = e.DIRECT_URL.replace('//fixture:', '//another:') }],
  ['direct com pooler', (e: ReturnType<typeof env>) => { e.DIRECT_URL = connection('ep-synthetic-stage', true) }],
  ['TLS desativado', (e: ReturnType<typeof env>) => { e.DIRECT_URL = e.DIRECT_URL.replace('sslmode=require', 'sslmode=disable') }],
  ['host por parâmetro', (e: ReturnType<typeof env>) => { e.DIRECT_URL += '&host=production.invalid' }],
  ['TLS duplicado', (e: ReturnType<typeof env>) => { e.DIRECT_URL += '&sslmode=disable' }],
  ['schema duplicado', (e: ReturnType<typeof env>) => { e.DIRECT_URL += '&schema=public&schema=another' }],
] as const) test(name, () => { const e = env(); mutate(e); assert.throws(() => assertPreviewDatabaseIsolation(e, policy)) })

test('smoke permite somente leitura e PUT da voz sintética aprovada', () => {
  assert.equal(isPreviewSmokeRequestAllowed(env(), '/api/subscription/status', 'GET', []), true)
  assert.equal(isPreviewSmokeRequestAllowed(env(), '/api/subscription/status', 'POST', []), false)
  assert.equal(isPreviewSmokeRequestAllowed(env(), '/api/projects/7001/voz', 'PUT', [7001]), true)
  assert.equal(isPreviewSmokeRequestAllowed(env(), '/api/projects/7001', 'GET', [7001]), true)
  for (const suffix of ['brand-dna', 'fatos']) {
    assert.equal(isPreviewSmokeRequestAllowed(env(), `/api/projects/7001/${suffix}`, 'GET', [7001]), true)
    assert.equal(isPreviewSmokeRequestAllowed(env(), `/api/projects/7001/${suffix}`, 'PUT', [7001]), false)
    assert.equal(isPreviewSmokeRequestAllowed(env(), `/api/projects/7002/${suffix}`, 'GET', [7001]), false)
  }
  assert.equal(isPreviewSmokeRequestAllowed(env(), '/api/projects/7002/voz', 'PUT', [7001]), false)
  assert.equal(isPreviewSmokeRequestAllowed(env(), '/api/projects/7001/voz', 'PUT', []), false)
})
for (const path of ['/api/projects', '/api/cron/posts', '/api/cron/backup-database', '/api/mcp', '/api/tools/generate-caption', '/api/ai/image', '/api/posts', '/api/webhooks/clerk', '/api/projects/7001/settings', '/api%2Fcron/posts', '/trpc/execute']) {
  test(`smoke bloqueia ${path}`, () => {
    for (const method of ['GET', 'POST', 'PUT', 'DELETE']) assert.equal(isPreviewSmokeRequestAllowed(env(), path, method, [7001]), false)
  })
}
test('POST de Server Action e métodos de escrita nas páginas são bloqueados', () => {
  assert.equal(isPreviewSmokeRequestAllowed(env(), '/projects/7001', 'POST', [7001]), false)
  assert.equal(isPreviewSmokeRequestAllowed(env(), '/projects/7001', 'GET', [7001]), true)
})
test('gate não altera rotas em produção', () => assert.equal(isPreviewSmokeRequestAllowed({ VERCEL_ENV: 'production' }, '/api/cron/posts', 'GET', []), true))
for (const context of [{ VERCEL: '1' }, { VERCEL: '1', VERCEL_ENV: 'unknown' }, { VERCEL_ENV: '' }]) {
  test(`contexto hospedado inválido ${JSON.stringify(context)} não chega à próxima etapa`, () => {
    let nextSteps = 0
    assert.throws(() => { assertPreviewDatabaseIsolation(context, policy); nextSteps++ })
    assert.throws(() => { assertExternalEffectsAllowed(context); nextSteps++ })
    assert.throws(() => { isPreviewSmokeRequestAllowed(context, '/api/cron/posts', 'GET', []); nextSteps++ })
    assert.equal(nextSteps, 0)
  })
}

for (const [label, replace] of [
  ['banco copiado', (url: string) => url.replace('/fixture?', '/copied_database?')],
  ['role administrativa', (url: string) => url.replace('//fixture:', '//synthetic_admin:')],
  ['schema errado', (url: string) => url + '&schema=copied_schema'],
  ['endpoint diferente', (url: string) => url.replace('ep-synthetic-stage', 'ep-other-synthetic')],
] as const) test(`duas URLs iguais entre si não aprovam ${label}`, () => {
  const e = env(); e.DATABASE_URL = replace(e.DATABASE_URL); e.DIRECT_URL = replace(e.DIRECT_URL)
  assert.throws(() => assertPreviewDatabaseIsolation(e, policy), /destino endpoint\/banco\/role\/schema não aprovado/)
})
test('schema public explícito corresponde à tupla aprovada', () => {
  const e = env(); e.DATABASE_URL += '&schema=public'; e.DIRECT_URL += '&schema=public'
  assert.doesNotThrow(() => assertPreviewDatabaseIsolation(e, policy))
})
test('otimizador bloqueado, assets locais continuam permitidos', () => {
  assert.equal(isPreviewSmokeRequestAllowed(env(), '/_next/image', 'GET', []), false)
  assert.equal(isPreviewSmokeRequestAllowed(env(), '/_next/static/chunk.js', 'GET', []), true)
  assert.equal(isPreviewSmokeRequestAllowed(env(), '/logo.png', 'GET', []), true)
})
