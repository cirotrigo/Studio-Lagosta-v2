import { test } from 'node:test'
import assert from 'node:assert/strict'
import { runDeploymentBuild } from '../deployment-build'
import { assertPreviewMigrationIsolation, assertPreviewDatabaseIsolation } from '../../../src/lib/preview-isolation'

const destination = { endpoint: 'ep-synthetic-stage', database: 'fixture', role: 'runtime', schema: 'public' }
const policy = { approvedDestinations: [destination], approvedMigrationDestinations: [{ ...destination, role: 'migrator' }], productionEndpoints: ['ep-synthetic-production'] }
const env = (role = 'runtime') => ({ VERCEL_ENV: 'preview', DATABASE_URL: `postgresql://${role}:synthetic@ep-synthetic-stage-pooler.c-2.us-east-1.aws.neon.tech/fixture?sslmode=require`, DIRECT_URL: `postgresql://${role}:synthetic@ep-synthetic-stage.c-2.us-east-1.aws.neon.tech/fixture?sslmode=require` })

test('Preview validates restricted URLs and builds without any migrate subprocess', () => {
  const calls: string[] = []
  assert.equal(runDeploymentBuild(env(), policy, (c, a) => { calls.push([c, ...a].join(' ')); return 0 }, () => { calls.push('clear') }), 0)
  assert.deepEqual(calls, ['clear', 'prisma generate', 'next build'])
})
test('Production keeps migration before generation/build and stops on migration failure', () => {
  for (const result of [0, 7]) {
    const calls: string[] = []
    assert.equal(runDeploymentBuild({ VERCEL_ENV: 'production' }, policy, (c, a) => { calls.push([c, ...a].join(' ')); return calls.length === 1 ? result : 0 }, () => {}), result)
    assert.deepEqual(calls, result ? ['prisma migrate deploy'] : ['prisma migrate deploy', 'prisma generate', 'next build'])
  }
})
test('Unapproved Preview/missing hosted environment never reaches cache or subprocesses', () => {
  for (const e of [env('migrator'), { VERCEL: '1' }, { ...env(), DIRECT_URL: env('migrator').DIRECT_URL }]) {
    let calls = 0
    assert.throws(() => runDeploymentBuild(e, policy, () => { calls++; return 0 }, () => { calls++ }))
    assert.equal(calls, 0)
  }
})
test('Generation failure stops Next build', () => {
  let calls = 0
  assert.equal(runDeploymentBuild(env(), policy, () => { calls++; return 3 }, () => {}), 3)
  assert.equal(calls, 1)
})
test('Separate executor accepts only migration tuple, never runtime or Production', () => {
  assert.doesNotThrow(() => assertPreviewMigrationIsolation(env('migrator'), policy))
  for (const e of [env(), { ...env('migrator'), VERCEL_ENV: 'production' }, { ...env('migrator'), VERCEL: '1' }, { ...env('migrator'), VERCEL_URL: 'fixture.vercel.app' }]) {
    assert.throws(() => assertPreviewMigrationIsolation(e, policy))
  }
})
test('Env approval flags cannot authorize a tuple absent from committed migration policy', () => {
  assert.throws(() => assertPreviewMigrationIsolation({ ...env('migrator'), PREVIEW_MIGRATION_EXECUTOR: 'true', APPROVED_DATABASE: 'fixture' }, { ...policy, approvedMigrationDestinations: [] }))
  assert.throws(() => assertPreviewMigrationIsolation(env('migrator'), { approvedDestinations: [], productionEndpoints: [] }))
})
test('Roles approved for both contexts fail closed even if other database is listed', () => {
  const duplicate = { ...policy, approvedMigrationDestinations: [{ ...destination, database: 'other' }] }
  assert.throws(() => assertPreviewDatabaseIsolation(env(), duplicate))
})
test('Copied database, schema and admin role cannot enter migration executor', () => {
  for (const change of [(url: string) => url.replace('/fixture?', '/neondb?'), (url: string) => url + '&schema=other', (url: string) => url.replace('//migrator:', '//neondb_owner:')]) {
    const e = env('migrator'); e.DATABASE_URL = change(e.DATABASE_URL); e.DIRECT_URL = change(e.DIRECT_URL)
    assert.throws(() => assertPreviewMigrationIsolation(e, policy))
  }
})
