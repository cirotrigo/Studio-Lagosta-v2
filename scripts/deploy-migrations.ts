import { spawnSync } from 'node:child_process'
import { assertHostedEnvironment } from '../src/lib/preview-isolation'

try {
  assertHostedEnvironment(process.env)
  if (process.env.VERCEL_ENV === 'preview') throw new Error('Use o executor separado de Preview.')
  process.exitCode = spawnSync('prisma', ['migrate', 'deploy'], { stdio: 'inherit' }).status ?? 1
} catch {
  console.error('db:deploy bloqueado neste contexto; Preview exige executor separado.')
  process.exitCode = 1
}
