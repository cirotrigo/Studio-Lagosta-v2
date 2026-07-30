/**
 * Runner do banco de DESENVOLVIMENTO (branch do Neon).
 *
 * Executa um comando com `DATABASE_URL`/`DIRECT_URL` do `.env.development.local`
 * por cima do `.env`, e **recusa rodar** se o banco resolvido for o de produção.
 *
 * Por que não `dotenv -e .env.development.local -e .env -- …`:
 * o dotenv-cli **ignora em silêncio** um arquivo que não existe e cai no
 * arquivo seguinte da lista. Como o `.env` aponta para PRODUÇÃO, um
 * `.env.development.local` apagado transformaria `prisma migrate dev` — que
 * propõe **resetar o banco** — num comando contra a produção. Verificado em
 * 30/07/2026. Este runner existe para que esse caminho seja impossível:
 * arquivo de dev ausente ou apontando para o endpoint de produção = aborta
 * antes de executar qualquer coisa.
 *
 * Uso:
 *   npx tsx scripts/dev-db.ts prisma migrate dev
 *   npx tsx scripts/dev-db.ts --status      # só mostra o que cada camada resolve
 */
import { spawnSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const ROOT = process.cwd()
const PROD_ENV_FILE = resolve(ROOT, '.env')
const DEV_ENV_FILE = resolve(ROOT, '.env.development.local')
const DB_KEYS = ['DATABASE_URL', 'DIRECT_URL'] as const

function parseEnvFile(path: string): Record<string, string> {
  if (!existsSync(path)) return {}
  const out: Record<string, string> = {}
  for (const rawLine of readFileSync(path, 'utf8').split('\n')) {
    const line = rawLine.trim()
    if (!line || line.startsWith('#')) continue
    const match = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/)
    if (!match) continue
    out[match[1]] = match[2].trim().replace(/^["']|["']$/g, '')
  }
  return out
}

/**
 * Identidade do compute no Neon: o primeiro rótulo do host, sem o sufixo
 * `-pooler`. `ep-foo-123-pooler.c-2.…` e `ep-foo-123.c-2.…` são a MESMA
 * instância (pooled e direta) — comparar o host inteiro deixaria passar a URL
 * direta de produção colada no lugar da pooled.
 */
function endpointIdOf(url: string | undefined): string | null {
  if (!url) return null
  try {
    return new URL(url).hostname.split('.')[0].replace(/-pooler$/, '')
  } catch {
    return null
  }
}

function abort(title: string, lines: string[]): never {
  console.error(`\n✗ ${title}\n`)
  for (const line of lines) console.error(`  ${line}`)
  console.error('')
  process.exit(1)
}

function resolveDevEnv(): { prod: Record<string, string>; dev: Record<string, string> } {
  if (!existsSync(DEV_ENV_FILE)) {
    abort('.env.development.local não existe — nada aponta para o banco de dev.', [
      'Sem ele o comando cairia no .env, que é PRODUÇÃO.',
      '',
      'Crie o branch e o arquivo com:  npm run db:dev:setup',
    ])
  }

  const prod = parseEnvFile(PROD_ENV_FILE)
  const dev = parseEnvFile(DEV_ENV_FILE)

  const missing = DB_KEYS.filter((key) => !dev[key])
  if (missing.length > 0) {
    abort(`.env.development.local não define ${missing.join(' nem ')}.`, [
      'O comando cairia no .env (PRODUÇÃO) para essas variáveis.',
      '',
      'Rode  npm run db:dev:setup  ou preencha as duas URLs do branch à mão.',
    ])
  }

  // Guard: nenhum endpoint de dev pode ser um endpoint de produção.
  const prodEndpoints = new Set(
    DB_KEYS.map((key) => endpointIdOf(prod[key])).filter((id): id is string => id !== null),
  )
  for (const key of DB_KEYS) {
    const devEndpoint = endpointIdOf(dev[key])
    if (!devEndpoint) {
      abort(`${key} do .env.development.local não é uma URL válida.`, [
        `Valor recebido não pôde ser parseado como URL de conexão.`,
      ])
    }
    if (prodEndpoints.has(devEndpoint)) {
      abort('O "banco de dev" está apontando para o compute de PRODUÇÃO.', [
        `${key} usa o endpoint ${devEndpoint}, que é o mesmo do .env.`,
        '',
        'Isto é exatamente o acidente que este runner existe para impedir.',
        'Confira o .env.development.local: as URLs devem ser as do BRANCH do Neon.',
      ])
    }
  }

  return { prod, dev }
}

function main(): void {
  const argv = process.argv.slice(2)
  const { prod, dev } = resolveDevEnv()

  const devEndpoint = endpointIdOf(dev.DATABASE_URL)
  const prodEndpoint = endpointIdOf(prod.DATABASE_URL)

  if (argv.length === 0 || argv[0] === '--status') {
    console.log('\nBancos resolvidos:\n')
    console.log(`  produção        (.env)                   → ${prodEndpoint ?? '(não definido)'}`)
    console.log(`  desenvolvimento (.env.development.local) → ${devEndpoint}`)
    console.log('\nQuem usa qual:\n')
    console.log('  npm run dev            → DEV   (Next carrega .env.development.local primeiro)')
    console.log('  npm run db:migrate     → DEV   (via este runner)')
    console.log('  npm run db:push        → DEV   (via este runner)')
    console.log('  npm run db:reset       → DEV   (via este runner)')
    console.log('  npm run db:deploy      → PROD  (migrate deploy, caminho de produção)')
    console.log('  scripts / MCP / studio → PROD  (carregam só o .env)\n')
    if (argv.length === 0) process.exit(0)
    process.exit(0)
  }

  const env = { ...process.env, ...prod, ...dev }
  console.log(`[dev-db] banco: ${devEndpoint} (desenvolvimento) — comando: ${argv.join(' ')}`)

  const result = spawnSync(argv[0], argv.slice(1), { stdio: 'inherit', env })
  if (result.error) {
    abort(`Falha ao executar "${argv[0]}".`, [String(result.error.message)])
  }
  process.exit(result.status ?? 1)
}

main()
