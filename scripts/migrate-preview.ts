import { spawnSync } from 'node:child_process'
import { assertPreviewMigrationIsolation } from '../src/lib/preview-isolation'
import policy from '../src/lib/preview-database-policy.json'

try {
  assertPreviewMigrationIsolation(process.env, policy)
  // Explicitly approved ephemeral executor only. Does not load dotenv or Prisma before the gate.
  process.exitCode = spawnSync('prisma', ['migrate', 'deploy'], { stdio: 'inherit' }).status ?? 1
} catch {
  console.error('Migrations Preview bloqueadas: executor ou destino não aprovado.')
  process.exitCode = 1
}
