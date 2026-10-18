/** Metadata/integrity check only; never loads the native addon or runs a test. */
const fs = require('node:fs')
const path = require('node:path')
const crypto = require('node:crypto')
const assert = require('node:assert/strict')
const dir = process.argv[2]
const read = (p) => JSON.parse(fs.readFileSync(p, 'utf8'))
assert.equal(process.version, 'v22.23.3')
assert.equal(process.platform, 'linux')
assert.equal(process.arch, 'x64')
const expected = read(path.join(__dirname, 'candidate/package-lock.json'))
const actual = read(path.join(dir, 'package-lock.json'))
const names = ['@napi-rs/canvas', '@napi-rs/canvas-linux-x64-gnu']
for (const name of names) {
  const key = 'node_modules/' + name
  assert.equal(actual.packages[key].integrity, expected.packages[key].integrity)
  assert.equal(actual.packages[key].version, '1.0.11')
  assert.equal(read(path.join(dir, key, 'package.json')).version, '1.0.11')
}
const binary = path.join(dir, 'node_modules/@napi-rs/canvas-linux-x64-gnu/skia.linux-x64-gnu.node')
console.log(JSON.stringify({
  candidate: '1.0.11', pr238Head: '86ccab9584d52a270b58bbb47a0f4fdc4d0bdaed',
  packageIntegrity: actual.packages['node_modules/@napi-rs/canvas'].integrity,
  nativeIntegrity: actual.packages['node_modules/@napi-rs/canvas-linux-x64-gnu'].integrity,
  nativeSha256: crypto.createHash('sha256').update(fs.readFileSync(binary)).digest('hex'),
  node: process.version, platform: process.platform, arch: process.arch,
}))
