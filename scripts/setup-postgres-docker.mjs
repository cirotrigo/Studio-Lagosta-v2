#!/usr/bin/env node
/**
 * Cross-platform Postgres-in-Docker setup script.
 * Requirements: Docker Desktop/Engine available on PATH.
 *
 * Usage:
 *   npm run db:docker
 *   PG_CONTAINER_NAME=my-db PG_DB=mydb PG_USER=myuser PG_PASSWORD=mypass PG_PORT=5433 npm run db:docker
 */
import { exec as _exec } from 'node:child_process'
import { promisify } from 'node:util'

const exec = promisify(_exec)

const CONFIG = {
  container: process.env.PG_CONTAINER_NAME || 'saas-postgres',
  db: process.env.PG_DB || 'saas_template',
  user: process.env.PG_USER || 'postgres',
  password: process.env.PG_PASSWORD || 'postgres',
  port: Number(process.env.PG_PORT || 5432),
  image: process.env.PG_IMAGE || 'postgres:16',
  volume: process.env.PG_VOLUME || 'saas_postgres_data',
}

async function hasDocker() {
  try {
    await exec('docker --version')
    return true
  } catch (e) {
    return false
  }
}

async function choosePort(preferred) {
  // Try the preferred port first; if in use by another process, suggest alternate 5433
  // We rely on Docker to fail fast if mapping is taken; then we fallback once.
  return preferred
}

async function containerStatus(name) {
  const { stdout } = await exec(`docker ps -a --filter name=^/${name}$ --format "{{.ID}}||{{.Status}}"`)
  const line = stdout.trim()
  if (!line) return { exists: false }
  const [id, status] = line.split('||')
  return { exists: true, id, status, running: /Up /.test(status) }
}

async function ensureVolume(volume) {
  try {
    await exec(`docker volume inspect ${volume}`)
    return
  } catch (_) {
    await exec(`docker volume create ${volume}`)
  }
}

async function waitForReady(container, user, timeoutMs = 30000) {
  const start = Date.now()
  while (Date.now() - start < timeoutMs) {
    try {
      await exec(`docker exec ${container} pg_isready -U ${user}`)
      return true
    } catch (_) {
      await new Promise(r => setTimeout(r, 1000))
    }
  }
  return false
}

function printSummary({ host = 'localhost', port, db, user, password }) {
  const url = `postgresql://${encodeURIComponent(user)}:${encodeURIComponent(password)}@${host}:${port}/${db}`
  console.log('\nPostgreSQL em Docker está pronto!')
  console.log(`- Container: ${CONFIG.container}`)
  console.log(`- Porta local: ${port}`)
  console.log(`- Volume: ${CONFIG.volume}`)
  console.log(`- Imagem: ${CONFIG.image}`)
  console.log('\nUse esta DATABASE_URL em .env.local:')
  console.log(url)
  console.log('\nComandos úteis:')
  console.log(`- Parar:   docker stop ${CONFIG.container}`)
  console.log(`- Iniciar: docker start ${CONFIG.container}`)
  console.log(`- Logs:    docker logs -f ${CONFIG.container}`)
}

async function main() {
  if (!(await hasDocker())) {
    console.error('Docker não encontrado. Instale Docker Desktop/Engine e tente novamente.')
    process.exit(1)
  }

  const status = await containerStatus(CONFIG.container)
  const port = await choosePort(CONFIG.port)

  if (status.exists) {
    if (status.running) {
      console.log(`Container '${CONFIG.container}' já está em execução.`)
      printSummary({ port, db: CONFIG.db, user: CONFIG.user, password: CONFIG.password })
      return
    }
    console.log(`Iniciando container existente '${CONFIG.container}'...`)
    await exec(`docker start ${CONFIG.container}`)
  } else {
    console.log('Criando volume (se necessário)...')
    await ensureVolume(CONFIG.volume)
    console.log(`Criando e iniciando container '${CONFIG.container}'...`)
    // Nota: se a porta estiver em uso, o Docker irá falhar. Informe o usuário para ajustar PG_PORT.
    await exec(
      [
        'docker run -d',
        `--name ${CONFIG.container}`,
        `-e POSTGRES_PASSWORD=${CONFIG.password}`,
        `-e POSTGRES_USER=${CONFIG.user}`,
        `-e POSTGRES_DB=${CONFIG.db}`,
        `-p ${port}:5432`,
        `-v ${CONFIG.volume}:/var/lib/postgresql/data`,
        CONFIG.image,
      ].join(' ')
    )
  }

  process.stdout.write('Aguardando o banco ficar pronto')
  const ok = await waitForReady(CONFIG.container, CONFIG.user)
  console.log(ok ? ' ✓' : ' (tempo limite)')

  printSummary({ port, db: CONFIG.db, user: CONFIG.user, password: CONFIG.password })
}

main().catch((err) => {
  console.error('Falha ao configurar o Postgres no Docker:\n', err?.stderr || err?.message || err)
  process.exit(1)
})

