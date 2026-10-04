import { spawnSync } from 'node:child_process'
import { rmSync } from 'node:fs'
import policy from '../src/lib/preview-database-policy.json'
import { runDeploymentBuild } from './lib/deployment-build'

try {
  process.exitCode = runDeploymentBuild(process.env, policy,
    (command, args) => spawnSync(command, args, { stdio: 'inherit' }).status ?? 1,
    () => rmSync('.next/cache', { recursive: true, force: true }))
} catch {
  console.error('Build bloqueado: ambiente ou destino de Preview não aprovado.')
  process.exitCode = 1
}
