/**
 * Cria (ou reaproveita) o branch de DESENVOLVIMENTO no Neon e escreve o
 * `.env.development.local` com as URLs dele.
 *
 * Branch do Neon é copy-on-write: nasce instantâneo, com o schema E os dados
 * da produção no momento da criação, e escrever nele não toca no original.
 * É descartável de propósito — quando ficar velho, `--recriar` joga fora e
 * refaz a partir da produção de hoje.
 *
 * Dois caminhos:
 *   1. Com `NEON_API_KEY` no ambiente → automático.
 *   2. Sem a chave → imprime o passo a passo do console e um modelo do arquivo.
 *
 * Uso:
 *   npx tsx scripts/setup-dev-db.ts              # cria se não existir
 *   npx tsx scripts/setup-dev-db.ts --recriar    # apaga e refaz do estado atual
 *
 * NÃO altera o `.env` nem qualquer coisa de produção.
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

const ROOT = process.cwd()
const PROD_ENV_FILE = resolve(ROOT, '.env')
const DEV_ENV_FILE = resolve(ROOT, '.env.development.local')
const BRANCH_NAME = 'dev'
const NEON_API = 'https://console.neon.tech/api/v2'

const RECREATE = process.argv.includes('--recriar')

function parseEnvFile(path: string): Record<string, string> {
  if (!existsSync(path)) return {}
  const out: Record<string, string> = {}
  for (const rawLine of readFileSync(path, 'utf8').split('\n')) {
    const line = rawLine.trim()
    if (!line || line.startsWith('#')) continue
    const match = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/)
    if (match) out[match[1]] = match[2].trim().replace(/^["']|["']$/g, '')
  }
  return out
}

function endpointIdOf(url: string): string | null {
  try {
    return new URL(url).hostname.split('.')[0].replace(/-pooler$/, '')
  } catch {
    return null
  }
}

/** A URL pooled é a direta com `-pooler` no primeiro rótulo do host. */
function toPooled(directUrl: string): string {
  const url = new URL(directUrl)
  const [head, ...rest] = url.hostname.split('.')
  if (!head.endsWith('-pooler')) {
    url.hostname = [`${head}-pooler`, ...rest].join('.')
  }
  return url.toString()
}

/** Copia os parâmetros de conexão da produção (sslmode, channel_binding…). */
function withParamsFrom(target: string, reference: string): string {
  const url = new URL(target)
  const ref = new URL(reference)
  for (const [key, value] of ref.searchParams) {
    if (!url.searchParams.has(key)) url.searchParams.set(key, value)
  }
  return url.toString()
}

async function neon(apiKey: string, path: string, init?: RequestInit): Promise<any> {
  const response = await fetch(`${NEON_API}${path}`, {
    ...init,
    headers: {
      accept: 'application/json',
      'content-type': 'application/json',
      authorization: `Bearer ${apiKey}`,
      ...(init?.headers ?? {}),
    },
  })
  const body = await response.json().catch(() => ({}))
  if (!response.ok) {
    throw new Error(`Neon API ${response.status} em ${path}: ${JSON.stringify(body).slice(0, 300)}`)
  }
  return body
}

function writeDevEnvFile(pooled: string, direct: string, note: string): void {
  const content = `# Banco de DESENVOLVIMENTO — branch "${BRANCH_NAME}" do Neon.
# Gerado por scripts/setup-dev-db.ts em ${new Date().toISOString().slice(0, 10)}.
#
# O Next.js carrega este arquivo ANTES do .env.local e do .env, então
# \`npm run dev\` usa este banco. Scripts, MCP e Prisma Studio continuam
# em produção (carregam só o .env) — ver npm run db:dev:status.
#
# ${note}
# Nunca comitar: coberto por ".env*.local" no .gitignore.

DATABASE_URL=${pooled}
DIRECT_URL=${direct}
`
  writeFileSync(DEV_ENV_FILE, content, { mode: 0o600 })
}

