import { assertPreviewDatabaseIsolation, type PreviewDatabasePolicy } from '../../src/lib/preview-isolation'

type Env = Record<string, string | undefined>
export function runDeploymentBuild(env: Env, policy: PreviewDatabasePolicy, run: (command: string, args: string[]) => number, clearCache: () => void): number {
  // Before cache work, subprocesses, Prisma loading or any connection.
  assertPreviewDatabaseIsolation(env, policy)
  clearCache()
  if (env.VERCEL_ENV !== 'preview') {
    const migrationStatus = run('prisma', ['migrate', 'deploy'])
    // Preserve existing Production failure semantics and local fallback.
    if (migrationStatus !== 0 && env.VERCEL_ENV === 'production') return migrationStatus
    if (migrationStatus !== 0) console.error('prisma migrate deploy falhou; comportamento local existente mantido.')
  }
  const generateStatus = run('prisma', ['generate'])
  if (generateStatus !== 0) return generateStatus
  return run('next', ['build'])
}
