export interface PreviewDatabasePolicy {
  approvedDestinations: readonly { endpoint: string; database: string; role: string; schema: string }[]
  approvedMigrationDestinations?: readonly { endpoint: string; database: string; role: string; schema: string }[]
  productionEndpoints: readonly string[]
}

type PreviewEnv = Record<string, string | undefined>

export function assertHostedEnvironment(env: PreviewEnv): void {
  const recognized = ['production', 'preview', 'development']
  if ((env.VERCEL === '1' || env.VERCEL_ENV !== undefined) && !recognized.includes(env.VERCEL_ENV ?? '')) {
    throw new Error('Ambiente hospedado: VERCEL_ENV ausente ou desconhecido; execução bloqueada.')
  }
}

export function previewSideEffectsAreDisabled(env: PreviewEnv): boolean {
  assertHostedEnvironment(env)
  return env.VERCEL_ENV === 'preview'
}

export function assertExternalEffectsAllowed(env: PreviewEnv): void {
  if (previewSideEffectsAreDisabled(env)) throw new Error('Preview: efeitos externos desativados no smoke da Marca.')
}

function parseConnection(value: string | undefined, name: string) {
  if (!value) throw new Error(`Preview isolado: falta ${name}.`)
  let url: URL
  try { url = new URL(value) } catch { throw new Error(`Preview isolado: ${name} inválida.`) }
  if (!['postgres:', 'postgresql:'].includes(url.protocol) ||
      !/^ep-[a-z0-9-]+\.[a-z0-9.-]+\.neon\.tech$/.test(url.hostname) ||
      url.port && url.port !== '5432' ||
      !['require', 'verify-full'].includes(url.searchParams.get('sslmode') ?? '') ||
      !url.username || !url.password || !url.pathname || url.pathname === '/') {
    throw new Error(`Preview isolado: ${name} deve usar Neon, TLS e banco explícito.`)
  }
  // Não permita parâmetros que redirecionem a conexão para outro host/porta.
  const safeParams = new Set(['sslmode', 'channel_binding', 'schema', 'pgbouncer', 'connection_limit', 'pool_timeout', 'connect_timeout'])
  const seen = new Set<string>()
  for (const key of url.searchParams.keys()) {
    if (!safeParams.has(key) || seen.has(key)) throw new Error(`Preview isolado: parâmetro não aprovado ou duplicado em ${name}.`)
    seen.add(key)
  }
  const first = url.hostname.split('.')[0]
  return { url, pooled: first.endsWith('-pooler'), endpoint: first.replace(/-pooler$/, ''),
    database: decodeURIComponent(url.pathname.slice(1)), role: decodeURIComponent(url.username),
    schema: url.searchParams.get('schema') ?? 'public' }
}

/** Smoke inicial: bloqueia efeitos externos e mutações fora da voz do projeto sintético aprovado. */
export function isPreviewSmokeRequestAllowed(
  env: PreviewEnv,
  pathname: string,
  method: string,
  approvedProjectIds: readonly number[],
): boolean {
  assertHostedEnvironment(env)
  if (env.VERCEL_ENV !== 'preview') return true
  if (pathname.startsWith('/_next/image')) return false
  if (pathname.includes('%') || pathname.startsWith('/trpc')) return false
  const read = method === 'GET' || method === 'HEAD'
  if (!pathname.toLowerCase().startsWith('/api')) return read
  if (pathname === '/api/subscription/status') return read
  const project = /^\/api\/projects\/(\d+)(?:\/(voz|logos|colors|fonts|brand-dna|fatos|assinatura|brand-style|design-system))?$/.exec(pathname)
  if (!project || !approvedProjectIds.includes(Number(project[1]))) return false
  return read || project[2] === 'voz' && method === 'PUT'
}

/** Executar antes de migrations/build e antes de construir o PrismaClient. Nunca imprime URLs. */
export function assertPreviewDatabaseIsolation(env: PreviewEnv, policy: PreviewDatabasePolicy): void {
  assertHostedEnvironment(env)
  if (env.VERCEL_ENV !== 'preview') return
  assertApprovedPreviewConnections(env, policy, 'runtime')
}

/** Separate entrypoint; context is selected by code, never by an env approval flag. */
export function assertPreviewMigrationIsolation(env: PreviewEnv, policy: PreviewDatabasePolicy): void {
  assertHostedEnvironment(env)
  if (env.VERCEL_ENV !== 'preview' || env.VERCEL === '1' || env.VERCEL_URL) {
    throw new Error('Executor de migrations Preview: somente execução separada, fora do deployment hospedado.')
  }
  assertApprovedPreviewConnections(env, policy, 'migration')
}

function assertApprovedPreviewConnections(env: PreviewEnv, policy: PreviewDatabasePolicy, context: 'runtime' | 'migration'): void {
  const pooled = parseConnection(env.DATABASE_URL, 'DATABASE_URL')
  const direct = parseConnection(env.DIRECT_URL, 'DIRECT_URL')
  if (!pooled.pooled || direct.pooled || pooled.endpoint !== direct.endpoint ||
      pooled.url.hostname.replace('-pooler.', '.') !== direct.url.hostname ||
      pooled.url.pathname !== direct.url.pathname || pooled.url.username !== direct.url.username ||
      pooled.url.searchParams.get('schema') !== direct.url.searchParams.get('schema')) {
    throw new Error('Preview isolado: DATABASE_URL e DIRECT_URL devem apontar ao mesmo banco/role/schema de teste, pooled e direct respectivamente.')
  }
  const approved = context === 'runtime' ? policy.approvedDestinations : policy.approvedMigrationDestinations ?? []
  const other = context === 'runtime' ? policy.approvedMigrationDestinations ?? [] : policy.approvedDestinations
  // A role must never be approved for both execution contexts on this endpoint.
  if (policy.productionEndpoints.includes(pooled.endpoint) ||
      other.some(destination => destination.endpoint === pooled.endpoint && destination.role === pooled.role) ||
      !approved.some(destination =>
        destination.endpoint === pooled.endpoint && destination.database === pooled.database &&
        destination.role === pooled.role && destination.schema === pooled.schema)) {
    throw new Error('Preview isolado: destino endpoint/banco/role/schema não aprovado ou reservado à produção.')
  }
}