function printManualInstructions(prodDatabaseUrl: string): void {
  const endpoint = endpointIdOf(prodDatabaseUrl)
  console.log(`
═══════════════════════════════════════════════════════════
  Banco de dev — caminho manual (sem NEON_API_KEY)
═══════════════════════════════════════════════════════════

No console do Neon (https://console.neon.tech):

  1. Abra o projeto que contém o compute ${endpoint}
  2. Branches → "Create branch"
       Nome:   ${BRANCH_NAME}
       Parent: o branch de produção (default/main), "From: current state"
  3. O branch nasce com um compute próprio. Copie as DUAS strings:
       • "Pooled connection"  → vira DATABASE_URL
       • "Direct connection"  → vira DIRECT_URL
     (a direta é a mesma URL SEM o sufixo "-pooler" no host)
  4. Cole no arquivo .env.development.local, no formato:

       DATABASE_URL=<pooled>
       DIRECT_URL=<direct>

  5. Confira com:  npm run db:dev:status

Para automatizar isto no futuro: gere uma API key em
https://console.neon.tech/app/settings/api-keys e exporte NEON_API_KEY
antes de rodar este script.
═══════════════════════════════════════════════════════════
`)
}

async function main(): Promise<void> {
  const prod = parseEnvFile(PROD_ENV_FILE)
  const prodPooled = prod.DATABASE_URL
  const prodDirect = prod.DIRECT_URL
  if (!prodPooled || !prodDirect) {
    console.error('✗ .env não tem DATABASE_URL/DIRECT_URL — nada para usar como referência.')
    process.exit(1)
  }

  if (existsSync(DEV_ENV_FILE) && !RECREATE) {
    console.log('• .env.development.local já existe.')
    console.log('  Use --recriar para refazer o branch a partir da produção de hoje.')
    console.log('  Estado atual:  npm run db:dev:status')
    return
  }

  const apiKey = process.env.NEON_API_KEY ?? parseEnvFile(resolve(ROOT, '.env.local')).NEON_API_KEY
  if (!apiKey) {
    printManualInstructions(prodPooled)
    return
  }

  const prodEndpoint = endpointIdOf(prodPooled)
  console.log(`• Procurando o projeto Neon do compute ${prodEndpoint}…`)

  const { projects } = await neon(apiKey, '/projects')
  let projectId: string | null = null
  for (const project of projects ?? []) {
    const { endpoints } = await neon(apiKey, `/projects/${project.id}/endpoints`)
    if ((endpoints ?? []).some((e: any) => e.id === prodEndpoint)) {
      projectId = project.id
      console.log(`  projeto: ${project.name} (${project.id})`)
      break
    }
  }
  if (!projectId) {
    console.error(`✗ Nenhum projeto acessível contém o compute ${prodEndpoint}.`)
    console.error('  A API key pertence a outra conta/organização?')
    process.exit(1)
  }

  const { branches } = await neon(apiKey, `/projects/${projectId}/branches`)
  const existing = (branches ?? []).find((b: any) => b.name === BRANCH_NAME)

  if (existing && RECREATE) {
    console.log(`• Apagando o branch "${BRANCH_NAME}" antigo (${existing.id})…`)
    await neon(apiKey, `/projects/${projectId}/branches/${existing.id}`, { method: 'DELETE' })
  } else if (existing) {
    console.error(`✗ O branch "${BRANCH_NAME}" já existe (${existing.id}) mas o arquivo local não.`)
    console.error('  Pegue as URLs dele no console, ou rode com --recriar para refazer.')
    process.exit(1)
  }

  const parent = (branches ?? []).find((b: any) => b.default) ?? (branches ?? [])[0]
  console.log(`• Criando o branch "${BRANCH_NAME}" a partir de ${parent?.name ?? 'default'}…`)

  const created = await neon(apiKey, `/projects/${projectId}/branches`, {
    method: 'POST',
    body: JSON.stringify({
      branch: { name: BRANCH_NAME, parent_id: parent?.id },
      endpoints: [{ type: 'read_write' }],
    }),
  })

  const rawUri: string | undefined = created.connection_uris?.[0]?.connection_uri
  if (!rawUri) {
    console.error('✗ A API criou o branch mas não devolveu connection_uri.')
    console.error('  Pegue as URLs no console e preencha o .env.development.local à mão.')
    process.exit(1)
  }

  const direct = withParamsFrom(rawUri, prodDirect)
  const pooled = withParamsFrom(toPooled(rawUri), prodPooled)

  writeDevEnvFile(pooled, direct, `Branch criado a partir de "${parent?.name ?? 'default'}".`)

  console.log(`\n✓ Branch "${BRANCH_NAME}" criado e .env.development.local escrito.`)
  console.log(`  compute de dev: ${endpointIdOf(pooled)}`)
  console.log('\n  Confira com:  npm run db:dev:status\n')
}

main().catch((error) => {
  console.error('\n✗ Falhou:', error instanceof Error ? error.message : error)
  process.exit(1)
})
